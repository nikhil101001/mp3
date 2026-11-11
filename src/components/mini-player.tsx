"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useArtworkUrl } from "@/lib/artwork";
import { usePlayer } from "@/lib/player";
import { Artwork } from "./artwork";
import { PlayButton, SkipButton } from "./player-controls";
import { SeekBar } from "./seek-bar";

// Document Picture-in-Picture: a small always-on-top window that can hold
// real page content. Chrome and Edge on desktop only, and not yet in the
// standard TypeScript library.
type DocumentPictureInPicture = {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
};

function pipApi(): DocumentPictureInPicture | undefined {
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;
}

const noSubscription = () => () => {};

/** Copies the app's styles into the new window, which starts with none. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      target.head.appendChild(style);
    } catch {
      // A stylesheet from another origin can't be read; link to it instead.
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
  target.documentElement.className = document.documentElement.className;
  target.body.style.margin = "0";
  target.title = "mp3";
}

/** What the floating window shows: cover, song, seek bar and transport. */
function MiniPlayerContent() {
  const track = usePlayer((state) => state.track);
  const backdrop = useArtworkUrl(track?.artworkId, "large");

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#1b1b1f] text-foreground">
      {backdrop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={backdrop}
          src={backdrop}
          alt=""
          className="fade-in absolute inset-0 h-full w-full scale-150 object-cover blur-3xl saturate-150"
        />
      )}
      <div className="absolute inset-0 bg-black/45" />
      {track ? (
        <div className="relative flex min-h-0 flex-1 flex-col gap-3 p-4">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Artwork
              id={track.artworkId}
              size="large"
              rounded="rounded-xl"
              className="h-full max-h-full shadow-2xl shadow-black/60"
            />
          </div>
          <div key={track.id} className="fade-in min-w-0 text-center">
            <p className="truncate font-semibold">{track.title}</p>
            <p className="truncate text-sm text-white/65">{track.artist}</p>
          </div>
          <SeekBar />
          <div className="flex items-center justify-center gap-5">
            <SkipButton direction="previous" size={40} />
            <PlayButton size={52} />
            <SkipButton direction="next" size={40} />
          </div>
        </div>
      ) : (
        <p className="relative m-auto text-sm text-white/65">Nothing playing</p>
      )}
    </div>
  );
}

/**
 * Controls the floating mini player. `portal` must be rendered somewhere that
 * stays mounted, so the window survives moving between pages.
 */
export function useMiniPlayer(): {
  supported: boolean;
  open: boolean;
  toggle: () => void;
  portal: ReactNode;
} {
  const supported = useSyncExternalStore(
    noSubscription,
    () => Boolean(pipApi()),
    () => false,
  );
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  const toggle = useCallback(() => {
    if (pipWindow) {
      pipWindow.close();
      return;
    }
    const api = pipApi();
    if (!api) return;
    // Must run straight from the click: browsers only allow this on a gesture.
    void api
      .requestWindow({ width: 320, height: 440 })
      .then((opened) => {
        copyStyles(opened.document);
        opened.addEventListener("pagehide", () => setPipWindow(null));
        setPipWindow(opened);
      })
      .catch(() => {
        // The browser refused (for example, no recent click). Nothing to do.
      });
  }, [pipWindow]);

  return {
    supported,
    open: Boolean(pipWindow),
    toggle,
    portal: pipWindow
      ? createPortal(<MiniPlayerContent />, pipWindow.document.body)
      : null,
  };
}
