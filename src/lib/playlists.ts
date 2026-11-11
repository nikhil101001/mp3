import { db, type Playlist, type PlaylistItem, type Track } from "./db";

export type PlaylistEntry = { item: PlaylistItem; track: Track };

export async function createPlaylist(name: string): Promise<Playlist> {
  const now = Date.now();
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: name.trim() || "New Playlist",
    createdAt: now,
    updatedAt: now,
  };
  await db.playlists.add(playlist);
  return playlist;
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await db.playlists.update(id, { name: trimmed, updatedAt: Date.now() });
}

export async function deletePlaylist(id: string): Promise<void> {
  await db.transaction("rw", [db.playlists, db.playlistItems], async () => {
    await db.playlistItems.where("playlistId").equals(id).delete();
    await db.playlists.delete(id);
  });
}

/** Adds a song to the end. A song appears in a playlist at most once. */
export async function addToPlaylist(
  playlistId: string,
  trackId: string,
): Promise<"added" | "exists"> {
  return db.transaction("rw", [db.playlists, db.playlistItems], async () => {
    const items = await db.playlistItems
      .where("playlistId")
      .equals(playlistId)
      .toArray();
    if (items.some((item) => item.trackId === trackId)) return "exists";
    const last = items.reduce((max, item) => Math.max(max, item.position), -1);
    await db.playlistItems.add({
      id: crypto.randomUUID(),
      playlistId,
      trackId,
      position: last + 1,
      addedAt: Date.now(),
    });
    await db.playlists.update(playlistId, { updatedAt: Date.now() });
    return "added";
  });
}

export async function removeFromPlaylist(itemId: string): Promise<void> {
  await db.playlistItems.delete(itemId);
}

/** Saves a new order, given every item id of the playlist in that order. */
export async function reorderPlaylist(
  playlistId: string,
  orderedItemIds: string[],
): Promise<void> {
  await db.transaction("rw", [db.playlists, db.playlistItems], async () => {
    await Promise.all(
      orderedItemIds.map((id, position) =>
        db.playlistItems.update(id, { position }),
      ),
    );
    await db.playlists.update(playlistId, { updatedAt: Date.now() });
  });
}

/** The playlist's songs in order, skipping any no longer in the library. */
export async function playlistEntries(
  playlistId: string,
): Promise<PlaylistEntry[]> {
  const items = await db.playlistItems
    .where("[playlistId+position]")
    .between([playlistId, -Infinity], [playlistId, Infinity])
    .toArray();
  const tracks = await db.tracks.bulkGet(items.map((item) => item.trackId));
  return items.flatMap((item, index) => {
    const track = tracks[index];
    return track ? [{ item, track }] : [];
  });
}
