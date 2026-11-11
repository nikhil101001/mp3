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

/**
 * The floating glass player. A compact capsule on phones; a wider bar with
 * seek and shuffle/repeat on desktop. Tapping the song opens now-playing.
 */
export function PlayerBar({ onExpand }: { onExpand: () => void }) {
  const track = usePlayer((state) => state.track);
  const error = usePlayer((state) => state.error);
  if (!track) return null;

  return (
    <div className="glass pointer-events-auto mx-auto w-full max-w-3xl rounded-[1.4rem] md:rounded-3xl">
      <div className="relative flex items-center gap-2 p-2 md:gap-4 md:px-3">
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left md:max-w-56 md:flex-none"
          onClick={onExpand}
          aria-label="Open now playing"
        >
          <Artwork
            id={track.artworkId}
            rounded="rounded-[0.6rem]"
            className="h-10 w-10 shadow-md shadow-black/40 md:h-11 md:w-11"
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-medium leading-tight">
              {track.title}
            </span>
            <span
              className={`block truncate text-xs ${error ? "text-bad" : "text-white/60"}`}
            >
              {error ?? track.artist}
            </span>
          </span>
        </button>

        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <SkipButton direction="previous" size={36} />
          <PlayButton size={40} />
          <SkipButton direction="next" size={36} />
          <div className="min-w-0 flex-1 px-1">
            <SeekBar showTimes={false} />
          </div>
          <ShuffleButton />
          <RepeatButton />
        </div>

        <div className="flex items-center md:hidden">
          <PlayButton size={40} />
          <SkipButton direction="next" size={40} />
        </div>
      </div>
    </div>
  );
}
