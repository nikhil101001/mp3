// Playback engine for the iPhone test page.
//
// It lives outside React on purpose: one <audio> element, a queue, and the
// Media Session wiring. The real player will follow the same shape.
//
// The part under test is `handleEnded`: iOS throttles timers and network
// work while the phone is locked, so the next track's URL is resolved ahead of
// time and swapped in synchronously when the current track ends.

export type SpikeTrack = {
  id: string;
  title: string;
  artist: string;
  format: string;
  source: "bundled" | "imported";
  /** Bundled tracks: a URL under /public. */
  url?: string;
  /** Imported tracks: file name inside the OPFS "imports" folder. */
  fileName?: string;
};

export type SpikeState = {
  tracks: SpikeTrack[];
  index: number;
  playing: boolean;
  time: number;
  duration: number;
  importing: string | null;
  log: string[];
};

const BUNDLED: SpikeTrack[] = [
  ["01-a-major.mp3", "A major", "MP3 192 kbps"],
  ["02-c-major.m4a", "C major", "AAC 192 kbps"],
  ["03-d-major.flac", "D major", "FLAC 24-bit / 96 kHz"],
  ["04-e-major.m4a", "E major", "ALAC"],
].map(([file, title, format]) => ({
  id: `bundled:${file}`,
  title,
  artist: "Test tone",
  format,
  source: "bundled" as const,
  url: `/spike/${file}`,
}));

const LOG_KEY = "spike-log";
const LOG_LIMIT = 300;
const ARTWORK = [
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
];

export const SERVER_STATE: SpikeState = {
  tracks: BUNDLED,
  index: 0,
  playing: false,
  time: 0,
  duration: 0,
  importing: null,
  log: [],
};

type DirectoryWithEntries = {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
};

async function importsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("imports", { create: true });
}

function formatFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext ? ext.toUpperCase() : "unknown";
}

