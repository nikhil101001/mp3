"use client";

import { usePlayer } from "@/lib/player";
import { Artwork } from "./artwork";
import {
  PlayButton,
  RepeatButton,
  ShuffleButton,
  SkipButton,
} from "./player-controls";
import { SeekBar } from "./seek-bar";

/** The persistent bar above the tabs. Tapping it opens the now-playing screen. */
export function PlayerBar({ onExpand }: { onExpand: () => void }) {
  const track = usePlayer((state) => state.track);
  const error = usePlayer((state) => state.error);
  const progress = usePlayer((state) =>
    state.duration > 0 ? state.time / state.duration : 0,
  );
  if (!track) return null;

  return (
    <div className="relative border-t border-line bg-surface">
      {/* Phones get a thin progress line; desktop has the full seek bar. */}
      <div
        className="absolute left-0 top-0 h-0.5 bg-accent md:hidden"
        style={{ width: `${progress * 100}%` }}
      />
      <div className="flex items-center gap-3 px-3 py-2 md:grid md:grid-cols-[1fr_minmax(0,2fr)_1fr] md:px-4">
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onExpand}
          aria-label="Open now playing"
        >
          <Artwork id={track.artworkId} className="h-11 w-11" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {track.title}
            </span>
            <span
              className={`block truncate text-xs ${error ? "text-bad" : "text-muted"}`}
            >
              {error ?? track.artist}
            </span>
          </span>
        </button>

        <div className="hidden flex-col items-center md:flex">
          <div className="flex items-center gap-2">
            <ShuffleButton />
            <SkipButton direction="previous" size={40} />
            <PlayButton size={40} />
            <SkipButton direction="next" size={40} />
            <RepeatButton />
          </div>
          <SeekBar />
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <PlayButton size={40} />
          <SkipButton direction="next" size={40} />
        </div>
        <div className="hidden md:block" />
      </div>
    </div>
  );
}
