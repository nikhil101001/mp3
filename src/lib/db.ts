import Dexie, { type EntityTable } from "dexie";

// The on-device library. Every screen reads from here; sources only write to it.

export interface Track {
  id: string;
  title: string;
  /** Lower-cased title used for ordering. */
  sortTitle: string;
  artist: string;
  /** The artist this track is filed under: album artist when present. */
  artistId: string;
  album: string;
  albumId: string;
  discNo: number;
  trackNo: number;
  durationMs: number;
  year?: number;
  genre?: string;
  /** Id of a stored cover, or a web address for streamed tracks. */
  artworkId?: string;
  addedAt: number;
  /** Set for tracks streamed from an online source and not stored here. */
  remote?: { source: "audius"; id: string; permalink?: string };
}

/** One playable file for a track. A track can gain more renditions later. */
export interface Rendition {
  id: string;
  trackId: string;
  source: "imported";
  /** File name inside the OPFS "library" folder. */
  path: string;
  /** name:size:modified of the original file, to skip re-imports. */
  fingerprint: string;
  codec: string;
  sampleRate?: number;
  bitDepth?: number;
  bitrate?: number;
  lossless: boolean;
  sizeBytes: number;
}

export interface Album {
  id: string;
  title: string;
  sortTitle: string;
  artist: string;
  artistId: string;
  year?: number;
  artworkId?: string;
}

export interface Artist {
  id: string;
  name: string;
  sortName: string;
}

export interface Artwork {
  /** SHA-1 of the embedded picture, so one cover is stored once per album. */
  id: string;
  thumb: Blob;
  large: Blob;
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlaylistItem {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
  addedAt: number;
}

export const db = new Dexie("mp3") as Dexie & {
  tracks: EntityTable<Track, "id">;
  renditions: EntityTable<Rendition, "id">;
  albums: EntityTable<Album, "id">;
  artists: EntityTable<Artist, "id">;
  artwork: EntityTable<Artwork, "id">;
  playlists: EntityTable<Playlist, "id">;
  playlistItems: EntityTable<PlaylistItem, "id">;
};

db.version(1).stores({
  tracks: "id, sortTitle, albumId, artistId, addedAt",
  renditions: "id, trackId, &fingerprint",
  albums: "id, sortTitle, artistId",
  artists: "id, sortName",
  artwork: "id",
  playlists: "id, name",
  playlistItems: "id, playlistId, [playlistId+position]",
});

export const LIBRARY_DIR = "library";

export async function libraryDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(LIBRARY_DIR, { create: true });
}

/** Orders tracks the way an album plays: by disc, then track number. */
export function byAlbumOrder(a: Track, b: Track): number {
  return (
    a.discNo - b.discNo ||
    a.trackNo - b.trackNo ||
    a.sortTitle.localeCompare(b.sortTitle)
  );
}

/**
 * Removes songs whose audio file is no longer in app storage, which can
 * happen if the browser clears stored files. Returns how many were removed.
 */
export async function removeSongsWithMissingFiles(): Promise<number> {
  const dir = await libraryDir();
  const renditions = await db.renditions.toArray();
  const missing: typeof renditions = [];
  for (const rendition of renditions) {
    try {
      await dir.getFileHandle(rendition.path);
    } catch {
      missing.push(rendition);
    }
  }
  if (missing.length === 0) return 0;
  const trackIds = missing.map((rendition) => rendition.trackId);
  await db.transaction(
    "rw",
    [db.tracks, db.renditions, db.albums, db.artists, db.playlistItems],
    async () => {
      await db.renditions.bulkDelete(missing.map((rendition) => rendition.id));
      await db.tracks.bulkDelete(trackIds);
      const gone = new Set(trackIds);
      const items = await db.playlistItems.toArray();
      await db.playlistItems.bulkDelete(
        items.filter((item) => gone.has(item.trackId)).map((item) => item.id),
      );
      // Drop albums and artists that no longer have any songs.
      for (const album of await db.albums.toArray()) {
        const left = await db.tracks.where("albumId").equals(album.id).count();
        if (left === 0) await db.albums.delete(album.id);
      }
      for (const artist of await db.artists.toArray()) {
        const left = await db.tracks.where("artistId").equals(artist.id).count();
        if (left === 0) await db.artists.delete(artist.id);
      }
    },
  );
  return missing.length;
}

/** Removes every song, cover and playlist from this device. */
export async function clearLibrary(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.tracks,
      db.renditions,
      db.albums,
      db.artists,
      db.artwork,
      db.playlists,
      db.playlistItems,
    ],
    async () => {
      await Promise.all([
        db.tracks.clear(),
        db.renditions.clear(),
        db.albums.clear(),
        db.artists.clear(),
        db.artwork.clear(),
        db.playlists.clear(),
        db.playlistItems.clear(),
      ]);
    },
  );
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(LIBRARY_DIR, { recursive: true });
  } catch {
    // The folder does not exist until the first import.
  }
}
