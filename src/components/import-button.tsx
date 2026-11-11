"use client";

import { importFiles, useImport } from "@/lib/import/client";

const ACCEPT = "audio/*,.mp3,.m4a,.aac,.flac,.wav,.aiff,.ogg,.opus";

function onPick(event: React.ChangeEvent<HTMLInputElement>) {
  const files = Array.from(event.target.files ?? []);
  event.target.value = "";
  if (files.length > 0) importFiles(files);
}

export function ImportButton({
  primary = false,
  folder = false,
}: {
  primary?: boolean;
  /** Picks a whole folder. Desktop browsers only. */
  folder?: boolean;
}) {
  const running = useImport((state) => state.running);
  const look = primary
    ? "bg-accent text-black font-semibold"
    : "card font-medium text-accent";
  return (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-5 text-sm active:opacity-80 ${look} ${running ? "pointer-events-none opacity-50" : ""}`}
    >
      {folder ? "Import a folder" : "Import songs"}
      <input
        type="file"
        multiple
        accept={folder ? undefined : ACCEPT}
        className="sr-only"
        disabled={running}
        onChange={onPick}
        {...(folder ? { webkitdirectory: "" } : {})}
      />
    </label>
  );
}

/** Progress and result of an import, shown above the player bar. */
export function ImportStatus() {
  const { running, done, total, current, result } = useImport();
  if (running) {
    return (
      <div className="glass pointer-events-auto mx-auto w-full max-w-3xl rounded-2xl px-4 py-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <span className="truncate">Importing {current}</span>
          <span className="shrink-0 text-xs tabular-nums text-white/60">
            {done + 1} / {total}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full bg-accent transition-[width]"
            style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
          />
        </div>
      </div>
    );
  }
  if (!result) return null;
  const parts = [
    `Added ${result.added}`,
    result.skipped > 0 ? `${result.skipped} already in library` : "",
    result.failed.length > 0 ? `${result.failed.length} failed` : "",
  ].filter(Boolean);
  return (
    <div className="glass pointer-events-auto mx-auto flex w-full max-w-3xl items-start justify-between gap-3 rounded-2xl px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <p>{parts.join(" · ")}</p>
        {result.failed.slice(0, 3).map((line) => (
          <p key={line} className="truncate text-xs text-bad">
            {line}
          </p>
        ))}
      </div>
      <button
        className="relative shrink-0 font-medium text-accent"
        onClick={() => useImport.setState({ result: null })}
      >
        Dismiss
      </button>
    </div>
  );
}
