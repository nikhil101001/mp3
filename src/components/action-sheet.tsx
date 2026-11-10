"use client";

import { useEffect } from "react";

export type SheetAction = { label: string; onSelect: () => void };

/** A small menu: slides up from the bottom on phones, centred on desktop. */
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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-t-2xl border border-line bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-3 py-2">
          <p className="truncate font-medium">{title}</p>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
        {actions.map((action) => (
          <button
            key={action.label}
            className="flex min-h-12 w-full items-center rounded-lg px-3 text-left hover:bg-line active:bg-line"
            onClick={() => {
              action.onSelect();
              onClose();
            }}
          >
            {action.label}
          </button>
        ))}
        <button
          className="mt-1 flex min-h-12 w-full items-center justify-center rounded-lg text-muted hover:bg-line active:bg-line"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
