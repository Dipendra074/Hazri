/**
 * Local image pipeline for guest mode.
 *
 * - Validates MIME + pre-compression size.
 * - Compresses via `browser-image-compression`.
 * - Persists the compressed Blob in the `images` IndexedDB store.
 * - Exposes a Blob URL cache with explicit revocation so consumers can
 *   render `img.src` without leaking object URLs.
 *
 * No UI is wired into this yet (Phase 2 scope).
 */

import imageCompression from "browser-image-compression";
import { imagesRepo } from "./db/repositories/images";
import type { GuestImage, ImageKind } from "./db/schema";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB pre-compression

const KIND_PRESETS: Record<ImageKind, { maxDim: number; quality: number }> = {
  avatar: { maxDim: 512, quality: 0.82 },
  timetable: { maxDim: 1600, quality: 0.72 },
};

export class ImageValidationError extends Error {
  constructor(message: string, public code: "mime" | "size" | "decode") {
    super(message);
    this.name = "ImageValidationError";
  }
}

function assertBrowser() {
  if (typeof window === "undefined") {
    throw new Error("images.ts is browser-only");
  }
}

async function readDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bmp = await createImageBitmap(blob);
    const dim = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return dim;
  } catch {
    return null;
  }
}

export interface CompressAndStoreOptions {
  kind: ImageKind;
  ownerId: string;
  /** Overwrite an existing image record id (e.g. to replace an avatar in place). */
  replaceId?: string;
}

export async function compressAndStoreImage(
  file: File | Blob,
  { kind, ownerId, replaceId }: CompressAndStoreOptions,
): Promise<GuestImage> {
  assertBrowser();

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    throw new ImageValidationError(
      `Unsupported image type ${mime}. Use JPEG, PNG, or WebP.`,
      "mime",
    );
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageValidationError(
      `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 10 MB before compression.`,
      "size",
    );
  }

  const preset = KIND_PRESETS[kind];
  const source: File =
    file instanceof File
      ? file
      : new File([file], `image.${mime.split("/")[1] ?? "bin"}`, { type: mime });

  const compressed = await imageCompression(source, {
    maxWidthOrHeight: preset.maxDim,
    initialQuality: preset.quality,
    useWebWorker: true,
    fileType: mime as "image/jpeg" | "image/png" | "image/webp",
  });

  const dims = await readDimensions(compressed);

  const record = await imagesRepo.put({
    id: replaceId,
    ownerId,
    kind,
    blob: compressed,
    mime: compressed.type || mime,
    size: compressed.size,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  });

  // Bust any cached blob URL for a replaced record so consumers re-fetch.
  revokeImageUrl(record.id);

  return record;
}

/* -------------------------------------------------------------------------- */
/* Blob URL cache with explicit revocation                                     */
/* -------------------------------------------------------------------------- */

const urlCache = new Map<string, string>();

export async function getImageUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const record = await imagesRepo.get(id);
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  urlCache.set(id, url);
  return url;
}

export function revokeImageUrl(id: string) {
  const url = urlCache.get(id);
  if (!url) return;
  URL.revokeObjectURL(url);
  urlCache.delete(id);
}

export function revokeAllImageUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

export async function deleteImage(id: string) {
  revokeImageUrl(id);
  await imagesRepo.delete(id);
}

export const IMAGE_LIMITS = {
  maxInputBytes: MAX_INPUT_BYTES,
  allowedMime: Array.from(ALLOWED_MIME),
} as const;