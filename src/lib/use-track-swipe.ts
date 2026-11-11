import { useRef, useState } from "react";
import { next, previous } from "./player";

const SKIP_DISTANCE = 64;
const UP_DISTANCE = 40;
const DOWN_DISTANCE = 110;
const SLIDE_OUT_MS = 180;

type Options = {
  /** Flick up, for example to open now-playing. */
  onUp?: () => void;
  /** Drag down past the threshold, for example to close now-playing. */
  onDown?: () => void;
  /** Called with the downward distance while dragging, then null on release. */
  followDown?: (distance: number | null) => void;
};

/**
 * Swipe sideways to change track, with the content following the finger.
 *
 * Put `slideRef` on the element that should move (the cover, or the song
 * text). Inside it, key a child by the track and give it `enterClass`: after a
 * swipe the old content slides off one side and the new content slides in
 * from the other. Spread `handlers` on the area that should take the gesture,
 * which needs `touch-action: none`.
 */
export function useTrackSwipe({ onUp, onDown, followDown }: Options = {}) {
  const slideRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(
    null,
  );
  const moved = useRef(false);
  const [enterFrom, setEnterFrom] = useState<"left" | "right" | null>(null);

  function style(translate: string, opacity: string, transition: string) {
    const element = slideRef.current;
    if (!element) return;
    element.style.transition = transition;
    element.style.translate = translate;
    element.style.opacity = opacity;
  }

  /** Slides the content off, swaps the track, and lets the new one slide in. */
  function slideAway(direction: -1 | 1, change: () => void) {
    style(
      `${direction * 110}% 0`,
      "0",
      `translate ${SLIDE_OUT_MS}ms ease-in, opacity ${SLIDE_OUT_MS}ms ease-in`,
    );
    setTimeout(() => {
      setEnterFrom(direction < 0 ? "right" : "left");
      change();
      style("", "", "none");
      // Later track changes that are not swipes go back to the default entry.
      setTimeout(() => setEnterFrom(null), 600);
    }, SLIDE_OUT_MS);
  }

  const handlers = {
    onPointerDown(event: React.PointerEvent) {
      drag.current = { x: event.clientX, y: event.clientY, axis: null };
      moved.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: React.PointerEvent) {
      const from = drag.current;
      if (!from) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (!from.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
        from.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        moved.current = true;
      }
      if (from.axis === "x") {
        // Fade a little as it travels, so it reads as leaving.
        const fade = Math.max(0.35, 1 - Math.abs(dx) / 500);
        style(`${dx}px 0`, String(fade), "none");
      } else if (from.axis === "y") {
        followDown?.(dy);
      }
    },
    onPointerUp(event: React.PointerEvent) {
      const from = drag.current;
      drag.current = null;
      if (!from) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (from.axis === "y") {
        followDown?.(null);
        if (dy > DOWN_DISTANCE) onDown?.();
        else if (dy < -UP_DISTANCE) onUp?.();
      } else if (from.axis === "x") {
        if (dx < -SKIP_DISTANCE) slideAway(-1, next);
        else if (dx > SKIP_DISTANCE) slideAway(1, previous);
        else {
          // Not far enough: spring back to the middle.
          style(
            "",
            "",
            "translate 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease-out",
          );
        }
      }
    },
    onPointerCancel() {
      drag.current = null;
      followDown?.(null);
      style("", "", "translate 0.3s ease-out, opacity 0.3s ease-out");
    },
    /** A drag should not also count as a tap on whatever is underneath. */
    onClickCapture(event: React.MouseEvent) {
      if (!moved.current) return;
      moved.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  return {
    slideRef,
    handlers,
    /** Entry animation for the keyed content, or null for the default. */
    enterClass:
      enterFrom === "right"
        ? "slide-in-right"
        : enterFrom === "left"
          ? "slide-in-left"
          : null,
  };
}
