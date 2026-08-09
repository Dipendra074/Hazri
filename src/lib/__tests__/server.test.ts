import { describe, expect, test } from "bun:test";
import { rejectHtmlAssetFallback } from "../../server";

const htmlResponse = (status = 200) =>
  new Response("<!doctype html><title>Hazri</title>", {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

describe("rejectHtmlAssetFallback", () => {
  test.each([
    "/assets/app.js",
    "/assets/app.mjs",
    "/assets/app.css",
    "/assets/app.js.map",
    "/data/config.json",
    "/manifest.webmanifest",
    "/fonts/geist.woff2",
    "/fonts/hazri.otf",
    "/images/icon.png",
    "/images/profile.JPEG",
    "/images/logo.svg",
  ])("replaces an HTML fallback for %s with a plain, non-sniffable 404", (path) => {
    const result = rejectHtmlAssetFallback(
      new Request(`https://hazri.example${path}?v=stale`),
      htmlResponse(200),
    );

    expect(result.status).toBe(404);
    expect(result.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.get("cache-control")).toBe("no-store");
  });

  test("also replaces the router's HTML 404 response", () => {
    const result = rejectHtmlAssetFallback(
      new Request("https://hazri.example/assets/missing.js"),
      htmlResponse(404),
    );

    expect(result.status).toBe(404);
    expect(result.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  test("passes through valid non-HTML asset responses", () => {
    const response = new Response("export default true", {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });

    expect(
      rejectHtmlAssetFallback(new Request("https://hazri.example/assets/app.js"), response),
    ).toBe(response);
  });

  test("passes through navigation HTML and non-GET server behavior", () => {
    const navigationResponse = htmlResponse();
    expect(
      rejectHtmlAssetFallback(new Request("https://hazri.example/today"), navigationResponse),
    ).toBe(navigationResponse);

    const postResponse = htmlResponse();
    expect(
      rejectHtmlAssetFallback(
        new Request("https://hazri.example/report.json", { method: "POST" }),
        postResponse,
      ),
    ).toBe(postResponse);
  });

  test("returns no body for HEAD requests", async () => {
    const result = rejectHtmlAssetFallback(
      new Request("https://hazri.example/assets/missing.css", { method: "HEAD" }),
      htmlResponse(),
    );

    expect(result.status).toBe(404);
    expect(await result.text()).toBe("");
  });
});
