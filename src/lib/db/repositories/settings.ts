import { STORE, type GuestSetting } from "../schema";
import { now, withDB } from "./base";

function keyFor(ownerId: string, name: string) {
  return `${ownerId}:${name}`;
}

export const settingsRepo = {
  async get<T = unknown>(ownerId: string, name: string): Promise<T | undefined> {
    const record = await withDB((db) => db.get(STORE.settings, keyFor(ownerId, name)));
    return record?.value as T | undefined;
  },
  async set(ownerId: string, name: string, value: unknown) {
    const record: GuestSetting = {
      key: keyFor(ownerId, name),
      ownerId,
      value,
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.settings, record));
  },
  async listForOwner(ownerId: string) {
    return withDB((db) => db.getAllFromIndex(STORE.settings, "byOwner", ownerId));
  },
  async delete(ownerId: string, name: string) {
    await withDB((db) => db.delete(STORE.settings, keyFor(ownerId, name)));
  },
};