// IndexedDB store for the offline field-reader mode. Holds the downloaded
// batch members, queued readings, and sync metadata so a reader can work with
// no internet and auto-sync later.
import { openDB } from "idb";

const DB_NAME = "powassco-field";
const DB_VERSION = 1;

function db() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("members")) d.createObjectStore("members", { keyPath: "pnNo" });
      if (!d.objectStoreNames.contains("queue")) d.createObjectStore("queue", { keyPath: "id" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "key" });
    },
  });
}

export async function setMeta(key, value) {
  await (await db()).put("meta", { key, value });
}
export async function getMeta(key) {
  const r = await (await db()).get("meta", key);
  return r?.value;
}

export async function saveMembers(members) {
  const d = await db();
  const tx = d.transaction("members", "readwrite");
  await tx.store.clear();
  for (const m of members) await tx.store.put(m);
  await tx.done;
}
export async function getMembers() {
  return (await db()).getAll("members");
}
export async function getMember(pnNo) {
  return (await db()).get("members", pnNo);
}
export async function updateMember(member) {
  await (await db()).put("members", member);
}

// Queue keyed by pnNo__meter so re-encoding the same meter overwrites (no dupes).
export async function enqueueReading(reading) {
  const id = `${reading.pnNo}__${reading.meterNumber}`;
  await (await db()).put("queue", { ...reading, id, synced: false, ts: Date.now() });
  return id;
}
export async function getQueue() {
  return (await db()).getAll("queue");
}
export async function getPending() {
  return (await getQueue()).filter((q) => !q.synced);
}
export async function removeFromQueue(ids) {
  const d = await db();
  const tx = d.transaction("queue", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}
export async function clearOffline() {
  const d = await db();
  for (const s of ["members", "queue", "meta"]) await d.clear(s);
}
