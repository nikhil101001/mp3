"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
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
    return <p className="px-2 py-6 text-center text-muted">Nothing up next.</p>;
  }
  return (
    <ul>
      {(upcoming ?? []).map((track: Track | undefined, i) =>
        track ? (
          <li key={`${track.id}:${i}`} className="flex items-center">
            <button
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left hover:bg-surface active:bg-surface"
              onClick={() => jumpTo(index + 1 + i)}
            >
              <Artwork id={track.artworkId} className="h-10 w-10" />
              <span className="min-w-0">
                <span className="block truncate">{track.title}</span>
                <span className="block truncate text-sm text-muted">
                  {track.artist}
                </span>
              </span>
            </button>
            <button
              aria-label={`Remove ${track.title} from queue`}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-foreground"
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

/** The full-screen player that slides up from the player bar. */
export function NowPlaying({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const track = usePlayer((state) => state.track);
  const error = usePlayer((state) => state.error);
  const [showQueue, setShowQueue] = useState(false);

  return (
    <div
      inert={!open}
      className={`fixed inset-0 z-50 flex flex-col bg-background transition-transform duration-300 ease-out ${
        open ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <header className="flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          aria-label="Close now playing"
          className="flex h-11 w-11 items-center justify-center"
          onClick={onClose}
        >
          <Icon name="chevron-down" />
        </button>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">
          {showQueue ? "Up next" : "Now playing"}
        </span>
        <button
          aria-label="Show queue"
          aria-pressed={showQueue}
          className={`flex h-11 w-11 items-center justify-center ${showQueue ? "text-accent" : ""}`}
          onClick={() => setShowQueue((value) => !value)}
        >
          <Icon name="queue" size={22} />
        </button>
      </header>

      {track && (
        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex min-h-0 flex-1 items-center justify-center py-4">
            {showQueue ? (
              <div className="h-full w-full overflow-y-auto overscroll-contain">
                <Queue />
              </div>
            ) : (
              <Artwork
                id={track.artworkId}
                size="large"
                rounded="rounded-2xl"
                className="max-h-full w-full max-w-[min(100%,52dvh)] shadow-2xl shadow-black/60"
              />
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-xl font-semibold">{track.title}</p>
            <p className={`truncate ${error ? "text-bad" : "text-muted"}`}>
              {error ?? `${track.artist} · ${track.album}`}
            </p>
          </div>

          <div className="mt-5">
            <SeekBar />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <ShuffleButton />
            <SkipButton direction="previous" size={56} />
            <PlayButton size={72} />
            <SkipButton direction="next" size={56} />
            <RepeatButton />
          </div>
        </div>
      )}
    </div>
  );
}
