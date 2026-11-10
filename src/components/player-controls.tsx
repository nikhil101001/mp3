"use client";

import {
  cycleRepeat,
  next,
  previous,
  togglePlay,
  toggleShuffle,
  usePlayer,
} from "@/lib/player";
import { Icon } from "./icons";

const round =
  "flex shrink-0 items-center justify-center rounded-full active:opacity-70";

export function PlayButton({ size = 48 }: { size?: number }) {
  const playing = usePlayer((state) => state.playing);
  return (
    <button
      aria-label={playing ? "Pause" : "Play"}
      className={`${round} bg-foreground text-background`}
      style={{ width: size, height: size }}
      onClick={(event) => {
        event.stopPropagation();
        togglePlay();
      }}
    >
      <Icon name={playing ? "pause" : "play"} size={size * 0.5} />
    </button>
  );
}

export function SkipButton({
  direction,
  size = 44,
}: {
  direction: "next" | "previous";
  size?: number;
}) {
  return (
    <button
      aria-label={direction === "next" ? "Next track" : "Previous track"}
      className={round}
      style={{ width: size, height: size }}
      onClick={(event) => {
        event.stopPropagation();
        if (direction === "next") next();
        else previous();
      }}
    >
      <Icon name={direction} size={size * 0.6} />
    </button>
  );
}

export function ShuffleButton() {
  const shuffle = usePlayer((state) => state.shuffle);
  return (
    <button
      aria-label="Shuffle"
      aria-pressed={shuffle}
      className={`${round} h-11 w-11 ${shuffle ? "text-accent" : "text-muted"}`}
      onClick={toggleShuffle}
    >
      <Icon name="shuffle" size={20} />
    </button>
  );
}

export function RepeatButton() {
  const repeat = usePlayer((state) => state.repeat);
  const label =
    repeat === "one"
      ? "Repeat: this song"
      : repeat === "all"
        ? "Repeat: all"
        : "Repeat: off";
  return (
    <button
      aria-label={label}
      className={`${round} relative h-11 w-11 ${repeat === "off" ? "text-muted" : "text-accent"}`}
      onClick={cycleRepeat}
    >
      <Icon name="repeat" size={20} />
      {repeat === "one" && (
        <span className="absolute right-1 top-1 rounded-full bg-accent px-1 text-[9px] font-bold leading-3 text-black">
          1
        </span>
      )}
    </button>
  );
}
