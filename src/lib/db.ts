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
  /** "imported": copied into app storage. "linked": read from a folder on disk. */
  source: "imported" | "linked";
  /**
   * Imported: file name inside the OPFS "library" folder.
   * Linked: path inside the linked folder, such as "Disc 1/01 Intro.flac".
   */
  path: string;
  /** For linked songs, the folder they are read from. */
  folderId?: string;
  /** Identifies the original file, to skip work when it has not changed. */
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

/**
 * A folder on disk whose songs are played in place, not copied. Only browsers
 * with folder access (desktop Chrome and Edge) can create these.
 */
export interface LinkedFolder {
  id: string;
  name: string;
  /** The browser's reference to the folder. It survives restarts. */
  handle: FileSystemDirectoryHandle;
  /** The playlist that mirrors this folder. */
  playlistId: string;
  addedAt: number;
  lastScanAt?: number;
}

export const db = new Dexie("mp3") as Dexie & {
  tracks: EntityTable<Track, "id">;
  renditions: EntityTable<Rendition, "id">;
  albums: EntityTable<Album, "id">;
  artists: EntityTable<Artist, "id">;
  artwork: EntityTable<Artwork, "id">;
  playlists: EntityTable<Playlist, "id">;
  playlistItems: EntityTable<PlaylistItem, "id">;
  folders: EntityTable<LinkedFolder, "id">;
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

// Version 2 adds linked folders.
db.version(2).stores({
  renditions: "id, trackId, &fingerprint, folderId",
  folders: "id, playlistId",
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
 * Removes songs from the library along with their files' records and playlist
 * entries, then drops any album or artist left with no songs.
 */
export async function removeTracks(trackIds: string[]): Promise<void> {
  if (trackIds.length === 0) return;
  await db.transaction(
    "rw",
    [db.tracks, db.renditions, db.albums, db.artists, db.playlistItems],
    async () => {
      const gone = new Set(trackIds);
      const renditions = await db.renditions
        .where("trackId")
        .anyOf(trackIds)
        .primaryKeys();
      await db.renditions.bulkDelete(renditions);
      await db.tracks.bulkDelete(trackIds);
      const items = await db.playlistItems.toArray();
      await db.playlistItems.bulkDelete(
        items.filter((item) => gone.has(item.trackId)).map((item) => item.id),
      );
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
}

/**
 * Removes imported songs whose audio file is no longer in app storage, which
 * can happen if the browser clears stored files. Returns how many were removed.
 * Linked songs are left alone: their files live on disk, not in app storage.
 */
export async function removeSongsWithMissingFiles(): Promise<number> {
  const dir = await libraryDir();
  const renditions = await db.renditions.toArray();
  const missing: string[] = [];
  for (const rendition of renditions) {
    if (rendition.source !== "imported") continue;
    try {
      await dir.getFileHandle(rendition.path);
    } catch {
      missing.push(rendition.trackId);
    }
  }
  await removeTracks(missing);
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
      db.folders,
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
        db.folders.clear(),
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
