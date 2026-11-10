import type { ReactNode } from "react";

const FILLED: Record<string, ReactNode> = {
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M6 5h4v14H6zM14 5h4v14h-4z" />,
  next: <path d="M6 6l8.5 6L6 18zM16 6h2v12h-2z" />,
  previous: <path d="M18 6l-8.5 6 8.5 6zM6 6h2v12H6z" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </>
  ),
};

const STROKED: Record<string, ReactNode> = {
  shuffle: <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />,
  repeat: (
    <path d="m17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
  ),
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  queue: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  songs: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  albums: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  artists: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  settings: (
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
};

export type IconName =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "more"
  | "shuffle"
  | "repeat"
  | "chevron-down"
  | "queue"
  | "songs"
  | "albums"
  | "artists"
  | "settings"
  | "plus"
  | "close";

export function Icon({
  name,
  size = 24,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const filled = name in FILLED;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {filled ? FILLED[name] : STROKED[name]}
    </svg>
  );
}
