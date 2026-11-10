"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getEngine, SERVER_STATE, type SpikeState } from "./engine";

const subscribe = (listener: () => void) => getEngine().subscribe(listener);
const getSnapshot = (): SpikeState => getEngine().getState();
const getServerSnapshot = (): SpikeState => SERVER_STATE;

type EnvRow = { label: string; value: string; ok: boolean | null };

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

async function readEnvironment(): Promise<EnvRow[]> {
  const probe = document.createElement("audio");
  const canPlay = (type: string) => probe.canPlayType(type);
  const format = (label: string, type: string): EnvRow => {
    const answer = canPlay(type);
    return { label, value: answer || "no", ok: answer !== "" };
  };
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  let storage = "unknown";
  let persisted: boolean | null = null;
  try {
    const estimate = await navigator.storage.estimate();
    const used = ((estimate.usage ?? 0) / 1e6).toFixed(0);
    const quota = ((estimate.quota ?? 0) / 1e9).toFixed(1);
    storage = `${used} MB used of ${quota} GB`;
    persisted = await navigator.storage.persisted();
  } catch {
    storage = "not available";
  }

  return [
    {
      label: "Opened from Home Screen",
      value: standalone ? "yes" : "no, in a browser tab",
      ok: standalone,
    },
    format("MP3", "audio/mpeg"),
    format("AAC", 'audio/mp4; codecs="mp4a.40.2"'),
    format("FLAC", "audio/flac"),
    format("ALAC", 'audio/mp4; codecs="alac"'),
    {
      label: "Lock-screen controls (Media Session)",
      value: "mediaSession" in navigator ? "available" : "missing",
      ok: "mediaSession" in navigator,
    },
    {
      label: "App storage (OPFS)",
      value: "getDirectory" in navigator.storage ? "available" : "missing",
      ok: "getDirectory" in navigator.storage,
    },
    {
      label: "Link a folder without copying",
      value: "showDirectoryPicker" in window ? "available" : "not here",
      ok: null,
    },
    {
      label: "Volume slider can work",
      value: getEngine().volumeIsSettable() ? "yes" : "no (use phone buttons)",
      ok: null,
    },
    { label: "Storage", value: storage, ok: null },
    {
      label: "Storage protected from clean-up",
      value: persisted === null ? "unknown" : persisted ? "yes" : "not yet",
      ok: persisted,
    },
  ];
}

const STEPS = [
  "In Safari, tap Share → Add to Home Screen, then open the app from its icon.",
  "Tap a test track. Lock the phone. Check the lock screen shows title, artwork and controls.",
  "Leave it locked for 90 seconds. All four test tracks are 20 seconds, so it should change track at least three times.",
  "From the lock screen, use next, previous, pause, play and drag the seek bar.",
  "Unlock, tap “Import songs” and pick 3–5 of your own files (MP3, M4A, FLAC).",
  "Play an imported song, tap “Jump to last 8 s”, lock the phone and listen for the next song starting.",
  "Close the app from the app switcher, reopen it, and check the imported songs are still listed.",
  "Tap “Copy log” and paste it back to me.",
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

const buttonClass =
  "min-h-11 rounded-full border border-line px-4 text-sm font-medium active:bg-line disabled:opacity-40";

export default function SpikePage() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [env, setEnv] = useState<EnvRow[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readEnvironment().then((rows) => {
      if (!cancelled) setEnv(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = state.tracks[state.index];

  async function onPickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    await getEngine().importFiles(files);
    setEnv(await readEnvironment());
  }

  async function protectStorage() {
    const granted = await navigator.storage.persist();
    getEngine().log(`asked to protect storage: ${granted ? "granted" : "refused"}`);
    setEnv(await readEnvironment());
  }

  async function copyLog() {
    const header = `${navigator.userAgent}\n${(env ?? [])
      .map((row) => `${row.label}: ${row.value}`)
      .join("\n")}\n---\n`;
    try {
      await navigator.clipboard.writeText(header + state.log.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      getEngine().log(`copy failed: ${error}`);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">iPhone test</h1>
        <p className="mt-1 text-sm text-muted">
          Checks the three things the player depends on: lock-screen controls,
          changing track while locked, and playing imported files.
        </p>
      </header>

      <Section title="Now playing">
        <p className="truncate text-lg font-medium">{current.title}</p>
        <p className="truncate text-sm text-muted">
          {current.artist} · {current.format}
        </p>
        <input
          type="range"
          aria-label="Seek"
          className="mt-4 w-full accent-accent"
          min={0}
          max={state.duration || 1}
          step={0.1}
          value={Math.min(state.time, state.duration || 1)}
          onChange={(event) => getEngine().seek(Number(event.target.value))}
        />
        <div className="flex justify-between font-mono text-xs text-muted">
          <span>{formatTime(state.time)}</span>
          <span>{formatTime(state.duration)}</span>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button className={buttonClass} onClick={() => getEngine().previous()}>
            Previous
          </button>
          <button
            className="min-h-14 min-w-28 rounded-full bg-accent px-6 text-base font-semibold text-black active:opacity-80"
            onClick={() => getEngine().toggle()}
          >
            {state.playing ? "Pause" : "Play"}
          </button>
          <button className={buttonClass} onClick={() => getEngine().next()}>
            Next
          </button>
        </div>
        <div className="mt-3 flex justify-center">
          <button
            className={buttonClass}
            disabled={!state.duration}
            onClick={() => getEngine().skipToEnd()}
          >
            Jump to last 8 s
          </button>
        </div>
      </Section>

      <Section title={`Queue · ${state.tracks.length} tracks`}>
        <ul className="-mx-2">
          {state.tracks.map((track, index) => (
            <li key={track.id}>
              <button
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-2 text-left active:bg-line ${
                  index === state.index ? "text-accent" : ""
                }`}
                onClick={() => getEngine().playIndex(index)}
              >
                <span className="truncate">{track.title}</span>
                <span className="shrink-0 text-xs text-muted">
                  {track.format}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Your own files">
        <div className="flex flex-wrap gap-2">
          <label className={`${buttonClass} flex cursor-pointer items-center`}>
            Import songs
            <input
              type="file"
              multiple
              accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus"
              className="sr-only"
              onChange={onPickFiles}
            />
          </label>
          <button className={buttonClass} onClick={protectStorage}>
            Protect storage
          </button>
          <button
            className={buttonClass}
            onClick={() => getEngine().clearImported()}
          >
            Remove imported
          </button>
        </div>
        {state.importing && (
          <p className="mt-3 text-sm text-muted">Copying {state.importing}</p>
        )}
      </Section>

      <Section title="What to test">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section title="This device">
        {env ? (
          <dl className="space-y-1.5 text-sm">
            {env.map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <dt className="text-muted">{row.label}</dt>
                <dd
                  className={`text-right ${
                    row.ok === true
                      ? "text-good"
                      : row.ok === false
                        ? "text-bad"
                        : ""
                  }`}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">Checking…</p>
        )}
      </Section>

      <Section title="Log">
        <div className="mb-3 flex gap-2">
          <button className={buttonClass} onClick={copyLog}>
            {copied ? "Copied" : "Copy log"}
          </button>
          <button className={buttonClass} onClick={() => getEngine().clearLog()}>
            Clear
          </button>
        </div>
        <p className="mb-2 text-xs text-muted">
          BG marks events that happened while the app was in the background or
          the phone was locked.
        </p>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
          {state.log.length ? [...state.log].reverse().join("\n") : "Nothing yet."}
        </pre>
      </Section>
    </main>
  );
}
