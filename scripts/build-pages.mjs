/**
 * Build the small static site published to GitHub Pages.
 *
 * Both stores require a reachable privacy policy URL, and Apple requires a
 * working support URL. Those used to point at togethernow.app, a domain this
 * project does not own — and the support one at a path that never existed in
 * the first place. This is what makes them real.
 *
 * The policy is NOT rewritten here. It is rendered from `src/routes/privacy.tsx`
 * through the built worker, the same way scripts/prerender-shell.mjs renders the
 * Capacitor shell, so there is exactly one copy of it. A second hand-maintained
 * policy would drift from the code it describes, and the whole point of keeping
 * it in the app was that its claims sit next to what enforces them.
 *
 * The app itself is deliberately not published here. Every asset it emits is
 * referenced absolutely (`/assets/...`), which a project Pages site serving from
 * `/<repo>/` would 404 on, and fixing that means a second build with its own
 * base path — while the Capacitor build needs the base to stay `/`. So this
 * ships the two pages the stores actually ask for, plus a 404 that makes a
 * stale invite link explain itself.
 *
 * Runs under bun, not node: it imports the TypeScript helper above.
 *
 * Usage: bun scripts/build-pages.mjs [outDir]   (default: dist-pages)
 */

import { mkdir, writeFile, readFile, readdir, copyFile, rm, access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Written in TypeScript, under test, and shared with nothing else — it exists
// because doing this with a regular expression was wrong in three separate
// ways. Imported from source, which is why this script runs under bun.
import {
  hasScriptElement,
  stripScriptElements,
  stripVoidElements,
  unwrapElements,
} from "../src/lib/html-strip.ts";

const OUT = path.resolve(process.argv[2] ?? "dist-pages");
const BUILD = path.resolve(".output");
const WORKER = path.join(BUILD, "server/index.mjs");
const PUBLIC = path.join(BUILD, "public");

const REPO = "https://github.com/wbarnha/TogetherNow";
const config = JSON.parse(await readFile("native/app.json", "utf8"));

/** The worker is a Cloudflare module; give it the context shape it expects. */
const executionContext = { waitUntil() {}, passThroughOnException() {} };

async function render(route) {
  const module = await import(pathToFileURL(WORKER).href);
  const worker = module.default ?? module;
  const response = await worker.fetch(
    new Request(`http://localhost${route}`),
    {},
    executionContext,
  );
  if (!response.ok) throw new Error(`${route} rendered ${response.status}`);
  return response.text();
}

/**
 * Turn a server-rendered page into a standalone one.
 *
 * Scripts go first and they have to: the bundle would hydrate a router that
 * believes it is at `/privacy`, while the page is actually served from
 * `/<repo>/privacy/`. The route would not match and the policy would be
 * replaced by whatever the router does with an unknown path. A policy is static
 * text, so nothing is lost by shipping it without JavaScript — and it loads
 * faster for the reviewer who has to read it.
 *
 * The element removals go through src/lib/html-strip.ts rather than a regular
 * expression. A regex here missed `<SCRIPT>`, missed `</script >`, and kept
 * everything after an unterminated `<script>` — each of which leaves a live
 * script in the page this is supposed to strip clean. That module scans the
 * markup instead, and its tests cover exactly those cases.
 */
function standalone(html) {
  let out = stripScriptElements(html);
  out = stripVoidElements(out, "link", (tag) => tag.includes("modulepreload"));
  // The app manifest describes the installable app, not this page.
  out = stripVoidElements(out, "link", (tag) => tag.includes('rel="manifest"'));
  // Server-side nonces are meaningless once the CSP that issued them is gone.
  out = out.replaceAll(/ nonce="[^"]*"/g, "");

  // Assets are one directory up, because this page is written to `privacy/`.
  out = out
    .replaceAll(/(?:src|href)="\/assets\/styles-[^"]*\.css"/g, 'href="../assets/styles.css"')
    .replaceAll(/(src|href)="\/(fonts\/[^"]*)"/g, '$1="../$2"')
    .replaceAll(/(src|href)="\/(favicon\.png|apple-touch-icon\.png)"/g, '$1="../$2"');

  // Links into the running app cannot work from a static page. Keep the words,
  // drop the link, rather than shipping something that 404s when clicked.
  return unwrapElements(out, "a", (tag) => /href="\/[^"]*"/.test(tag));
}

/** Every asset the standalone policy still points at. */
async function copyAssets() {
  await mkdir(path.join(OUT, "assets"), { recursive: true });
  await mkdir(path.join(OUT, "fonts"), { recursive: true });

  const assets = await readdir(path.join(PUBLIC, "assets"));
  const css = assets.find((f) => /^styles-.*\.css$/.test(f));
  if (!css) throw new Error("No styles-*.css in the build; the policy would be unstyled.");

  // The stylesheet moves but the fonts do not, and url() resolves against the
  // stylesheet's own location, so this rewrite has to happen here rather than
  // in the HTML.
  const sheet = await readFile(path.join(PUBLIC, "assets", css), "utf8");
  await writeFile(
    path.join(OUT, "assets/styles.css"),
    sheet.replaceAll("url(/fonts/", "url(../fonts/"),
  );

  for (const font of await readdir(path.join(PUBLIC, "fonts"))) {
    await copyFile(path.join(PUBLIC, "fonts", font), path.join(OUT, "fonts", font));
  }
  for (const icon of ["favicon.png", "apple-touch-icon.png"]) {
    await copyFile(path.join(PUBLIC, icon), path.join(OUT, icon)).catch(() => {});
  }
  return css;
}

