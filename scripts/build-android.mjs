import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, ".output", "public");
const ANDROID_DIR = path.join(ROOT, ".output", "android");
const SHELL = path.join(PUBLIC_DIR, "_shell.html");

async function buildAndroidAssets() {
  const html = await readFile(SHELL, "utf8");

  await rm(ANDROID_DIR, { recursive: true, force: true });
  await mkdir(ANDROID_DIR, { recursive: true });
  await cp(PUBLIC_DIR, ANDROID_DIR, {
    recursive: true,
    filter(source) {
      const name = path.basename(source);
      return !["_headers", "_shell.html", "manifest.webmanifest", "offline.html", "sw.js"].includes(
        name,
      );
    },
  });

  const nativeHtml = html
    .replace(/<link[^>]+rel=["']manifest["'][^>]*>/gi, "")
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<link[^>]+href=["']https:\/\/fonts\.googleapis\.com[^"']*["'][^>]*>/gi, "")
    .replace(/<link[^>]+href=["']https:\/\/fonts\.gstatic\.com[^"']*["'][^>]*>/gi, "")
    .replace(
      "</head>",
      '<meta name="format-detection" content="telephone=no"><meta name="hazri-runtime" content="android"></head>',
    );

  await writeFile(path.join(ANDROID_DIR, "index.html"), nativeHtml, "utf8");
  console.log("[android-build] Packaged bundled web assets in .output/android");
}

buildAndroidAssets().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
