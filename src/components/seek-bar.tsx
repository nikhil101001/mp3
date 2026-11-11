"use client";

import { useRef, useState } from "react";
import { formatTime } from "@/lib/format";
import { seek, usePlayer } from "@/lib/player";
import "./seek-bar.css";

/**
 * The timeline. Drag anywhere on it: the fill follows the finger and the
 * times update live, and the song jumps there on release. Between drags the
 * fill glides forward instead of stepping.
 *
 * It is built from plain elements, not a range input, because iPhone only
 * lets a range input be dragged by its knob, and this design has no knob.
 */
export function SeekBar({ showTimes = true }: { showTimes?: boolean }) {
  const time = usePlayer((state) => state.time);
  const duration = usePlayer((state) => state.duration);
  const track = useRef<HTMLDivElement>(null);
  /** Position under the finger while dragging, as a fraction; else null. */
  const [scrub, setScrub] = useState<number | null>(null);

  const enabled = duration > 0;
  const fraction = scrub ?? (enabled ? Math.min(time / duration, 1) : 0);
  const shownTime = scrub !== null ? scrub * duration : time;

  function fractionAt(clientX: number): number {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
  }

  return (
    <div className="w-full select-none">
      <div
        ref={track}
        role="slider"
        tabIndex={enabled ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shownTime)}
        aria-valuetext={`${formatTime(shownTime)} of ${formatTime(duration)}`}
        aria-disabled={!enabled}
        data-scrubbing={scrub !== null}
        className="seek"
        onPointerDown={(event) => {
          if (!enabled) return;
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          setScrub(fractionAt(event.clientX));
        }}
        onPointerMove={(event) => {
          if (scrub !== null) setScrub(fractionAt(event.clientX));
        }}
        onPointerUp={(event) => {
          if (scrub === null) return;
          seek(fractionAt(event.clientX) * duration);
          setScrub(null);
        }}
        onPointerCancel={() => setScrub(null)}
        onKeyDown={(event) => {
          if (!enabled) return;
          const step = event.shiftKey ? 30 : 5;
          if (event.key === "ArrowRight") seek(time + step);
          else if (event.key === "ArrowLeft") seek(time - step);
          else if (event.key === "Home") seek(0);
          else return;
          event.preventDefault();
        }}
      >
        <div className="seek-track">
          <div className="seek-fill" style={{ width: `${fraction * 100}%` }} />
        </div>
      </div>
      {showTimes && (
        <div
          className={`flex justify-between text-xs font-medium tabular-nums transition-colors duration-200 ${
            scrub !== null ? "text-white" : "text-white/55"
          }`}
        >
          <span>{formatTime(shownTime)}</span>
          <span>-{formatTime(Math.max(0, duration - shownTime))}</span>
        </div>
      )}
    </div>
  );
}
