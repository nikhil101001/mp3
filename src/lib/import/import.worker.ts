// Imports picked files into the library: reads tags and cover art, copies the
// audio into app storage (OPFS) and writes the records to the database.
// Runs in a worker so a large import never freezes the screen, and because
// Safari only allows synchronous OPFS writes in a worker.

import { parseBlob, selectCover } from "music-metadata";
import {
  db,
  libraryDir,
  removeTracks,
  type Rendition,
  type Track,
} from "../db";
import type { ImportProgress, ImportRequest } from "./types";

type SyncAccessHandle = {
  truncate(size: number): void;
  write(data: Uint8Array, options: { at: number }): number;
  flush(): void;
  close(): void;
};

const post = (message: ImportProgress) =>
  (self as unknown as { postMessage(m: unknown): void }).postMessage(message);

const LOSSLESS = /flac|alac|pcm|wav|aiff|ape|wavpack|dsd/i;

function sortKey(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .trim();
}

function idFor(prefix: string, ...parts: string[]): string {
  return `${prefix}:${parts.map((part) => part.normalize("NFKC").toLowerCase().trim()).join("|")}`;
}

function extension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "bin";
}

async function sha1(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", data as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function resize(source: Blob, maxSide: number): Promise<Blob> {
  if (typeof OffscreenCanvas === "undefined") return source;
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return source;
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.86 });
  } finally {
    bitmap.close();
  }
}

/** Stores a cover once and returns its id; the same picture is reused. */
async function saveArtwork(
  picture: { data: Uint8Array; format: string } | null,
): Promise<string | undefined> {
  if (!picture) return undefined;
  const id = await sha1(picture.data);
  if (await db.artwork.get(id)) return id;
  const original = new Blob([picture.data as BlobPart], {
    type: picture.format,
  });
  try {
    const [thumb, large] = await Promise.all([
      resize(original, 256),
      resize(original, 1000),
    ]);
    await db.artwork.put({ id, thumb, large });
    return id;
  } catch {
    // An unreadable picture should not stop the song from importing.
    return undefined;
  }
}

async function copyToStorage(file: File, path: string): Promise<void> {
  const dir = await libraryDir();
  const handle = await dir.getFileHandle(path, { create: true });
  const access = await (
    handle as unknown as { createSyncAccessHandle(): Promise<SyncAccessHandle> }
  ).createSyncAccessHandle();
  try {
    access.truncate(0);
    const reader = file.stream().getReader();
    let offset = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      access.write(value, { at: offset });
      offset += value.byteLength;
    }
    access.flush();
  } finally {
    access.close();
  }
}

const AUDIO_FILE =
  /\.(mp3|m4a|aac|flac|wav|aif|aiff|ogg|oga|opus|mp4|m4b|wma|caf)$/i;

/** Where a new song's audio lives. */
type Placement =
  { source: "imported" } | { source: "linked"; folderId: string; path: string };

/**
 * Reads a file's tags and cover and adds it to the library. Imported files
 * are copied into app storage; linked files are only described, and stay
 * where they are on disk.
 */
async function addSong(
  file: File,
  fingerprint: string,
  placement: Placement,
): Promise<string> {
  // Headers only: asking for an exact duration makes the parser read the whole
  // of some MP3 files. Where the length is missing, the player fills it in the
  // first time the song plays.
  const metadata = await parseBlob(file);
  const { common, format } = metadata;
  if (!format.duration && !format.codec) {
    throw new Error("not a readable audio file");
  }

  const title = common.title?.trim() || file.name.replace(/\.[^.]+$/, "");
  const artist = common.artist?.trim() || "Unknown Artist";
  const albumArtist = common.albumartist?.trim() || artist;
  const albumTitle = common.album?.trim() || "Unknown Album";
  const artistId = idFor("artist", albumArtist);
  const albumId = idFor("album", albumArtist, albumTitle);
  const artworkId = await saveArtwork(selectCover(common.picture));

  const trackId = crypto.randomUUID();
  let path: string;
  if (placement.source === "imported") {
    path = `${trackId}.${extension(file.name)}`;
    await copyToStorage(file, path);
  } else {
    path = placement.path;
  }

  const track: Track = {
    id: trackId,
    title,
    sortTitle: sortKey(title),
    artist,
    artistId,
    album: albumTitle,
    albumId,
    discNo: common.disk?.no ?? 1,
    trackNo: common.track?.no ?? 0,
    durationMs: Math.round((format.duration ?? 0) * 1000),
    year: common.year,
    genre: common.genre?.[0],
    artworkId,
    addedAt: Date.now(),
  };
  const codec = format.codec ?? format.container ?? extension(file.name);
  const rendition: Rendition = {
    id: crypto.randomUUID(),
    trackId,
    source: placement.source,
    path,
    folderId: placement.source === "linked" ? placement.folderId : undefined,
    fingerprint,
    codec,
    sampleRate: format.sampleRate,
    bitDepth: format.bitsPerSample,
    bitrate: format.bitrate,
    lossless: format.lossless ?? LOSSLESS.test(codec),
    sizeBytes: file.size,
  };

  await db.transaction(
    "rw",
    [db.tracks, db.renditions, db.albums, db.artists],
    async () => {
      await db.artists.put({
        id: artistId,
        name: albumArtist,
        sortName: sortKey(albumArtist),
      });
      const album = await db.albums.get(albumId);
      await db.albums.put({
        id: albumId,
        title: albumTitle,
        sortTitle: sortKey(albumTitle),
        artist: albumArtist,
        artistId,
        year: album?.year ?? common.year,
        artworkId: album?.artworkId ?? artworkId,
      });
      await db.tracks.put(track);
      await db.renditions.put(rendition);
    },
  );
  return trackId;
}

