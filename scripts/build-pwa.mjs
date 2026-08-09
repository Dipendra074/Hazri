import { createHash } from "node:crypto";
import { readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateSW, getManifest } from "workbox-build";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..");
const SHELL = "_shell.html";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const REQUIRED_ROUTES = ["today", "schedule", "attendance", "planner", "more"];
const CACHEABLE_EXTENSIONS = new Set([
  ".avif",
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".mjs",
  ".otf",
  ".png",
  ".svg",
  ".ttf",
  ".wasm",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
]);
const GENERATED_RE = /^(?:sw\.js(?:\.map)?|workbox-[\w-]+\.js(?:\.map)?|\.sw-[\w.-]+\.js)$/;

function fail(message) {
  throw new Error(`[pwa-build] ${message}`);
}

function posix(value) {
  return value.split(path.sep).join("/");
}

function cleanUrl(value) {
  return decodeURIComponent(
    String(value).replace(/^\/+/, "").replaceAll("\\", "/").split(/[?#]/, 1)[0],
  );
}

function isCacheable(file) {
  const name = path.posix.basename(posix(file));
  return (
    CACHEABLE_EXTENSIONS.has(path.posix.extname(name).toLowerCase()) && !GENERATED_RE.test(name)
  );
}

async function filesUnder(directory, prefix = "") {
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(directory, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function readDescriptor(root, outputRoot) {
  const descriptorPath = path.resolve(root, outputRoot, "nitro.json");
  try {
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
    if (
      !descriptor.publicDir ||
      typeof descriptor.publicDir !== "string" ||
      !descriptor.serverEntry ||
      typeof descriptor.serverEntry !== "string"
    ) {
      fail(`${posix(path.relative(root, descriptorPath))} has no publicDir/serverEntry`);
    }
    const descriptorStat = await stat(descriptorPath);
    const declaredTime = Date.parse(descriptor.date || "");
    return {
      descriptorPath,
      preset: String(descriptor.preset || ""),
      publicDir: path.resolve(path.dirname(descriptorPath), descriptor.publicDir),
      serverEntry: path.resolve(path.dirname(descriptorPath), descriptor.serverEntry),
      timestamp: Number.isFinite(declaredTime) ? declaredTime : descriptorStat.mtimeMs,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function locatePublicDir(root) {
  const roots = [
    process.env.NITRO_OUTPUT_DIR,
    ".output",
    path.join(".vercel", "output"),
    "dist",
  ].filter(Boolean);
  const descriptors = (
    await Promise.all([...new Set(roots)].map((candidate) => readDescriptor(root, candidate)))
  ).filter(Boolean);

  if (!descriptors.length) {
    fail("no nitro.json found in .output, .vercel/output, or dist; run vite build first");
  }
  descriptors.sort((a, b) => b.timestamp - a.timestamp);
  const selected = descriptors[0];
  const relative = path.relative(root, selected.publicDir);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`Nitro publicDir escapes the project: ${selected.publicDir}`);
  }
  await stat(selected.publicDir);
  return selected;
}

async function renderShell(selected) {
  const previousPrerendering = process.env.TSS_PRERENDERING;
  process.env.TSS_PRERENDERING = "true";

  try {
    const serverModule = await import(
      `${pathToFileURL(selected.serverEntry).href}?pwa-shell=${Date.now()}`
    );
    const handler = serverModule.default ?? serverModule;
    if (!handler || typeof handler.fetch !== "function") {
      fail(`${posix(selected.serverEntry)} does not export a fetch handler`);
    }

    const pending = [];
    const context = {
      waitUntil(promise) {
        pending.push(Promise.resolve(promise));
      },
      passThroughOnException() {},
    };
    const request = new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        "X-TSS_SHELL": "true",
      },
    });
    const response = selected.preset.startsWith("cloudflare")
      ? await handler.fetch(request, {}, context)
      : await handler.fetch(request, context);
    const shell = await response.text();
    await Promise.allSettled(pending);

    if (
      !response.ok ||
      !/^text\/html(?:\s*;|$)/i.test(response.headers.get("content-type") || "")
    ) {
      fail(
        `shell render returned ${response.status} ${response.headers.get("content-type") || ""}`,
      );
    }
    if (!/<script\b/i.test(shell)) fail(`${SHELL} has no client bootstrap script`);
    if (!/<html\b/i.test(shell) || !/<body\b/i.test(shell)) {
      fail(`${SHELL} is not a complete HTML document`);
    }

    await writeFile(path.join(selected.publicDir, SHELL), shell, "utf8");
    return shell;
  } finally {
    if (previousPrerendering === undefined) delete process.env.TSS_PRERENDERING;
    else process.env.TSS_PRERENDERING = previousPrerendering;
  }
}

function addRef(refs, source, raw, kind) {
  const reference = raw.trim();
  if (!reference || reference.startsWith("#") || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) {
    return;
  }
  refs.push({ source, reference, kind });
}

function buildJsMask(text) {
  // Mark bytes that live inside string literals, template literals,
  // or comments so regex matches on those spans can be skipped.
  const mask = new Uint8Array(text.length);
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && text[i] !== "\n") mask[i++] = 1;
    } else if (c === "/" && c2 === "*") {
      mask[i++] = 1;
      mask[i++] = 1;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) mask[i++] = 1;
      if (i < n) { mask[i++] = 1; mask[i++] = 1; }
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      mask[i++] = 1;
      while (i < n) {
        const ch = text[i];
        if (ch === "\\") { mask[i++] = 1; if (i < n) mask[i++] = 1; continue; }
        if (ch === quote) { mask[i++] = 1; break; }
        mask[i++] = 1;
      }
    } else {
      i++;
    }
  }
  return mask;
}