class SpikeEngine {
  private state: SpikeState = SERVER_STATE;
  private listeners = new Set<() => void>();
  private audio = new Audio();
  /** URL for the next track, resolved before it is needed. */
  private prepared: { index: number; url: string } | null = null;
  /** Blob URL currently loaded in the audio element, to release afterwards. */
  private activeBlobUrl: string | null = null;
  private worker: Worker | null = null;
  private nextRequestId = 1;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
      if (Array.isArray(saved)) this.state = { ...this.state, log: saved };
    } catch {
      // A corrupt or blocked log store is not worth failing over.
    }

    const audio = this.audio;
    audio.preload = "auto";
    audio.addEventListener("play", () => this.onPlayState(true));
    audio.addEventListener("pause", () => this.onPlayState(false));
    audio.addEventListener("ended", () => this.handleEnded());
    audio.addEventListener("timeupdate", () =>
      this.set({ time: audio.currentTime }),
    );
    audio.addEventListener("loadedmetadata", () => {
      this.set({ duration: audio.duration });
      this.syncPosition();
    });
    audio.addEventListener("seeked", () => this.syncPosition());
    // "sound started" is the proof that a track is audible, not just loaded.
    audio.addEventListener("playing", () => this.log("sound started"));
    audio.addEventListener("stalled", () => this.log("audio stalled"));
    audio.addEventListener("waiting", () => this.log("audio waiting for data"));
    audio.addEventListener("error", () => {
      const code = audio.error?.code;
      this.log(`audio ERROR code=${code} ${audio.error?.message ?? ""}`);
    });

    document.addEventListener("visibilitychange", () =>
      this.log(`page became ${document.visibilityState}`),
    );
    window.addEventListener("pagehide", () => this.log("pagehide"));
    window.addEventListener("pageshow", () => this.log("pageshow"));

    this.registerMediaSession();
    this.log("engine started");
    void this.refreshImported();
  }

  // --- store plumbing -------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  private set(patch: Partial<SpikeState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  log(message: string) {
    const stamp = new Date().toLocaleTimeString("en-GB");
    const where = document.visibilityState === "visible" ? "fg" : "BG";
    const log = [...this.state.log, `${stamp} [${where}] ${message}`].slice(
      -LOG_LIMIT,
    );
    this.set({ log });
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch {
      // Storage can be full or blocked; the on-screen log still works.
    }
  }

  clearLog() {
    this.set({ log: [] });
    try {
      localStorage.removeItem(LOG_KEY);
    } catch {
      // Nothing to clear if storage is blocked.
    }
  }

  // --- playback -------------------------------------------------------------

  /**
   * With `preload`, a network track is downloaded in full and handed back as an
   * in-memory URL. The first iPhone run showed that a track swapped in while
   * locked did not start within 3-5 seconds when it still had to be fetched.
   */
  private async resolveUrl(
    track: SpikeTrack,
    preload = false,
  ): Promise<string> {
    if (track.source === "bundled") {
      if (!preload) return track.url!;
      try {
        const started = performance.now();
        const response = await fetch(track.url!);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        const megabytes = (blob.size / 1e6).toFixed(1);
        this.log(`preloaded "${track.title}" (${megabytes} MB in ${seconds}s)`);
        return URL.createObjectURL(blob);
      } catch (error) {
        this.log(`preload failed for "${track.title}", will stream: ${error}`);
        return track.url!;
      }
    }
    const dir = await importsDir();
    const handle = await dir.getFileHandle(track.fileName!);
    return URL.createObjectURL(await handle.getFile());
  }

  /** Loads a URL into the audio element and starts it. Must stay synchronous. */
  private start(index: number, url: string) {
    const previousBlob = this.activeBlobUrl;
    this.activeBlobUrl = url.startsWith("blob:") ? url : null;
    this.audio.src = url;
    this.set({ index, time: 0, duration: 0 });
    this.updateMetadata();
    this.audio.play().catch((error) =>
      this.log(
        error?.name === "AbortError"
          ? "play interrupted before any sound started"
          : `play() rejected: ${error}`,
      ),
    );
    if (previousBlob && previousBlob !== url) URL.revokeObjectURL(previousBlob);
    void this.prepareNext();
  }

  private async prepareNext() {
    const { tracks, index } = this.state;
    const nextIndex = (index + 1) % tracks.length;
    const stale = this.prepared;
    this.prepared = null;
    if (stale?.url.startsWith("blob:") && stale.url !== this.activeBlobUrl) {
      URL.revokeObjectURL(stale.url);
    }
    try {
      const url = await this.resolveUrl(tracks[nextIndex], true);
      // The queue may have moved on while the file was being opened.
      if ((this.state.index + 1) % this.state.tracks.length !== nextIndex) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        return;
      }
      this.prepared = { index: nextIndex, url };
    } catch (error) {
      this.log(`could not prepare next track: ${error}`);
    }
  }

  private handleEnded() {
    const { tracks, index } = this.state;
    const nextIndex = (index + 1) % tracks.length;
    const title = tracks[nextIndex].title;
    if (this.prepared?.index === nextIndex) {
      const { url } = this.prepared;
      this.prepared = null;
      this.log(`track ended -> "${title}" (prepared, instant swap)`);
      this.start(nextIndex, url);
    } else {
      this.log(`track ended -> "${title}" (NOT prepared, slow path)`);
      void this.playIndex(nextIndex);
    }
  }

  async playIndex(index: number) {
    const track = this.state.tracks[index];
    if (!track) return;
    try {
      const url =
        this.prepared?.index === index
          ? this.prepared.url
          : await this.resolveUrl(track);
      if (this.prepared?.index === index) this.prepared = null;
      this.log(`play "${track.title}" (${track.format})`);
      this.start(index, url);
    } catch (error) {
      this.log(`could not open "${track.title}": ${error}`);
    }
  }

  toggle() {
    if (!this.audio.src) return void this.playIndex(this.state.index);
    if (this.audio.paused) {
      this.audio.play().catch((error) => this.log(`play() rejected: ${error}`));
    } else {
      this.audio.pause();
    }
  }

  next() {
    void this.playIndex((this.state.index + 1) % this.state.tracks.length);
  }

  previous() {
    const count = this.state.tracks.length;
    void this.playIndex((this.state.index - 1 + count) % count);
  }

  seek(seconds: number) {
    if (!Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.max(
      0,
      Math.min(seconds, this.audio.duration),
    );
  }

  /** Jumps close to the end so a track change can be tested without waiting. */
  skipToEnd() {
    if (Number.isFinite(this.audio.duration)) {
      this.seek(this.audio.duration - 8);
    }
  }

  /** iOS ignores programmatic volume; this reports whether the browser obeys. */
  volumeIsSettable(): boolean {
    const before = this.audio.volume;
    this.audio.volume = 0.5;
    const obeyed = this.audio.volume === 0.5;
    this.audio.volume = before;
    return obeyed;
  }

  // --- Media Session (lock screen, Control Center) -------------------------

  private onPlayState(playing: boolean) {
    this.set({ playing });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    }
    this.syncPosition();
  }

  private updateMetadata() {
    if (!("mediaSession" in navigator)) return;
    const track = this.state.tracks[this.state.index];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: `iPhone test · ${track.format}`,
      artwork: ARTWORK,
    });
  }

  private syncPosition() {
    if (!("mediaSession" in navigator)) return;
    const { duration, currentTime, playbackRate } = this.audio;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(currentTime, duration),
        playbackRate,
      });
    } catch (error) {
      this.log(`setPositionState failed: ${error}`);
    }
  }

  private registerMediaSession() {
    if (!("mediaSession" in navigator)) {
      this.log("Media Session API is not available");
      return;
    }
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void (this.audio.paused && this.toggle())],
      ["pause", () => this.audio.pause()],
      ["nexttrack", () => this.next()],
      ["previoustrack", () => this.previous()],
      ["seekto", (details) => this.seek(details.seekTime ?? 0)],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, (details) => {
          this.log(`lock-screen control: ${action}`);
          handler(details);
        });
      } catch {
        this.log(`Media Session action not supported: ${action}`);
      }
    }
  }

  // --- imported files -------------------------------------------------------

  private async refreshImported() {
    try {
      const dir = await importsDir();
      const names: string[] = [];
      for await (const [name, handle] of (
        dir as unknown as DirectoryWithEntries
      ).entries()) {
        if (handle.kind === "file") names.push(name);
      }
      names.sort((a, b) => a.localeCompare(b));
      const imported: SpikeTrack[] = names.map((name) => ({
        id: `imported:${name}`,
        title: name.replace(/\.[^.]+$/, ""),
        artist: "Imported file",
        format: formatFromName(name),
        source: "imported",
        fileName: name,
      }));
      const currentId = this.state.tracks[this.state.index]?.id;
      const tracks = [...BUNDLED, ...imported];
      const index = Math.max(
        0,
        tracks.findIndex((track) => track.id === currentId),
      );
      this.set({ tracks, index });
      this.log(`imported files in app storage: ${imported.length}`);
      void this.prepareNext();
    } catch (error) {
      this.log(`app storage (OPFS) unavailable: ${error}`);
    }
  }

  private copyToStorage(file: File): Promise<void> {
    this.worker ??= new Worker(new URL("./opfs.worker.ts", import.meta.url), {
      type: "module",
    });
    const worker = this.worker;
    const id = this.nextRequestId++;
    const name = file.name.replace(/[/\\]/g, "_");
    return new Promise((resolve, reject) => {
      const onMessage = (
        event: MessageEvent<{ id: number; ok: boolean; error?: string }>,
      ) => {
        if (event.data.id !== id) return;
        worker.removeEventListener("message", onMessage);
        if (event.data.ok) resolve();
        else reject(new Error(event.data.error));
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ id, file, name });
    });
  }

  async importFiles(files: File[]) {
    let done = 0;
    for (const file of files) {
      this.set({ importing: `${done + 1} of ${files.length}: ${file.name}` });
      const megabytes = (file.size / 1e6).toFixed(1);
      try {
        const started = performance.now();
        await this.copyToStorage(file);
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        this.log(`imported "${file.name}" (${megabytes} MB in ${seconds}s)`);
        done++;
      } catch (error) {
        this.log(`import FAILED for "${file.name}": ${error}`);
      }
    }
    this.set({ importing: null });
    await this.refreshImported();
  }

  async clearImported() {
    const playingImported =
      this.state.tracks[this.state.index]?.source === "imported";
    if (playingImported) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.set({ index: 0, time: 0, duration: 0 });
    }
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("imports", { recursive: true });
      this.log("removed all imported files");
    } catch (error) {
      this.log(`could not remove imported files: ${error}`);
    }
    await this.refreshImported();
  }
}

let engine: SpikeEngine | null = null;

/** Browser only: the engine touches Audio, document and storage. */
export function getEngine(): SpikeEngine {
  engine ??= new SpikeEngine();
  return engine;
}
