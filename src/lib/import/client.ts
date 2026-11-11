import { create } from "zustand";
import { addManyToPlaylist, createPlaylist } from "../playlists";
import type { ImportProgress } from "./types";

const AUDIO_FILE =
  /\.(mp3|m4a|aac|flac|wav|aif|aiff|ogg|oga|opus|mp4|m4b|wma|caf)$/i;

type ImportState = {
  running: boolean;
  done: number;
  total: number;
  current: string;
  /** Result of the last finished import, shown until the next one starts. */
  result: {
    added: number;
    skipped: number;
    failed: string[];
    /** Set when the import also made a playlist. */
    playlist?: { id: string; name: string; count: number };
  } | null;
};

export const useImport = create<ImportState>(() => ({
  running: false,
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

  useImport.setState({
    running: true,
    done: 0,
    total: files.length,
    current: files[0].name,
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
    } else {
      worker.terminate();
      const result = {
        added: message.added,
        skipped: message.skipped,
        failed: message.failed,
      };
      const trackIds = message.trackIds.filter((id) => id !== null);
      if (!playlistName || trackIds.length === 0) {
        useImport.setState({ running: false, result });
        return;
      }
      void (async () => {
        const playlist = await createPlaylist(playlistName);
        const count = await addManyToPlaylist(playlist.id, trackIds);
        useImport.setState({
          running: false,
          result: {
            ...result,
            playlist: { id: playlist.id, name: playlist.name, count },
          },
        });
      })();
    }
  };
  worker.onerror = (event) => {
    useImport.setState({
      running: false,
      result: {
        added: 0,
        skipped: 0,
        failed: [event.message || "Import failed."],
      },
    });
    worker.terminate();
  };
  worker.postMessage({ files });
}
