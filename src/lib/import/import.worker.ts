// Imports picked files into the library: reads tags and cover art, copies the
// audio into app storage (OPFS) and writes the records to the database.
// Runs in a worker so a large import never freezes the screen, and because
// Safari only allows synchronous OPFS writes in a worker.

import { parseBlob, selectCover } from "music-metadata";
import { db, libraryDir, type Rendition, type Track } from "../db";
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

async function importOne(
  file: File,
): Promise<{ status: "added" | "skipped"; trackId: string }> {
  const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
  const existing = await db.renditions
    .where("fingerprint")
    .equals(fingerprint)
    .first();
  if (existing) return { status: "skipped", trackId: existing.trackId };

  const metadata = await parseBlob(file, { duration: true });
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
  const path = `${trackId}.${extension(file.name)}`;
  await copyToStorage(file, path);

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
    source: "imported",
    path,
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
  return { status: "added", trackId };
}

self.onmessage = async (event: MessageEvent<ImportRequest>) => {
  const { files } = event.data;
  let added = 0;
  let skipped = 0;
  const failed: string[] = [];
  const trackIds: (string | null)[] = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    post({ type: "progress", done: index, total: files.length, name: file.name });
    try {
      const result = await importOne(file);
      if (result.status === "added") added++;
      else skipped++;
      trackIds.push(result.trackId);
    } catch (error) {
      trackIds.push(null);
      failed.push(`${file.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
  post({ type: "finished", added, skipped, failed, trackIds });
};
