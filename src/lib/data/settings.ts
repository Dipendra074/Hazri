/**
 * Hybrid settings data layer.
 *
 * - Guest → IndexedDB `settings` store keyed per owner.
 * - Signed-in → Supabase `profiles` (theme + preferences columns) for the
 *   canonical shape; per-device settings fall back to the local `settings`
 *   store so preferences survive without a network round-trip.
 */

import { supabase } from "@/integrations/supabase/client";
import { settingsRepo } from "@/lib/db/repositories";
import type { Session } from "@/lib/session";

function assertActive(s: Session): string {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const settingsApi = {
  async get<T = unknown>(session: Session, key: string): Promise<T | undefined> {
    const ownerId = assertActive(session);
    return settingsRepo.get<T>(ownerId, key);
  },

  async set(session: Session, key: string, value: unknown): Promise<void> {
    const ownerId = assertActive(session);
    await settingsRepo.set(ownerId, key, value);
    // Signed-in specialization: mirror `theme` into profiles for cross-device.
    if (session.mode === "signed_in" && key === "theme" && typeof value === "string") {
      const { error } = await supabase
        .from("profiles")
        .update({ theme: value })
        .eq("id", ownerId);
      if (error) throw error;
    }
  },

  async delete(session: Session, key: string): Promise<void> {
    const ownerId = assertActive(session);
    await settingsRepo.delete(ownerId, key);
  },
};