function referencesFrom(source, text) {
  const refs = [];
  const extension = path.posix.extname(source).toLowerCase();

  if (extension === ".html") {
    for (const tag of text.match(/<(?:script|link|img|source|video|audio)\b[^>]*>/gi) || []) {
      for (const match of tag.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) {
        addRef(refs, source, match[1], "HTML asset");
      }
      for (const match of tag.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
        for (const item of match[1].split(","))
          addRef(refs, source, item.trim().split(/\s+/, 1)[0], "HTML srcset");
      }
    }
  }

  if (extension === ".js" || extension === ".mjs") {
    const mask = buildJsMask(text);
    const patterns = [
      /\bimport\s*\(\s*["']([^"']+)["']/g,
      /\bimport\s*\(\s*`([^`]+)`\s*\)/g,
      /\bimport\s*["']([^"']+)["']/g,
      /\bfrom\s*["']([^"']+)["']/g,
      /\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
      /\bimportScripts\(\s*["']([^"']+)["']/g,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (mask[match.index]) continue;
        if (match[1].includes("${")) continue;
        if (match[1].startsWith(".") || match[1].startsWith("/")) {
          addRef(refs, source, match[1], "JavaScript import");
        }
      }
    }
  }

  if (extension === ".css") {
    for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      addRef(refs, source, match[1], "CSS url");
    }
    for (const match of text.matchAll(/@import\s+["']([^"']+)["']/gi)) {
      addRef(refs, source, match[1], "CSS import");
    }
  }

  return refs;
}

function resolveRef(source, reference) {
  const clean = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  if (!clean || clean.endsWith("/")) return null;
  if (clean.startsWith("/")) return clean.replace(/^\/+/, "");
  return path.posix.normalize(path.posix.join(path.posix.dirname(source), clean));
}

async function verifyOutput(publicDir, files, precacheUrls) {
  const normalizedFiles = files
    .map(posix)
    .filter((file) => !GENERATED_RE.test(path.posix.basename(file)));
  const output = new Set(normalizedFiles);
  const uncovered = normalizedFiles.filter(isCacheable).filter((file) => !precacheUrls.has(file));
  if (uncovered.length) fail(`cacheable deploy output is not precached:\n${uncovered.join("\n")}`);

  for (const route of REQUIRED_ROUTES) {
    const present = [...precacheUrls].some(
      (url) => url.endsWith(".js") && url.includes(`_authenticated.${route}-`),
    );
    if (!present) fail(`required offline route chunk is missing: ${route}`);
  }

  const errors = [];
  let referenceCount = 0;
  for (const file of normalizedFiles) {
    const extension = path.posix.extname(file).toLowerCase();
    if (![".css", ".html", ".js", ".mjs"].includes(extension)) continue;
    const text = await readFile(path.join(publicDir, file), "utf8");
    for (const ref of referencesFrom(file, text)) {
      referenceCount += 1;
      const resolved = resolveRef(ref.source, ref.reference);
      if (!resolved || resolved === "sw.js") continue;
      if (resolved.startsWith("../") || !output.has(resolved)) {
        errors.push(`${ref.kind} ${ref.source} -> ${ref.reference} is missing (${resolved})`);
      } else if (isCacheable(resolved) && !precacheUrls.has(resolved)) {
        errors.push(`${ref.kind} ${ref.source} -> ${ref.reference} is not precached`);
      }
    }
  }
  if (errors.length) fail(`broken output references:\n${errors.join("\n")}`);
  return referenceCount;
}

function withLifecycleMetadata(source, version) {
  return `${source}
;self.__HAZRI_PWA_VERSION__=${JSON.stringify(version)};
self.addEventListener("activate",(event)=>{event.waitUntil(Promise.all(["html-pages","static-assets"].map((name)=>caches.delete(name))))});
`;
}

function verifyWorker(source, cacheId, version, entries) {
  if (!source.includes(cacheId)) fail(`worker is missing cacheId ${cacheId}`);
  if (!source.includes(version)) fail(`worker is missing version ${version}`);
  if (!source.includes("/_shell.html")) fail("worker is missing the revisioned shell fallback");
  if (!source.includes("SKIP_WAITING")) fail("worker is not prompt-mode");
  if (
    source.includes('cacheName:"static-assets"') ||
    source.includes('cacheName: "static-assets"')
  ) {
    fail("worker contains a same-origin runtime static cache");
  }
  const missing = entries.filter(({ url }) => !source.includes(JSON.stringify(url)));
  if (missing.length) fail(`worker omitted ${missing.length} precache entries`);
}

async function replaceAtomically(source, destination) {
  try {
    await rename(source, destination);
  } catch (error) {
    if (!["EEXIST", "EPERM"].includes(error?.code)) throw error;
    await rm(destination, { force: true });
    await rename(source, destination);
  }
}

export async function buildPwa({ rootDir = DEFAULT_ROOT } = {}) {
  const root = path.resolve(rootDir);
  const selected = await locatePublicDir(root);
  const publicDir = selected.publicDir;
  await renderShell(selected);

  const manifestOptions = {
    globDirectory: publicDir,
    globPatterns: [
      "**/*.{avif,css,gif,html,ico,jpeg,jpg,js,json,mjs,otf,png,svg,ttf,wasm,webmanifest,webp,woff,woff2}",
    ],
    globIgnores: [
      "**/sw.js",
      "**/sw.js.map",
      "**/workbox-*.js",
      "**/workbox-*.js.map",
      "**/.sw-*.js",
    ],
    maximumFileSizeToCacheInBytes: MAX_FILE_SIZE,
  };
  const manifest = await getManifest(manifestOptions);
  if (manifest.warnings.length) fail(`Workbox warnings:\n${manifest.warnings.join("\n")}`);

  const entries = manifest.manifestEntries;
  const precacheUrls = new Set(entries.map(({ url }) => cleanUrl(url)));
  const shellEntry = entries.find(({ url }) => cleanUrl(url) === SHELL);
  if (!shellEntry?.revision) fail(`${SHELL} is not revisioned in the precache manifest`);
  const manifestFingerprint = entries
    .map(({ url, revision }) => `${cleanUrl(url)}:${revision || ""}`)
    .sort()
    .join("\n");
  const version = createHash("sha256").update(manifestFingerprint).digest("hex").slice(0, 12);
  const cacheId = `hazri-${version}`;

  const outputFiles = await filesUnder(publicDir);
  const referenceCount = await verifyOutput(publicDir, outputFiles, precacheUrls);
  const temporaryWorker = path.join(publicDir, `.sw-${process.pid}-${Date.now().toString(36)}.js`);
  const finalWorker = path.join(publicDir, "sw.js");

  try {
    const generated = await generateSW({
      globDirectory: publicDir,
      globPatterns: [],
      additionalManifestEntries: entries,
      swDest: temporaryWorker,
      cacheId,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: false,
      inlineWorkboxRuntime: true,
      disableDevLogs: true,
      mode: "production",
      sourcemap: false,
      navigationPreload: false,
      navigateFallback: "/_shell.html",
      navigateFallbackDenylist: [
        /^\/api(?:\/|$)/,
        /^\/_serverFn(?:\/|$)/,
        /^\/~oauth(?:\/|$)/,
        /^\/auth\/callback(?:\/|$)/,
        /\/[^/?]+\.[^/]+$/,
      ],
      ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^gclid$/],
    });
    if (generated.warnings.length) fail(generated.warnings.join("\n"));
    if (generated.count !== entries.length) {
      fail(`Workbox emitted ${generated.count}/${entries.length} precache entries`);
    }

    const source = withLifecycleMetadata(await readFile(temporaryWorker, "utf8"), version);
    verifyWorker(source, cacheId, version, entries);
    await writeFile(temporaryWorker, source, "utf8");
    await replaceAtomically(temporaryWorker, finalWorker);
  } finally {
    await rm(temporaryWorker, { force: true });
  }

  for (const file of await filesUnder(publicDir)) {
    if (/^workbox-[\w-]+\.js(?:\.map)?$/.test(path.basename(file))) {
      await rm(path.join(publicDir, file), { force: true });
    }
  }

  verifyWorker(await readFile(finalWorker, "utf8"), cacheId, version, entries);
  console.log(
    `[pwa-build] ${posix(path.relative(root, finalWorker))}: version ${version}, ${entries.length} files (${manifest.size} bytes), ${referenceCount} references verified`,
  );
  return { cacheId, version, publicDir, count: entries.length, size: manifest.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPwa().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
