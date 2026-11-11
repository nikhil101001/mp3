export type ImportRequest = { files: File[] };

export type ImportProgress =
  | { type: "progress"; done: number; total: number; name: string }
  | {
      type: "finished";
      added: number;
      skipped: number;
      failed: string[];
      /** The song for each picked file, in order; null where import failed. */
      trackIds: (string | null)[];
    };
