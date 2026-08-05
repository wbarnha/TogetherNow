/**
 * Remove whole elements from a document, by scanning it rather than by matching
 * a regular expression against it.
 *
 * This exists for scripts/build-pages.mjs, which turns the server-rendered
 * privacy policy into a standalone page for GitHub Pages. That page must carry
 * no JavaScript: the app bundle would hydrate a router that believes it is at
 * `/privacy` while the page is served from `/<repo>/privacy/`, the route would
 * not match, and the policy would be replaced by whatever the router does with
 * an unknown path — a blank page, discovered by a store reviewer.
 *
 * The obvious `html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")` is wrong in
 * ways that matter here, and CodeQL is right to flag it: it misses `<SCRIPT>`,
 * it misses `</script >`, and it stops early on a `>` inside a quoted attribute
 * value. Any one of those leaves a live script in a page that is supposed to
 * have none.
 *
 * A single pass is both simpler and exact. The rules below are the HTML
 * tokenizer's own:
 *
 *  - tag names are ASCII case-insensitive;
 *  - a `>` inside a quoted attribute value does not end the tag;
 *  - script content is raw text that ends at the first `</script`, regardless of
 *    what precedes it — no nesting, no comments, no escaping.
 *
 * This is deliberately not a general-purpose sanitiser and must not be used as
 * one. It removes named elements from markup this repository generated. Nothing
 * here defends against hostile input; see src/lib/app/places.ts for the paths
 * that do handle untrusted markup.
 */

/** True when `html` has `name` starting at `at`, as a tag rather than a prefix. */
function tagStartsAt(html: string, at: number, name: string, closing: boolean): boolean {
  let i = at;
  if (html[i] !== "<") return false;
  i += 1;
  if (closing) {
    if (html[i] !== "/") return false;
    i += 1;
  }
  if (html.slice(i, i + name.length).toLowerCase() !== name) return false;
  // The name has to end here, or `<scriptish>` would look like `<script>`.
  const after = html[i + name.length];
  return after === undefined || after === ">" || after === "/" || /\s/.test(after);
}

/**
 * Index just past the `>` closing the tag that starts at `from`, or -1 if the
 * tag is never closed. Quoted attribute values are skipped, so a `>` inside one
 * does not end the tag early.
 */
function endOfTag(html: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < html.length; i += 1) {
    const ch = html[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i + 1;
    }
  }
  return -1;
}

/** Index of the next `<name` / `</name` at or after `from`, or -1. */
function findTag(html: string, name: string, from: number, closing: boolean): number {
  for (let i = html.indexOf("<", from); i !== -1; i = html.indexOf("<", i + 1)) {
    if (tagStartsAt(html, i, name, closing)) return i;
  }
  return -1;
}

/**
 * Drop every `<script>…</script>`, including its content.
 *
 * An unterminated script takes the rest of the document with it, which is what
 * a browser does too: everything after an unclosed `<script>` is script data,
 * not markup.
 */
export function stripScriptElements(html: string): string {
  let out = "";
  let i = 0;

  for (;;) {
    const start = findTag(html, "script", i, false);
    if (start === -1) return out + html.slice(i);

    out += html.slice(i, start);

    const afterOpen = endOfTag(html, start);
    if (afterOpen === -1) return out;

    const close = findTag(html, "script", afterOpen, true);
    if (close === -1) return out;

    const afterClose = endOfTag(html, close);
    i = afterClose === -1 ? html.length : afterClose;
  }
}

/**
 * Drop every void element named `name` whose source text `shouldRemove` accepts.
 *
 * The predicate is handed the tag's full source, so a caller can select on an
 * attribute without this needing to parse attributes.
 */
export function stripVoidElements(
  html: string,
  name: string,
  shouldRemove: (tag: string) => boolean,
): string {
  let out = "";
  let i = 0;

  for (;;) {
    const start = findTag(html, name, i, false);
    if (start === -1) return out + html.slice(i);

    const end = endOfTag(html, start);
    if (end === -1) return out + html.slice(i);

    const tag = html.slice(start, end);
    out += html.slice(i, start);
    if (!shouldRemove(tag)) out += tag;
    i = end;
  }
}

/**
 * Replace matching elements with their own contents, dropping only the tags.
 *
 * Used for links into the running app, which cannot work from a static page:
 * the words are worth keeping, the link is not. Assumes the element does not
 * nest inside itself, which is true of the anchors this is used on — HTML
 * forbids an `<a>` inside an `<a>`.
 */
export function unwrapElements(
  html: string,
  name: string,
  shouldUnwrap: (tag: string) => boolean,
): string {
  let out = "";
  let i = 0;

  for (;;) {
    const start = findTag(html, name, i, false);
    if (start === -1) return out + html.slice(i);

    const afterOpen = endOfTag(html, start);
    if (afterOpen === -1) return out + html.slice(i);

    out += html.slice(i, start);

    if (!shouldUnwrap(html.slice(start, afterOpen))) {
      out += html.slice(start, afterOpen);
      i = afterOpen;
      continue;
    }

    const close = findTag(html, name, afterOpen, true);
    if (close === -1) {
      // No closing tag: keep what follows as content rather than losing it.
      out += html.slice(afterOpen);
      return out;
    }
    const afterClose = endOfTag(html, close);
    out += html.slice(afterOpen, close);
    i = afterClose === -1 ? html.length : afterClose;
  }
}

/**
 * Whether any live `<script>` remains — the post-condition the page build
 * asserts, kept here so it uses the same notion of a tag as the removal does.
 */
export function hasScriptElement(html: string): boolean {
  return findTag(html, "script", 0, false) !== -1;
}
