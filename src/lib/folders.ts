// Linked folders: songs read in place from a folder on disk, never copied.
// Needs the browser's folder access, which only desktop Chrome and Edge have.

import { db, removeTracks, type LinkedFolder } from "./db";
import { addManyToPlaylist, createPlaylist } from "./playlists";

type Permission = "granted" | "denied" | "prompt";

/** Folder access calls that are not in the standard TypeScript library yet. */
type HandleWithPermission = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "read" }): Promise<Permission>;
  requestPermission(options: { mode: "read" }): Promise<Permission>;
};

type DirectoryPicker = (options?: {
  id?: string;
  mode?: "read";
  startIn?: string;
}) => Promise<FileSystemDirectoryHandle>;

function picker(): DirectoryPicker | undefined {
  return (window as unknown as { showDirectoryPicker?: DirectoryPicker })
    .showDirectoryPicker;
}

/** Whether this browser can link a folder (desktop Chrome and Edge). */
export function canLinkFolders(): boolean {
  return typeof window !== "undefined" && Boolean(picker());
}

export async function folderPermission(
  folder: LinkedFolder,
): Promise<Permission> {
  try {
    return await (folder.handle as HandleWithPermission).queryPermission({
      mode: "read",
    });
  } catch {
    return "denied";
  }
}

/**
 * Asks for access again. Browsers forget it when the app is closed unless the
 * listener chose "Allow on every visit", and only allow asking from a tap.
 */
export async function requestFolderPermission(
  folder: LinkedFolder,
): Promise<boolean> {
  try {
    const state = await (
      folder.handle as HandleWithPermission
    ).requestPermission({ mode: "read" });
    return state === "granted";
  } catch {
    return false;
  }
}

/** Opens a song's file inside its linked folder, asking for access if needed. */
export async function openLinkedFile(
  folderId: string,
  path: string,
): Promise<File> {
  const folder = await db.folders.get(folderId);
  if (!folder) throw new Error("This song's folder is no longer linked.");
  if ((await folderPermission(folder)) !== "granted") {
    const allowed = await requestFolderPermission(folder);
    if (!allowed) {
      throw new Error(
        `Allow access to “${folder.name}” in Settings to play this song.`,
      );
    }
  }
  try {
    let dir: FileSystemDirectoryHandle = folder.handle;
    const parts = path.split("/");
    const name = parts.pop()!;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    const handle = await dir.getFileHandle(name);
    return await handle.getFile();
  } catch {
    throw new Error(
      "This song's file has moved or been deleted. Rescan the folder in Settings.",
    );
  }
}

/**
 * Lets the listener pick a folder, and saves it with an empty playlist of the
 * same name. Returns null if the picker was cancelled. Must run from a tap.
 */
export async function pickFolder(): Promise<LinkedFolder | null> {
  const show = picker();
  if (!show) return null;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await show({ id: "mp3-music", mode: "read", startIn: "music" });
  } catch {
    return null; // Cancelled.
  }
  for (const existing of await db.folders.toArray()) {
    if (await existing.handle.isSameEntry(handle)) return existing;
  }
  const playlist = await createPlaylist(handle.name);
  const folder: LinkedFolder = {
    id: crypto.randomUUID(),
    name: handle.name,
    handle,
    playlistId: playlist.id,
    addedAt: Date.now(),
  };
  await db.folders.add(folder);
  return folder;
}

/** Appends songs a scan found for the first time to the folder's playlist. */
export async function syncFolderPlaylist(
  folderId: string,
  addedIds: string[],
): Promise<void> {
  const folder = await db.folders.get(folderId);
  if (!folder) return;
  if (!(await db.playlists.get(folder.playlistId))) {
    // The listener deleted the playlist; give the folder a fresh one.
    const playlist = await createPlaylist(folder.name);
    await db.folders.update(folderId, { playlistId: playlist.id });
    const all = await db.renditions
      .where("folderId")
      .equals(folderId)
      .toArray();
    await addManyToPlaylist(
      playlist.id,
      all.map((r) => r.trackId),
    );
  } else {
    await addManyToPlaylist(folder.playlistId, addedIds);
  }
  await db.folders.update(folderId, { lastScanAt: Date.now() });
}

/**
 * Forgets a folder: its songs leave the library and its playlist is deleted.
 * The files on disk are not touched.
 */
export async function unlinkFolder(folderId: string): Promise<void> {
  const folder = await db.folders.get(folderId);
  if (!folder) return;
  const renditions = await db.renditions
    .where("folderId")
    .equals(folderId)
    .toArray();
  await removeTracks(renditions.map((rendition) => rendition.trackId));
  await db.transaction(
    "rw",
    [db.playlists, db.playlistItems, db.folders],
    async () => {
      await db.playlistItems
        .where("playlistId")
        .equals(folder.playlistId)
        .delete();
      await db.playlists.delete(folder.playlistId);
      await db.folders.delete(folderId);
    },
  );
}
