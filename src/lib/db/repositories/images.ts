import { v4 as uuid } from "uuid";
import { STORE, type GuestImage, type ImageKind } from "../schema";
import { now, withDB } from "./base";

export const imagesRepo = {
  async get(id: string) {
    return withDB((db) => db.get(STORE.images, id));
  },
  async listForOwner(ownerId: string) {
    return withDB((db) => db.getAllFromIndex(STORE.images, "byOwner", ownerId));
  },
  async listByKind(ownerId: string, kind: ImageKind) {
    return withDB((db) =>
      db.getAllFromIndex(
        STORE.images,
        "byOwnerKind",
        [ownerId, kind] as [string, ImageKind],
      ),
    );
  },
  async put(
    input: Omit<GuestImage, "id" | "createdAt"> & { id?: string },
  ) {
    const record: GuestImage = {
      ...input,
      id: input.id ?? uuid(),
      createdAt: now(),
    };
    await withDB((db) => db.put(STORE.images, record));
    return record;
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.images, id));
  },
  async deleteForOwner(ownerId: string) {
    await withDB(async (db) => {
      const all = await db.getAllFromIndex(STORE.images, "byOwner", ownerId);
      const tx = db.transaction(STORE.images, "readwrite");
      await Promise.all(all.map((img) => tx.store.delete(img.id)));
      await tx.done;
    });
  },
};