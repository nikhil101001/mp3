"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useArtworkUrl } from "@/lib/artwork";
import { db, type Track } from "@/lib/db";
import { jumpTo, removeFromQueue, usePlayer } from "@/lib/player";
import { Artwork } from "./artwork";
import { Icon } from "./icons";
import {
  PlayButton,
  RepeatButton,
  ShuffleButton,
  SkipButton,
} from "./player-controls";
import { SeekBar } from "./seek-bar";

function Queue() {
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  // Only what is still to come, capped so a huge queue stays light.
  const upcomingIds = queue.slice(index + 1, index + 101);
  const upcoming = useLiveQuery(
    () => db.tracks.bulkGet(upcomingIds),
    [upcomingIds.join(",")],
  );

  if (upcomingIds.length === 0) {
    return (
      <p className="px-2 py-10 text-center text-white/60">Nothing up next.</p>
    );
  }
  return (
    <ul>
      {(upcoming ?? []).map((track: Track | undefined, i) =>
        track ? (
          <li key={`${track.id}:${i}`} className="flex items-center">
            <button
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left active:bg-white/10"
              onClick={() => jumpTo(index + 1 + i)}
            >
              <Artwork id={track.artworkId} className="h-11 w-11" />
              <span className="min-w-0">
                <span className="block truncate">{track.title}</span>
                <span className="block truncate text-sm text-white/60">
                  {track.artist}
                </span>
              </span>
            </button>
            <button
              aria-label={`Remove ${track.title} from queue`}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-white/50 active:text-white"
              onClick={() => removeFromQueue(index + 1 + i)}
            >
              <Icon name="close" size={18} />
            </button>
          </li>
        ) : null,
      )}
    </ul>
  );
}

/**
 * The full-screen player. Its background is the current cover, heavily
 * blurred, so every song tints the whole screen in its own colours.
 */
export function NowPlaying({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const track = usePlayer((state) => state.track);
  const playing = usePlayer((state) => state.playing);
  const error = usePlayer((state) => state.error);
  const backdrop = useArtworkUrl(track?.artworkId, "large");
  const [showQueue, setShowQueue] = useState(false);

  return (
    <div
      inert={!open}
      className={`motion-safe-only fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#1b1b1f] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
        open ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {backdrop ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backdrop}
          alt=""
          className="absolute inset-0 h-full w-full scale-150 object-cover blur-3xl saturate-150"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-accent/40 to-transparent" />
      )}
      <div className="absolute inset-0 bg-black/45" />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <header className="flex justify-center pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            aria-label="Close now playing"
            className="flex h-9 w-24 items-center justify-center"
            onClick={onClose}
          >
            <span className="h-1.5 w-10 rounded-full bg-white/40" />
          </button>
        </header>

        {track && (
          <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-7 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex min-h-0 flex-1 items-center justify-center py-4">
              {showQueue ? (
                <div className="h-full w-full overflow-y-auto overscroll-contain">
                  <p className="px-2 pb-2 text-lg font-semibold">Up next</p>
                  <Queue />
                </div>
              ) : (
                <Artwork
                  id={track.artworkId}
                  size="large"
                  rounded="rounded-2xl"
                  className={`motion-safe-only max-h-full w-full max-w-[min(100%,50dvh)] shadow-2xl shadow-black/60 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    playing ? "scale-100" : "scale-[0.82]"
                  }`}
                />
              )}
            </div>

            <div className="min-w-0">
              <p className="truncate text-[22px] font-semibold leading-tight">
                {track.title}
              </p>
              <p
                className={`truncate text-lg ${error ? "text-bad" : "text-white/65"}`}
              >
                {error ?? track.artist}
              </p>
            </div>

            <div className="mt-4">
              <SeekBar />
            </div>

            <div className="mt-2 flex items-center justify-center gap-8">
              <SkipButton direction="previous" size={60} />
              <PlayButton size={76} />
              <SkipButton direction="next" size={60} />
            </div>

            <div className="mt-5 flex items-center justify-between px-6">
              <ShuffleButton />
              <RepeatButton />
              <button
                aria-label="Show queue"
                aria-pressed={showQueue}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90 ${
                  showQueue ? "bg-accent text-black" : "glass-thin text-white/80"
                }`}
                onClick={() => setShowQueue((value) => !value)}
              >
                <Icon name="queue" size={19} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
