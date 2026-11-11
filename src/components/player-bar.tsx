"use client";

import { usePlayer } from "@/lib/player";
import { useTrackSwipe } from "@/lib/use-track-swipe";
import { Artwork } from "./artwork";
import { Icon } from "./icons";
import {
  PlayButton,
  RepeatButton,
  ShuffleButton,
  SkipButton,
} from "./player-controls";
import { SeekBar } from "./seek-bar";

/**
 * The floating glass player. A compact capsule on phones; a wider bar with
 * seek and shuffle/repeat on desktop. Tap the song or swipe up to open
 * now-playing; swipe left or right to change track.
 */
export function PlayerBar({
  onExpand,
  miniPlayer,
}: {
  onExpand: () => void;
  /** Present only where the browser supports a floating window. */
  miniPlayer?: { open: boolean; toggle: () => void };
}) {
  const track = usePlayer((state) => state.track);
  const error = usePlayer((state) => state.error);
  const { slideRef, handlers, enterClass } = useTrackSwipe({
    onUp: onExpand,
  });
  if (!track) return null;

  return (
    <div className="glass rise-in pointer-events-auto mx-auto w-full max-w-3xl rounded-[1.4rem] md:rounded-3xl">
      <div className="relative flex items-center gap-2 p-2 md:gap-4 md:px-3">
        <button
          className="flex min-w-0 flex-1 touch-none items-center overflow-hidden rounded-xl text-left md:w-56 md:flex-none"
          onClick={onExpand}
          aria-label="Open now playing"
          {...handlers}
        >
          {/* This wrapper follows the finger on a sideways swipe; its child
              is keyed by song so the next one slides in from the other side. */}
          <div ref={slideRef} className="min-w-0 flex-1">
            <div
              key={track.id}
              className={`${enterClass ?? "fade-in"} flex min-w-0 items-center gap-3`}
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
            </div>
          </div>
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
          {miniPlayer && (
            <button
              aria-label={
                miniPlayer.open ? "Close mini player" : "Open mini player"
              }
              aria-pressed={miniPlayer.open}
              title="Mini player"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${
                miniPlayer.open
                  ? "bg-accent text-black"
                  : "glass-thin text-white/80"
              }`}
              onClick={miniPlayer.toggle}
            >
              <Icon name="pip" size={19} />
            </button>
          )}
        </div>

        <div className="flex items-center md:hidden">
          <PlayButton size={40} />
          <SkipButton direction="next" size={40} />
        </div>
      </div>
    </div>
  );
}
