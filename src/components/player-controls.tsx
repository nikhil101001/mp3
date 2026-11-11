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
  "flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-90";

/** Bare play/pause glyph; the surrounding bar or screen supplies the surface. */
export function PlayButton({ size = 48 }: { size?: number }) {
  const playing = usePlayer((state) => state.playing);
  return (
    <button
      aria-label={playing ? "Pause" : "Play"}
      className={round}
      style={{ width: size, height: size }}
      onClick={(event) => {
        event.stopPropagation();
        togglePlay();
      }}
    >
      <Icon name={playing ? "pause" : "play"} size={size * 0.7} />
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
      <Icon name={direction} size={size * 0.62} />
    </button>
  );
}

/** A round glass toggle; lit with the accent colour when on. */
const toggle = (on: boolean) =>
  `${round} relative h-11 w-11 ${
    on ? "bg-accent text-black" : "glass-thin text-white/80"
  }`;

export function ShuffleButton() {
  const shuffle = usePlayer((state) => state.shuffle);
  return (
    <button
      aria-label="Shuffle"
      aria-pressed={shuffle}
      className={toggle(shuffle)}
      onClick={toggleShuffle}
    >
      <Icon name="shuffle" size={19} />
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
      className={toggle(repeat !== "off")}
      onClick={cycleRepeat}
    >
      <Icon name="repeat" size={19} />
      {repeat === "one" && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black">
          1
        </span>
      )}
    </button>
  );
}
