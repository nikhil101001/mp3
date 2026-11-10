import { create } from "zustand";
import type { ImportProgress } from "./types";

const AUDIO_FILE = /\.(mp3|m4a|aac|flac|wav|aif|aiff|ogg|oga|opus|mp4|m4b|wma|caf)$/i;

type ImportState = {
  running: boolean;
  done: number;
  total: number;
  current: string;
  /** Result of the last finished import, shown until the next one starts. */
  result: { added: number; skipped: number; failed: string[] } | null;
};

export const useImport = create<ImportState>(() => ({
  running: false,
  done: 0,
  total: 0,
  current: "",
  result: null,
}));

/** Copies the picked audio files into the library. Other files are ignored. */
export function importFiles(picked: File[]): void {
  if (useImport.getState().running) return;
  const files = picked.filter(
    (file) => file.type.startsWith("audio/") || AUDIO_FILE.test(file.name),
  );
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
      useImport.setState({
        running: false,
        result: {
          added: message.added,
          skipped: message.skipped,
          failed: message.failed,
        },
      });
      worker.terminate();
    }
  };
  worker.onerror = (event) => {
    useImport.setState({
      running: false,
      result: { added: 0, skipped: 0, failed: [event.message || "Import failed."] },
    });
    worker.terminate();
  };
  worker.postMessage({ files });
}