async function importFiles(files: File[]) {
  let added = 0;
  let skipped = 0;
  const failed: string[] = [];
  const trackIds: (string | null)[] = [];
  const addedIds: string[] = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    post({
      type: "progress",
      done: index,
      total: files.length,
      name: file.name,
    });
    try {
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      const existing = await db.renditions
        .where("fingerprint")
        .equals(fingerprint)
        .first();
      if (existing) {
        skipped++;
        trackIds.push(existing.trackId);
      } else {
        const trackId = await addSong(file, fingerprint, {
          source: "imported",
        });
        trackIds.push(trackId);
        addedIds.push(trackId);
        added++;
      }
    } catch (error) {
      trackIds.push(null);
      failed.push(
        `${file.name}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  post({
    type: "finished",
    added,
    skipped,
    removed: 0,
    failed,
    trackIds,
    addedIds,
  });
}

type FoundFile = { path: string; handle: FileSystemFileHandle };

/** Lists every audio file under a folder, including sub-folders. */
async function listAudio(
  dir: FileSystemDirectoryHandle,
  prefix = "",
): Promise<FoundFile[]> {
  const found: FoundFile[] = [];
  const entries = (
    dir as unknown as {
      entries(): AsyncIterable<[string, FileSystemHandle]>;
    }
  ).entries();
  for await (const [name, handle] of entries) {
    if (name.startsWith(".")) continue;
    if (handle.kind === "directory") {
      found.push(
        ...(await listAudio(
          handle as FileSystemDirectoryHandle,
          `${prefix}${name}/`,
        )),
      );
    } else if (AUDIO_FILE.test(name)) {
      found.push({
        path: `${prefix}${name}`,
        handle: handle as FileSystemFileHandle,
      });
    }
  }
  return found;
}

/**
 * Brings the library in line with a linked folder: new files are added,
 * changed files are re-read, and songs whose file is gone are removed.
 * Nothing is copied.
 */
/** Appends one song to the end of a playlist, unless it is already in it. */
async function appendToPlaylist(playlistId: string, trackId: string) {
  await db.transaction("rw", [db.playlists, db.playlistItems], async () => {
    if (!(await db.playlists.get(playlistId))) return;
    const items = await db.playlistItems
      .where("playlistId")
      .equals(playlistId)
      .toArray();
    if (items.some((item) => item.trackId === trackId)) return;
    const last = items.reduce((max, item) => Math.max(max, item.position), -1);
    await db.playlistItems.add({
      id: crypto.randomUUID(),
      playlistId,
      trackId,
      position: last + 1,
      addedAt: Date.now(),
    });
  });
}

async function scanFolder(folder: {
  id: string;
  handle: FileSystemDirectoryHandle;
  playlistId: string;
}) {
  const files = (await listAudio(folder.handle)).sort((a, b) =>
    a.path.localeCompare(b.path, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
  const known = new Map(
    (await db.renditions.where("folderId").equals(folder.id).toArray()).map(
      (rendition) => [rendition.path, rendition],
    ),
  );

  let added = 0;
  let skipped = 0;
  const failed: string[] = [];
  const trackIds: (string | null)[] = [];
  const addedIds: string[] = [];
  const stale: string[] = [];

  for (let index = 0; index < files.length; index++) {
    const { path, handle } = files[index];
    post({ type: "progress", done: index, total: files.length, name: path });
    try {
      const file = await handle.getFile();
      const fingerprint = `linked:${folder.id}:${path}:${file.size}:${file.lastModified}`;
      const existing = known.get(path);
      known.delete(path);
      if (existing?.fingerprint === fingerprint) {
        skipped++;
        trackIds.push(existing.trackId);
        continue;
      }
      // The file was replaced or re-tagged: read it again from scratch.
      if (existing) await removeTracks([existing.trackId]);
      const trackId = await addSong(file, fingerprint, {
        source: "linked",
        folderId: folder.id,
        path,
      });
      // Show it in the folder's playlist right away, not when the scan ends.
      await appendToPlaylist(folder.playlistId, trackId);
      trackIds.push(trackId);
      addedIds.push(trackId);
      added++;
    } catch (error) {
      trackIds.push(null);
      failed.push(`${path}: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Whatever is still in `known` was not found on disk this time.
  for (const rendition of known.values()) stale.push(rendition.trackId);
  await removeTracks(stale);

  post({
    type: "finished",
    added,
    skipped,
    removed: stale.length,
    failed,
    trackIds,
    addedIds,
  });
}

self.onmessage = async (event: MessageEvent<ImportRequest>) => {
  const request = event.data;
  try {
    if ("folder" in request) await scanFolder(request.folder);
    else await importFiles(request.files);
  } catch (error) {
    post({
      type: "finished",
      added: 0,
      skipped: 0,
      removed: 0,
      failed: [error instanceof Error ? error.message : String(error)],
      trackIds: [],
      addedIds: [],
    });
  }
};
