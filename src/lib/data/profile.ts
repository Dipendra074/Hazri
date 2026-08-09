/**
 * Hybrid profile data layer.
 *
 * - Guest → IndexedDB (name + local avatar image id).
 * - Signed-in → Supabase `profiles` for structured fields (display_name),
 *   but the avatar image is ALWAYS stored locally in IndexedDB. This layer
 *   does not upload, read, or delete profile pictures from cloud storage.
 *
 * The consistent shape returned to the UI:
 *   { id, displayName, avatarUrl (Blob URL when a local image exists) }
 */

import { supabase } from "@/integrations/supabase/client";
import { profileRepo, settingsRepo } from "@/lib/db/repositories";
import { compressAndStoreImage, getImageUrl, revokeImageUrl } from "@/lib/images";
import type { Session } from "@/lib/session";

const AVATAR_SETTING = "avatar_image_id";

export type ProfileRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarImageId: string | null;
  mode: "guest" | "signed_in";
  /** Legacy field kept for UI compatibility; avatars are local-only now. */
  avatarCloudPath: string | null;
  /** Where the currently rendered avatar comes from. */
  avatarSource: "cloud" | "local" | "none";
};

function assertActive(s: Session): string {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

async function resolveAvatar(id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    return await getImageUrl(id);
  } catch {
    return null;
  }
}

export const profileApi = {
  async get(session: Session): Promise<ProfileRow | null> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      const p = await profileRepo.get(ownerId);
      const url = await resolveAvatar(p?.avatarImageId ?? null);
      return {
        id: ownerId,
        email: null,
        displayName: p?.displayName ?? "",
        avatarImageId: p?.avatarImageId ?? null,
        avatarUrl: url,
        avatarCloudPath: null,
        avatarSource: url ? "local" : "none",
        mode: "guest",
      };
    }
    // signed-in: name from backend profile, email from the already-hydrated
    // session, avatar from IndexedDB. Avoid an extra auth network lookup here;
    // on Android/PWA refresh it can race with session restoration and make the
    // header temporarily fall back to the app name or raw email.
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", ownerId)
      .maybeSingle();
    const imageId =
      (await settingsRepo.get<string>(ownerId, AVATAR_SETTING)) ?? null;
    const localUrl = await resolveAvatar(imageId);
    return {
      id: ownerId,
      email: session.email,
      displayName: data?.display_name ?? null,
      avatarImageId: imageId,
      avatarUrl: localUrl,
      avatarCloudPath: null,
      avatarSource: localUrl ? "local" : "none",
      mode: "signed_in",
    };
  },

  async setDisplayName(session: Session, name: string): Promise<void> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      await profileRepo.upsert(ownerId, { displayName: name });
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", ownerId);
    if (error) throw error;
  },

  /**
   * Store an avatar image LOCALLY (IndexedDB) for both guest and signed-in
   * modes. Does not touch cloud storage. For signed-in users an existing
   * cloud avatar is left in place unless {@link clearCloudAvatar} is called.
   */
  async setAvatar(session: Session, file: File | Blob, previousId?: string | null): Promise<{ id: string; url: string | null }> {
    const ownerId = assertActive(session);
    const rec = await compressAndStoreImage(file, {
      kind: "avatar",
      ownerId,
      replaceId: previousId ?? undefined,
    });
    if (session.mode === "guest") {
      await profileRepo.upsert(ownerId, { avatarImageId: rec.id });
    } else {
      await settingsRepo.set(ownerId, AVATAR_SETTING, rec.id);
    }
    const url = await getImageUrl(rec.id);
    return { id: rec.id, url };
  },

  async clearAvatar(session: Session): Promise<void> {
    const ownerId = assertActive(session);
    const existing =
      session.mode === "guest"
        ? (await profileRepo.get(ownerId))?.avatarImageId ?? null
        : (await settingsRepo.get<string>(ownerId, AVATAR_SETTING)) ?? null;
    if (existing) revokeImageUrl(existing);
    if (session.mode === "guest") {
      await profileRepo.upsert(ownerId, { avatarImageId: null });
    } else {
      await settingsRepo.delete(ownerId, AVATAR_SETTING);
    }
  },
};