import { useRef } from "react";

type SwipeHandlers = {
  left?: () => void;
  right?: () => void;
  up?: () => void;
  down?: () => void;
};

/**
 * Detects a flick in one of four directions. Spread the result onto an
 * element that has `touch-action: none`, so the browser hands over the touch.
 * A flick also cancels the click that would otherwise follow it.
 */
export function useSwipe(handlers: SwipeHandlers, threshold = 40) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  return {
    onPointerDown(event: React.PointerEvent) {
      start.current = { x: event.clientX, y: event.clientY };
      swiped.current = false;
      // Keep receiving this pointer after it leaves the element. Touches do
      // this on their own; a mouse does not.
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerUp(event: React.PointerEvent) {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
      const handler =
        Math.abs(dx) > Math.abs(dy)
          ? dx < 0
            ? handlers.left
            : handlers.right
          : dy < 0
            ? handlers.up
            : handlers.down;
      if (handler) {
        swiped.current = true;
        handler();
      }
    },
    onPointerCancel() {
      start.current = null;
    },
    onClickCapture(event: React.MouseEvent) {
      if (!swiped.current) return;
      swiped.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
