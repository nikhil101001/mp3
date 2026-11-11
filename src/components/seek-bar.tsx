"use client";

import { formatTime } from "@/lib/format";
import { seek, usePlayer } from "@/lib/player";
import "./seek-bar.css";

export function SeekBar({ showTimes = true }: { showTimes?: boolean }) {
  const time = usePlayer((state) => state.time);
  const duration = usePlayer((state) => state.duration);
  const max = duration > 0 ? duration : 1;
  const value = Math.min(time, max);
  return (
    <div className="w-full">
      <input
        type="range"
        aria-label="Seek"
        className="seek block w-full"
        min={0}
        max={max}
        step={0.1}
        value={value}
        disabled={duration <= 0}
        style={{ "--fill": `${(value / max) * 100}%` } as React.CSSProperties}
        onChange={(event) => seek(Number(event.target.value))}
      />
      {showTimes && (
        <div className="flex justify-between text-xs font-medium tabular-nums text-white/55">
          <span>{formatTime(time)}</span>
          <span>-{formatTime(Math.max(0, duration - time))}</span>
        </div>
      )}
    </div>
  );
}
