import { STORE, type GuestProfile } from "../schema";
import { now, withDB } from "./base";

export const profileRepo = {
  async get(ownerId: string) {
    return withDB((db) => db.get(STORE.profile, ownerId));
  },
  async upsert(
    ownerId: string,
    patch: Partial<Omit<GuestProfile, "id" | "createdAt">>,
  ) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.profile, ownerId);
      const next: GuestProfile = existing
        ? { ...existing, ...patch, id: ownerId, updatedAt: now() }
        : {
            id: ownerId,
            displayName: patch.displayName ?? "",
            avatarImageId: patch.avatarImageId ?? null,
            createdAt: now(),
            updatedAt: now(),
          };
      await db.put(STORE.profile, next);
      return next;
    });
  },
  async delete(ownerId: string) {
    await withDB((db) => db.delete(STORE.profile, ownerId));
  },
};