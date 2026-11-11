import { create } from "zustand";
import { db } from "../db";
import { mirrorFolderPlaylist, pickFolder } from "../folders";
import { addManyToPlaylist, createPlaylist } from "../playlists";
import type { ImportProgress, ImportRequest } from "./types";

const AUDIO_FILE =
  /\.(mp3|m4a|aac|flac|wav|aif|aiff|ogg|oga|opus|mp4|m4b|wma|caf)$/i;

type ImportResult = {
  added: number;
  skipped: number;
  failed: string[];
  /** Folder scans only: songs whose file was gone from the folder. */
  removed?: number;
  /** Set when the run made or updated a playlist. */
  playlist?: { id: string; name: string; count: number };
  /** Set for folder scans, to word the result as an update. */
  folder?: boolean;
};

type ImportState = {
  running: boolean;
  /** Set while a linked folder is being read, to word the progress card. */
  folderName: string | null;
  done: number;
  total: number;
  current: string;
  /** Result of the last finished run, shown until the next one starts. */
  result: ImportResult | null;
};

export const useImport = create<ImportState>(() => ({
  running: false,
  folderName: null,
  done: 0,
  total: 0,
  current: "",
  result: null,
}));

/** Where a file sat inside the picked folder, or just its name. */
function pathOf(file: File): string {
  return file.webkitRelativePath || file.name;
}

/** Keeps only audio files, in folder order ("2" before "10"). */
export function audioFilesIn(picked: File[]): File[] {
  return picked
    .filter(
      (file) => file.type.startsWith("audio/") || AUDIO_FILE.test(file.name),
    )
    .sort((a, b) =>
      pathOf(a).localeCompare(pathOf(b), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
}

/** The name of the folder the files were picked from, when the browser says. */
export function folderNameOf(files: File[]): string | undefined {
  const first = files[0]?.webkitRelativePath;
  return first ? first.split("/")[0] : undefined;
}

type Finished = Extract<ImportProgress, { type: "finished" }>;

/** Runs the import worker, shows its progress, and hands over the result. */
function runWorker(
  request: ImportRequest,
  firstLabel: string,
  onFinished: (message: Finished) => Promise<ImportResult | null>,
) {
  useImport.setState({
    running: true,
    folderName: null,
    done: 0,
    total: "files" in request ? request.files.length : 0,
    current: firstLabel,
    result: null,
  });
  const worker = new Worker(new URL("./import.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<ImportProgress>) => {
    const message = event.data;
    if (message.type === "progress") {
      useImport.setState({
        done: message.done,
        total: message.total,
        current: message.name,
      });
      return;
    }
    worker.terminate();
    void onFinished(message).then((result) =>
      useImport.setState({ running: false, folderName: null, result }),
    );
  };
  worker.onerror = (event) => {
    worker.terminate();
    useImport.setState({
      running: false,
      folderName: null,
      result: {
        added: 0,
        skipped: 0,
        failed: [event.message || "Import failed."],
      },
    });
  };
  worker.postMessage(request);
}

/**
 * Copies the picked audio files into the library. Other files are ignored.
 * With `playlistName`, the songs also become a playlist of that name, in
 * folder order. Songs already in the library are reused, not copied again.
 */
export function importFiles(picked: File[], playlistName?: string): void {
  if (useImport.getState().running) return;
  const files = audioFilesIn(picked);
  if (files.length === 0) {
    useImport.setState({
      result: { added: 0, skipped: 0, failed: ["No audio files were picked."] },
    });
    return;
  }
  // Ask the browser not to evict the library when the device runs low on space.
  void navigator.storage?.persist?.();

  runWorker({ files }, files[0].name, async (message) => {
    const result: ImportResult = {
      added: message.added,
      skipped: message.skipped,
      failed: message.failed,
    };
    const trackIds = message.trackIds.filter((id) => id !== null);
    if (!playlistName || trackIds.length === 0) return result;
    const playlist = await createPlaylist(playlistName);
    const count = await addManyToPlaylist(playlist.id, trackIds);
    return {
      ...result,
      playlist: { id: playlist.id, name: playlist.name, count },
    };
  });
}

/**
 * Reads a linked folder in place: new songs join the library and the folder's
 * playlist, changed ones are re-read, missing ones are dropped. Nothing is
 * copied. Access to the folder must already be granted. With `quiet`, nothing
 * is shown unless the folder changed.
 */
export function scanFolder(folderId: string, quiet = false): void {
  if (useImport.getState().running) return;
  void db.folders.get(folderId).then((folder) => {
    if (!folder) return;
    runWorker(
      {
        folder: {
          id: folder.id,
          handle: folder.handle,
          playlistId: folder.playlistId,
        },
      },
      `Reading “${folder.name}”`,
      async (message) => {
        // Songs that failed to read are left out; the rest keep file order.
        await mirrorFolderPlaylist(
          folder.id,
          message.trackIds.filter((id) => id !== null),
        );
        const current = await db.folders.get(folder.id);
        const playlistId = current?.playlistId ?? folder.playlistId;
        const changed =
          message.added + message.removed + message.failed.length > 0;
        if (quiet && !changed) return null;
        const count = await db.playlistItems
          .where("playlistId")
          .equals(playlistId)
          .count();
        return {
          added: message.added,
          skipped: message.skipped,
          removed: message.removed,
          failed: message.failed,
          folder: true,
          playlist: { id: playlistId, name: folder.name, count },
        };
      },
    );
    useImport.setState({ folderName: folder.name });
  });
}

/** Picks a folder to link and reads it. Must run from a tap or click. */
export async function linkFolder(): Promise<void> {
  if (useImport.getState().running) return;
  try {
    const folder = await pickFolder();
    if (folder) scanFolder(folder.id);
  } catch (error) {
    useImport.setState({
      result: {
        added: 0,
        skipped: 0,
        failed: [error instanceof Error ? error.message : String(error)],
      },
    });
  }
}
