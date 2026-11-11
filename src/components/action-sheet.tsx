"use client";

import { useEffect, useState, type ReactNode } from "react";

/** A glass panel over a dimmed page: bottom on phones, centred on desktop. */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fade-in fixed inset-0 z-[60] flex items-end justify-center bg-black/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="glass sheet-in max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-3xl p-2"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export const sheetRow =
  "relative flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-white/10 active:bg-white/10";

export function SheetTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="relative px-3 py-2">
      <p className="truncate font-medium">{title}</p>
      {subtitle && <p className="truncate text-sm text-white/60">{subtitle}</p>}
    </div>
  );
}

export function SheetCancel({ onClose }: { onClose: () => void }) {
  return (
    <button
      className="relative mt-1 flex min-h-12 w-full items-center justify-center rounded-2xl font-semibold text-accent hover:bg-white/10 active:bg-white/10"
      onClick={onClose}
    >
      Cancel
    </button>
  );
}

export type SheetAction = {
  label: string;
  onSelect: () => void;
  /** Marks actions that remove something. */
  destructive?: boolean;
  /** Leave the sheet open, for actions that swap in another sheet. */
  keepOpen?: boolean;
};

/** A short menu of actions for one item. */
export function ActionSheet({
  title,
  subtitle,
  actions,
  onClose,
}: {
  title: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <Sheet label={title} onClose={onClose}>
      <SheetTitle title={title} subtitle={subtitle} />
      {actions.map((action) => (
        <button
          key={action.label}
          className={`${sheetRow} ${action.destructive ? "text-bad" : ""}`}
          onClick={() => {
            action.onSelect();
            if (!action.keepOpen) onClose();
          }}
        >
          {action.label}
        </button>
      ))}
      <SheetCancel onClose={onClose} />
    </Sheet>
  );
}

/** Asks for a name, for creating or renaming a playlist. */
export function NameSheet({
  title,
  initial = "",
  confirmLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: string;
  confirmLabel: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <Sheet label={title} onClose={onClose}>
      <SheetTitle title={title} />
      <form
        className="relative px-2 pb-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onSubmit(name);
          onClose();
        }}
      >
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Playlist name"
          aria-label="Playlist name"
          maxLength={80}
          className="h-12 w-full rounded-xl bg-white/10 px-3 text-[16px] outline-none placeholder:text-white/40 focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="mt-2 flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent font-semibold text-black disabled:opacity-40"
        >
          {confirmLabel}
        </button>
      </form>
      <SheetCancel onClose={onClose} />
    </Sheet>
  );
}
