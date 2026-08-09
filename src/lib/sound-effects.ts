/**
 * Simple sound-effect loader for user-droppable audio files under /public/sounds/.
 *
 * Each "slot" maps to a folder. Drop a file named sound.mp3 / sound.wav /
 * sound.ogg / sound.m4a into that folder and it will play automatically.
 * If no file is present, play() is a silent no-op.
 */

const CANDIDATES = ["sound.mp3", "sound.wav", "sound.ogg", "sound.m4a", "sound"];

const SLOTS = {
  updatePopup: "/sounds/update-popup",
  attendanceBelowTarget: "/sounds/attendance-below-target",
  proPageOpen: "/sounds/pro-page-open",
} as const;

export type SoundSlot = keyof typeof SLOTS;

const resolved = new Map<SoundSlot, string | null>();

async function resolveUrl(slot: SoundSlot): Promise<string | null> {
  if (resolved.has(slot)) return resolved.get(slot)!;
  const base = SLOTS[slot];
  for (const name of CANDIDATES) {
    const url = `${base}/${name}`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        resolved.set(slot, url);
        return url;
      }
    } catch {
      /* ignore */
    }
  }
  resolved.set(slot, null);
  return null;
}

export async function playSound(slot: SoundSlot): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const url = await resolveUrl(slot);
    if (!url) {
      console.warn(`[sound] no file found for slot "${slot}" in ${SLOTS[slot]}/`);
      return;
    }
    const audio = new Audio(url);
    audio.volume = 0.9;
    await audio.play().catch((err) => {
      console.warn(`[sound] playback blocked for "${slot}":`, err?.message ?? err);
    });
  } catch (err) {
    console.warn(`[sound] error for "${slot}":`, err);
  }
}
