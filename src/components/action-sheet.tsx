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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass w-full max-w-sm rounded-3xl p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative px-3 py-2">
          <p className="truncate font-medium">{title}</p>
          {subtitle && <p className="truncate text-sm text-white/60">{subtitle}</p>}
        </div>
        {actions.map((action) => (
          <button
            key={action.label}
            className="relative flex min-h-12 w-full items-center rounded-2xl px-3 text-left hover:bg-white/10 active:bg-white/10"
            onClick={() => {
              action.onSelect();
              onClose();
            }}
          >
            {action.label}
          </button>
        ))}
        <button
          className="relative mt-1 flex min-h-12 w-full items-center justify-center rounded-2xl font-semibold text-accent hover:bg-white/10 active:bg-white/10"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
