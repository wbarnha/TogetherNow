import "./lib/error-capture";

import { consumeCapturedError, withErrorCapture } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { applySecurityHeaders, createNonce, withNonce } from "./lib/security";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return errorResponse();
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function errorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const nonce = createNonce();
    const url = new URL(request.url);
    const dev = import.meta.env.DEV;

    // Every response leaves through here, so this is the one place that can
    // guarantee the security headers are present whatever the route did — and
    // the one place that can bind a fresh CSP nonce to the request.
    const respond = (response: Response) => applySecurityHeaders(response, { nonce, url, dev });

    return withErrorCapture(() =>
      withNonce(nonce, async () => {
        try {
          const handler = await getServerEntry();
          const response = await handler.fetch(request, env, ctx);
          return respond(await normalizeCatastrophicSsrResponse(response));
        } catch (error) {
          console.error(error);
          return respond(errorResponse());
        }
      }),
    );
  },
};
