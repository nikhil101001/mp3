export type ImportRequest = { files: File[] };

export type ImportProgress =
  | { type: "progress"; done: number; total: number; name: string }
  | { type: "finished"; added: number; skipped: number; failed: string[] };
