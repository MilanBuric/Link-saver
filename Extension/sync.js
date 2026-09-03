// Shared cross-device sync helpers — a lightweight chrome.storage.sync
// mirror of the local leads/categories. chrome.storage.local always stays
// the source of truth; this is best-effort and can fail gracefully.
//
// chrome.storage.sync hard limits (checked against current Chrome docs):
//   ~100KB total, ~8KB per item, measured as JSON-stringified value + key length.
// Chunk size is kept well under that per-item cap to leave room for JSON
// string-escaping overhead and the key name itself.
const SYNC_CHUNK_SIZE = 3000; // characters per chunk

function chunkString(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks.length ? chunks : [""];
}

// Pushes the given state to chrome.storage.sync in chunks.
// Returns { ok: true } or { ok: false, error } — never throws.
async function pushToSyncShared(leads, categories, lastModified) {
  try {
    const { syncMeta: oldMeta } = await chrome.storage.sync.get(["syncMeta"]);
    const payload = JSON.stringify({ leads, categories, lastModified });
    const chunks = chunkString(payload, SYNC_CHUNK_SIZE);

    const data = { syncMeta: { chunkCount: chunks.length, lastModified } };
    chunks.forEach((c, i) => {
      data[`syncChunk_${i}`] = c;
    });
    await chrome.storage.sync.set(data);

    // Clean up leftover chunks from a previously larger payload.
    if (oldMeta && oldMeta.chunkCount > chunks.length) {
      const toRemove = [];
      for (let i = chunks.length; i < oldMeta.chunkCount; i++)
        toRemove.push(`syncChunk_${i}`);
      await chrome.storage.sync.remove(toRemove);
    }
    return { ok: true };
  } catch (err) {
    console.error("Sync push failed:", err);
    return { ok: false, error: err };
  }
}

// Returns { leads, categories, lastModified } if the remote copy is newer
// than localLastModified, or null if there's nothing newer / nothing synced yet.
async function pullFromSyncShared(localLastModified) {
  try {
    const { syncMeta } = await chrome.storage.sync.get(["syncMeta"]);
    if (!syncMeta || !syncMeta.chunkCount) return null;
    if (syncMeta.lastModified <= (localLastModified || 0)) return null;

    const chunkKeys = Array.from(
      { length: syncMeta.chunkCount },
      (_, i) => `syncChunk_${i}`,
    );
    const chunkData = await chrome.storage.sync.get(chunkKeys);
    const joined = chunkKeys.map((k) => chunkData[k] || "").join("");
    return JSON.parse(joined);
  } catch (err) {
    console.error("Sync pull failed:", err);
    return null;
  }
}
