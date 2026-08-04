/**
 * Render a static entry point for the Capacitor shell.
 *
 * `capacitor.config.ts` points `webDir` at `.output/public`, but an SSR build
 * puts no `index.html` there — the HTML is produced per request by the worker.
 * So `bunx cap sync` was copying a directory with no entry point, and the
 * native app had nothing to open. That has been true since the native shell was
 * added; the web build was never the problem.
 *
 * A phone has no server, so the fix is to render the shell once at build time
 * and write it next to the assets it references. The router hydrates from it
 * and every subsequent navigation is client-side, which is what the native app
 * wants anyway.
 *
 * Usage: node scripts/prerender-shell.mjs [outputDir]
 */

import { writeFile, access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const OUTPUT_DIR = process.argv[2] ?? ".output";
const WORKER = path.resolve(OUTPUT_DIR, "server/index.mjs");
const SHELL = path.resolve(OUTPUT_DIR, "public/index.html");

/** The worker is a Cloudflare module; give it the context shape it expects. */
const executionContext = { waitUntil() {}, passThroughOnException() {} };

async function main() {
  try {
    await access(WORKER);
  } catch {
    throw new Error(`No server build at ${WORKER}. Run \`bun run build\` first.`);
  }

  const module = await import(pathToFileURL(WORKER).href);
  const worker = module.default ?? module;

  const response = await worker.fetch(new Request("http://localhost/"), {}, executionContext);
  if (!response.ok) {
    throw new Error(`Shell render returned ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  if (!html.includes("<script")) {
    throw new Error("Rendered shell contains no script tags — it would not hydrate.");
  }

  await writeFile(SHELL, html, "utf8");
  console.log(`Wrote ${SHELL} (${(html.length / 1024).toFixed(1)} kB)`);
}

await main();
// The worker keeps a stream-cleanup timer alive; nothing is left to do.
process.exit(0);