/** Shared chrome for the two pages that are not rendered from the app. */
function page({ title, description, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="${description}"/>
<link rel="icon" href="favicon.png" type="image/png"/>
<link rel="apple-touch-icon" href="apple-touch-icon.png"/>
<style>
  :root { color-scheme: light dark; --fg:#1c1917; --muted:#57534e; --bg:#faf8f6; --card:#fff; --line:#e7e5e4; --accent:#b45309; }
  @media (prefers-color-scheme: dark) {
    :root { --fg:#f5f5f4; --muted:#a8a29e; --bg:#1c1917; --card:#292524; --line:#44403c; --accent:#fbbf24; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:2.5rem 1.25rem 4rem; background:var(--bg); color:var(--fg);
         font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:44rem; margin:0 auto; }
  h1 { font-size:2rem; line-height:1.2; margin:0 0 .5rem; letter-spacing:-.02em; }
  h2 { font-size:1.15rem; margin:2.25rem 0 .5rem; }
  p, li { color:var(--muted); }
  a { color:var(--accent); }
  .lede { font-size:1.05rem; color:var(--muted); margin:0 0 2rem; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:.75rem; padding:1.1rem 1.25rem; margin:1rem 0; }
  .card p:last-child, .card ul:last-child { margin-bottom:0; }
  ul { padding-left:1.15rem; }
  footer { margin-top:3rem; padding-top:1.25rem; border-top:1px solid var(--line); font-size:.9rem; color:var(--muted); }
</style>
</head>
<body><main>
${body}
<footer>
  <a href="${REPO}">Source on GitHub</a> &middot;
  <a href="${config.supportUrl}">Support</a> &middot;
  <a href="privacy/">Privacy</a>
</footer>
</main></body>
</html>
`;
}

const landing = page({
  title: config.appName,
  description:
    "A private app for long-distance couples. No accounts, no server: everything stays on your own phone.",
  body: `<h1>${config.appName}</h1>
<p class="lede">A private app for two people in different places &mdash; a shared calendar,
milestone countdowns, date ideas, travel planning, shared money tools and daily mood
check-ins with home-screen widgets.</p>

<div class="card">
  <p><strong>There is no account and no server.</strong> Everything you enter stays in the
  app's own storage on your device. Partners exchange data directly with share codes, by
  QR or as text. Nothing is uploaded, so nothing can be leaked from a service that does
  not exist.</p>
</div>

<h2>Getting it</h2>
<p>It is not in either store. <a href="${REPO}/blob/main/SIDELOAD.md">SIDELOAD.md</a>
explains how to install it on Android and iOS, including what Apple's free
account limits mean in practice.</p>

<h2>Questions or problems</h2>
<p>Open an issue: <a href="${config.supportUrl}">${config.supportUrl.replace(/^https?:\/\//, "")}</a></p>`,
});

// GitHub Pages serves this for any path it does not have a file for, which on
// this site is every path except `/` and `/privacy/`. The one worth handling is
// an invite link: those point at `/pair` and carry the pairing code in the URL
// fragment. Landing on a bare "404" would leave the recipient with no idea what
// they were sent or what to do with it.
const notFound = page({
  title: `Not found — ${config.appName}`,
  description: "That page is not on this site.",
  body: `<h1>Nothing here</h1>
<p class="lede" id="lede">This site only hosts the privacy policy and this note.
The app itself runs on your phone.</p>

<div class="card" id="invite" hidden>
  <p><strong>This looks like an invite link.</strong> It carries a pairing code, and only
  the ${config.appName} app can read it &mdash; there is no web version to open it in.</p>
  <p>Install the app (see <a href="${REPO}/blob/main/SIDELOAD.md">SIDELOAD.md</a>), then
  open <em>You two &rarr; Share or import a code</em> and paste the code your partner sent
  you. The code is the part of that link after the <code>#</code>.</p>
</div>

<p><a href="./">Go to the start page</a></p>

<script>
  // The fragment holds the couple's entire shared archive, so this only checks
  // whether one is present. It is never read out, never shown, and never sent
  // anywhere — a fragment is not transmitted to the server in the first place.
  if (location.hash.indexOf("code=") !== -1 || /\\/pair\\/?$/.test(location.pathname)) {
    document.getElementById("invite").hidden = false;
    document.getElementById("lede").hidden = true;
  }
</script>`,
});

async function main() {
  try {
    await access(WORKER);
  } catch {
    throw new Error(`No server build at ${WORKER}. Run \`bun run build\` first.`);
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, "privacy"), { recursive: true });

  const css = await copyAssets();
  const policy = standalone(await render("/privacy"));

  // Prove the page is actually standalone rather than trusting the rewrites:
  // one absolute reference left behind is one 404 under the /<repo>/ base, and
  // an unstyled or blanked-out policy is exactly what a store reviewer sees.
  const leftover = [...policy.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  if (leftover.length) {
    throw new Error(`Absolute references survived into the policy page: ${leftover.join(", ")}`);
  }
  if (hasScriptElement(policy)) throw new Error("Script tags survived into the policy page.");
  if (!policy.includes("../assets/styles.css")) {
    throw new Error("The policy page does not link the stylesheet; it would render unstyled.");
  }

  await writeFile(path.join(OUT, "privacy/index.html"), policy);
  await writeFile(path.join(OUT, "index.html"), landing);
  await writeFile(path.join(OUT, "404.html"), notFound);
  // Pages runs Jekyll otherwise, which strips files and directories beginning
  // with an underscore.
  await writeFile(path.join(OUT, ".nojekyll"), "");

  console.log(`Wrote ${path.relative(process.cwd(), OUT)}/`);
  console.log(`  index.html          landing`);
  console.log(
    `  privacy/index.html  rendered from src/routes/privacy.tsx (${policy.length} bytes)`,
  );
  console.log(`  404.html            catches invite links`);
  console.log(`  assets/styles.css   from ${css}`);
}

await main();
