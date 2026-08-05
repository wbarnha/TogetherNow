import { describe, expect, it } from "vitest";

import {
  hasScriptElement,
  stripScriptElements,
  stripVoidElements,
  unwrapElements,
} from "../html-strip";

/**
 * These are the cases the regex this replaced got wrong. Each one, left
 * unhandled, ships a live script in a page that is required to have none — and
 * the symptom is a privacy policy that renders blank for a store reviewer,
 * with nothing in the build to say so.
 */
describe("stripScriptElements", () => {
  it("removes a plain script and its content", () => {
    expect(stripScriptElements(`<p>a</p><script>alert(1)</script><p>b</p>`)).toBe(
      `<p>a</p><p>b</p>`,
    );
  });

  it("removes an uppercase or mixed-case script", () => {
    // `/<script/g` misses this entirely. Tag names are ASCII case-insensitive.
    expect(stripScriptElements(`<p>a</p><SCRIPT>x()</SCRIPT><p>b</p>`)).toBe(`<p>a</p><p>b</p>`);
    expect(stripScriptElements(`<ScRiPt>x()</sCrIpT>`)).toBe("");
  });

  it("removes a script whose closing tag carries whitespace", () => {
    // `</script>` is not the only spelling a parser accepts.
    expect(stripScriptElements(`<script>x()</script >`)).toBe("");
    expect(stripScriptElements(`<script>x()</script\n>`)).toBe("");
  });

  it("is not fooled by a > inside a quoted attribute", () => {
    // `[^>]*` ends the opening tag at the first `>`, which here is inside the
    // attribute value — leaving the rest of the script as live markup.
    const html = `<script data-x="a>b" src="/x.js"></script><p>keep</p>`;
    expect(stripScriptElements(html)).toBe(`<p>keep</p>`);
  });

  it("does not touch elements that merely start with the same letters", () => {
    const html = `<scripture>text</scripture>`;
    expect(stripScriptElements(html)).toBe(html);
  });

  it("removes every script, not just the first", () => {
    expect(stripScriptElements(`<script>a</script>M<script>b</script>`)).toBe("M");
  });

  it("drops the remainder of an unterminated script, as a browser would", () => {
    // Everything after an unclosed <script> is script data, not markup, so
    // keeping it would put executable text back into the page.
    expect(stripScriptElements(`<p>a</p><script>never closed`)).toBe(`<p>a</p>`);
  });

  it("leaves markup with no scripts untouched", () => {
    const html = `<h1>Privacy</h1><p>Nothing leaves the device.</p>`;
    expect(stripScriptElements(html)).toBe(html);
  });

  it("agrees with hasScriptElement", () => {
    for (const html of [
      `<script>a</script>`,
      `<SCRIPT src="x"></SCRIPT>`,
      `<p>a</p><script data-x="a>b">y</script>`,
      `<scripture>no</scripture>`,
      `<p>plain</p>`,
    ]) {
      expect(hasScriptElement(stripScriptElements(html))).toBe(false);
    }
    expect(hasScriptElement(`<p>a</p><SCRIPT>x</SCRIPT>`)).toBe(true);
    expect(hasScriptElement(`<scripture>no</scripture>`)).toBe(false);
  });
});

describe("stripVoidElements", () => {
  const isPreload = (tag: string) => tag.includes("modulepreload");

  it("removes only the links the predicate accepts", () => {
    const html =
      `<link rel="stylesheet" href="/s.css"/>` +
      `<link rel="modulepreload" href="/a.js"/>` +
      `<link rel="icon" href="/f.png"/>`;
    expect(stripVoidElements(html, "link", isPreload)).toBe(
      `<link rel="stylesheet" href="/s.css"/><link rel="icon" href="/f.png"/>`,
    );
  });

  it("matches case-insensitively", () => {
    expect(stripVoidElements(`<LINK rel="modulepreload" href="/a.js">`, "link", isPreload)).toBe(
      "",
    );
  });

  it("is not fooled by a > inside a quoted attribute", () => {
    const html = `<link rel="modulepreload" data-x="a>b" href="/a.js"/><p>keep</p>`;
    expect(stripVoidElements(html, "link", isPreload)).toBe(`<p>keep</p>`);
  });

  it("leaves everything alone when nothing matches", () => {
    const html = `<link rel="stylesheet" href="/s.css"/>`;
    expect(stripVoidElements(html, "link", isPreload)).toBe(html);
  });
});

describe("unwrapElements", () => {
  const isInternal = (tag: string) => /href="\/[^"]*"/.test(tag);

  it("keeps the text of an internal link but drops the link", () => {
    expect(unwrapElements(`clear it from <a href="/settings">Settings</a>.`, "a", isInternal)).toBe(
      `clear it from Settings.`,
    );
  });

  it("leaves external links intact", () => {
    const html = `<a href="https://example.test/x">out</a>`;
    expect(unwrapElements(html, "a", isInternal)).toBe(html);
  });

  it("handles several links, unwrapping only the internal ones", () => {
    const html = `<a href="/a">A</a> and <a href="https://example.test">B</a> and <a href="/c">C</a>`;
    expect(unwrapElements(html, "a", isInternal)).toBe(
      `A and <a href="https://example.test">B</a> and C`,
    );
  });

  it("is not fooled by a > inside a quoted attribute", () => {
    expect(unwrapElements(`<a href="/x" data-t="a>b">T</a>`, "a", isInternal)).toBe("T");
  });

  it("keeps the content when the closing tag is missing", () => {
    expect(unwrapElements(`<a href="/x">tail`, "a", isInternal)).toBe("tail");
  });
});
