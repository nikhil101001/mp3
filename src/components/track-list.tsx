"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, type ReactNode } from "react";
import type { Track } from "@/lib/db";
import { formatTime } from "@/lib/format";
import { addToQueue, playNext, playTracks, usePlayer } from "@/lib/player";
import { ActionSheet } from "./action-sheet";
import { Artwork } from "./artwork";
import { Icon } from "./icons";

const ROW_HEIGHT = 58;

/**
 * A scrolling list of tracks that only renders the rows on screen, so a
 * library of tens of thousands of songs stays smooth. `header` scrolls away
 * with the list as its first item.
 */
export function TrackList({
  tracks,
  header,
  variant = "songs",
}: {
  tracks: Track[];
  header?: ReactNode;
  /** "album" shows track numbers in place of covers. */
  variant?: "songs" | "album";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentId = usePlayer((state) => state.track?.id);
  const [menuFor, setMenuFor] = useState<Track | null>(null);
  const offset = header ? 1 : 0;

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: tracks.length + offset,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (header && index === 0 ? 160 : ROW_HEIGHT),
    overscan: 12,
  });

  const ids = () => tracks.map((track) => track.id);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const style = {
            transform: `translateY(${item.start}px)`,
          };
          if (header && item.index === 0) {
            return (
              <div
                key="header"
                ref={virtualizer.measureElement}
                data-index={0}
                className="absolute left-0 top-0 w-full"
                style={style}
              >
                {header}
              </div>
            );
          }
          const index = item.index - offset;
          const track = tracks[index];
          const active = track.id === currentId;
          return (
            <div
              key={track.id}
              className="absolute left-0 top-0 flex w-full items-center pl-4 pr-1 md:pl-6 md:pr-3"
              style={{ ...style, height: ROW_HEIGHT }}
            >
              {/* Hairline under the row, starting where the text starts. */}
              <span
                aria-hidden="true"
                className={`absolute bottom-0 right-0 h-px bg-white/[0.08] ${variant === "album" ? "left-14 md:left-16" : "left-[4.5rem] md:left-[5rem]"}`}
              />
              <button
                className="flex h-full min-w-0 flex-1 items-center gap-3 text-left active:opacity-60"
                onClick={() => playTracks(ids(), index)}
              >
                {variant === "album" ? (
                  <span
                    className={`w-7 shrink-0 text-center text-[15px] tabular-nums ${active ? "text-accent" : "text-muted"}`}
                  >
                    {track.trackNo || index + 1}
                  </span>
                ) : (
                  <Artwork id={track.artworkId} className="h-11 w-11" rounded="rounded-[0.45rem]" />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[16px] leading-snug ${active ? "text-accent" : ""}`}
                  >
                    {track.title}
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {variant === "album"
                      ? track.artist
                      : `${track.artist} · ${track.album}`}
                  </span>
                </span>
                <span className="shrink-0 pl-2 text-xs tabular-nums text-muted">
                  {formatTime(track.durationMs / 1000)}
                </span>
              </button>
              <button
                aria-label={`More options for ${track.title}`}
                className="flex h-full w-11 shrink-0 items-center justify-center text-muted hover:text-foreground"
                onClick={() => setMenuFor(track)}
              >
                <Icon name="more" size={20} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="chrome-space" />
      {menuFor && (
        <ActionSheet
          title={menuFor.title}
          subtitle={menuFor.artist}
          onClose={() => setMenuFor(null)}
          actions={[
            { label: "Play next", onSelect: () => playNext(menuFor.id) },
            { label: "Add to queue", onSelect: () => addToQueue(menuFor.id) },
          ]}
        />
      )}
    </div>
  );
}
