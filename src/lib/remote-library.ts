import { db, type Track } from "./db";

/** Saves a streamed track's details so it shows up in Songs and Artists. */
export async function saveToLibrary(track: Track): Promise<void> {
  if (!track.remote) return;
  await db.transaction("rw", [db.tracks, db.artists], async () => {
    if (await db.tracks.get(track.id)) return;
    await db.artists.put({
      id: track.artistId,
      name: track.artist,
      sortName: track.artist.toLowerCase(),
    });
    await db.tracks.put({ ...track, addedAt: Date.now() });
  });
}

/** Removes a streamed track from the library and from any playlists. */
export async function removeFromLibrary(trackId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.tracks, db.artists, db.playlistItems],
    async () => {
      const track = await db.tracks.get(trackId);
      if (!track?.remote) return;
      await db.tracks.delete(trackId);
      const items = await db.playlistItems.toArray();
      await db.playlistItems.bulkDelete(
        items.filter((item) => item.trackId === trackId).map((item) => item.id),
      );
      const remaining = await db.tracks
        .where("artistId")
        .equals(track.artistId)
        .count();
      if (remaining === 0) await db.artists.delete(track.artistId);
    },
  );
}
