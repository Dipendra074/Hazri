import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

const ASSET_LIKE_PATH =
  /\.(?:js|mjs|css|map|json|webmanifest|woff2?|ttf|otf|eot|apng|avif|bmp|gif|heic|heif|ico|jpe?g|jxl|png|svg|tiff?|webp)$/i;
const HTML_CONTENT_TYPE = /^text\/html(?:\s*;|$)/i;

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

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Static files are served before this SSR entry in both Nitro's Vercel output
 * and Vite development. If an asset-like GET/HEAD reaches this wrapper and the
 * app router answers with HTML, the file was not found; never let that HTML be
 * parsed as JavaScript, CSS, a font, or an image.
 */
export function rejectHtmlAssetFallback(request: Request, response: Response): Response {
  if (request.method !== "GET" && request.method !== "HEAD") return response;

  const pathname = new URL(request.url).pathname;
  const contentType = response.headers.get("content-type") ?? "";
  if (!ASSET_LIKE_PATH.test(pathname) || !HTML_CONTENT_TYPE.test(contentType)) {
    return response;
  }

  return new Response(request.method === "HEAD" ? null : "Not Found", {
    status: 404,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalizedResponse = await normalizeCatastrophicSsrResponse(response);
      return rejectHtmlAssetFallback(request, normalizedResponse);
    } catch (error) {
      console.error(error);
      const response = new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
      return rejectHtmlAssetFallback(request, response);
    }
  },
};
