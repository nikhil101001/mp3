// The player: one <audio> element, a queue, and the lock-screen wiring.
//
// Two rules come from the iPhone test and must be kept:
//  1. The next track is opened ahead of time and swapped in synchronously when
//     the current one ends. iOS will not wait for async work while locked.
//  2. Lock-screen handlers are registered again once audio is playing, with the
//     10-second skip actions cleared, or iOS hides next/previous.

import { create } from "zustand";
import { loadArtworkUrl, peekArtworkUrl } from "./artwork";
import { audiusStreamUrl } from "./audius";
import { db, libraryDir, type Track } from "./db";
import { openLinkedFile } from "./folders";

export type RepeatMode = "off" | "all" | "one";

type PlayerState = {
  /** Track ids in the order they will play. */
  queue: string[];
  /** The same tracks in their original order, to undo shuffle. */
  original: string[];
  index: number;
  track: Track | null;
  playing: boolean;
  time: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  error: string | null;
};

export const usePlayer = create<PlayerState>(() => ({
  queue: [],
  original: [],
  index: 0,
  track: null,
  playing: false,
  time: 0,
  duration: 0,
  shuffle: false,
  repeat: "off",
  error: null,
}));

const get = usePlayer.getState;
const set = usePlayer.setState;

type Prepared = { track: Track; url: string };

let audio: HTMLAudioElement | null = null;
let prepared: Prepared | null = null;
let activeUrl: string | null = null;
/** Where to start the next loaded track, for resuming after a relaunch. */
let pendingSeek = 0;

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  const element = new Audio();
  element.preload = "auto";
  element.addEventListener("play", () => onPlayState(true));
  element.addEventListener("pause", () => onPlayState(false));
  element.addEventListener("playing", registerMediaSession);
  element.addEventListener("ended", handleEnded);
  element.addEventListener("timeupdate", () =>
    set({ time: element.currentTime }),
  );
  element.addEventListener("loadedmetadata", () => {
    if (pendingSeek > 0 && pendingSeek < element.duration - 2) {
      element.currentTime = pendingSeek;
    }
    pendingSeek = 0;
    set({ duration: element.duration });
    const track = get().track;
    if (track && !track.remote && !track.durationMs && element.duration) {
      const durationMs = Math.round(element.duration * 1000);
      void db.tracks.update(track.id, { durationMs });
    }
    syncPosition();
  });
  element.addEventListener("seeked", syncPosition);
  element.addEventListener("error", () => {
    set({
      playing: false,
      error: get().track?.remote
        ? "Could not stream this song. Check your connection."
        : "This file could not be played on this device.",
    });
  });
  audio = element;
  return element;
}

// --- opening tracks ---------------------------------------------------------

/** Streamed tracks that are playing or queued but not saved to the library. */
const transient = new Map<string, Track>();

/** Makes streamed tracks playable before they are queued. */
export function registerTracks(tracks: Track[]) {
  for (const track of tracks) {
    if (track.remote) transient.set(track.id, track);
  }
}

/** Looks tracks up in the library or among the streamed ones in the queue. */
export async function lookupTracks(
  ids: string[],
): Promise<(Track | undefined)[]> {
  const stored = await db.tracks.bulkGet(ids);
  return ids.map((id, index) => stored[index] ?? transient.get(id));
}

/**
 * Opens a streamed track. When it is being readied as the next song it is
 * downloaded in full, because a locked iPhone will not fetch it in time.
 */
async function openRemote(track: Track, preload: boolean): Promise<Prepared> {
  const url = audiusStreamUrl(track.remote!.id);
  if (!preload) return { track, url };
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    return { track, url: URL.createObjectURL(await response.blob()) };
  } catch {
    // Fall back to streaming; it still works while the app is on screen.
    return { track, url };
  }
}

async function openTrack(trackId: string, preload = false): Promise<Prepared> {
  const [track] = await lookupTracks([trackId]);
  if (!track) throw new Error("This song is no longer in the library.");
  if (track.remote) return openRemote(track, preload);
  const rendition = await db.renditions
    .where("trackId")
    .equals(trackId)
    .first();
  if (!rendition) throw new Error("This song has no playable file.");
  let open: Promise<File>;
  if (rendition.source === "linked") {
    // Read in place from the folder on disk. When this follows a tap, the
    // browser may show its "allow access" prompt here.
    open = openLinkedFile(rendition.folderId!, rendition.path);
  } else {
    const dir = await libraryDir();
    let handle: FileSystemFileHandle;
    try {
      handle = await dir.getFileHandle(rendition.path);
    } catch {
      // The song is listed but its audio is gone, for example because the
      // browser cleared this app's stored files.
      throw new Error("This song's file is missing. Import it again.");
    }
    open = handle.getFile();
  }
  const [file] = await Promise.all([
    open,
    // Warm the cover so the lock screen can show it without waiting.
    loadArtworkUrl(track.artworkId, "large"),
  ]);
  return { track, url: URL.createObjectURL(file) };
}

function release(url: string | null | undefined) {
  if (url?.startsWith("blob:") && url !== activeUrl) URL.revokeObjectURL(url);
}

/** Loads an opened track and starts it. Must stay synchronous. */
function start(index: number, next: Prepared, at = 0) {
  const element = getAudio();
  pendingSeek = at;
  const previousUrl = activeUrl;
  activeUrl = next.url;
  element.src = next.url;
  set({ index, track: next.track, time: at, duration: 0, error: null });
  updateMetadata(next.track);
  element.play().catch((error: unknown) => {
    // A newer play or pause interrupting this one is expected, not a failure.
    if ((error as DOMException)?.name !== "AbortError") {
      set({ playing: false, error: "Playback could not start." });
    }
  });
  if (previousUrl?.startsWith("blob:") && previousUrl !== next.url) {
    URL.revokeObjectURL(previousUrl);
  }
  void prepareNext();
}

/** Index that plays after the current one ends on its own, or -1 to stop. */
function upcomingIndex(): number {
  const { queue, index, repeat } = get();
  if (index + 1 < queue.length) return index + 1;
  return repeat === "all" && queue.length > 0 ? 0 : -1;
}

async function prepareNext() {
  const stale = prepared;
  prepared = null;
  release(stale?.url);
  const nextIndex = upcomingIndex();
  if (nextIndex < 0) return;
  const trackId = get().queue[nextIndex];
  try {
    const opened = await openTrack(trackId, true);
    // The queue may have changed while the file was being opened.
    const stillNext = get().queue[upcomingIndex()] === trackId;
    if (!stillNext || prepared) return release(opened.url);
    prepared = opened;
  } catch {
    // The failure will surface when this track is actually reached.
  }
}

async function loadAndPlay(index: number, at = 0) {
  const trackId = get().queue[index];
  if (!trackId) return;
  try {
    let opened: Prepared;
    if (prepared?.track.id === trackId) {
      opened = prepared;
      prepared = null;
    } else {
      opened = await openTrack(trackId);
    }
    start(index, opened, at);
  } catch (error) {
    set({
      index,
      playing: false,
      error:
        error instanceof Error ? error.message : "Could not open this song.",
    });
  }
}

function handleEnded() {
  const element = getAudio();
  if (get().repeat === "one") {
    element.currentTime = 0;
    void element.play();
    return;
  }
  const nextIndex = upcomingIndex();
  if (nextIndex < 0) return;
  const trackId = get().queue[nextIndex];
  if (prepared?.track.id === trackId) {
    const opened = prepared;
    prepared = null;
    start(nextIndex, opened);
  } else {
    void loadAndPlay(nextIndex);
  }
}

// --- controls ---------------------------------------------------------------

function shuffled(ids: string[]): string[] {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Replaces the queue with these tracks and plays the one at `startIndex`. */
export function playTracks(trackIds: string[], startIndex = 0) {
  if (trackIds.length === 0) return;
  if (get().shuffle) {
    const first = trackIds[startIndex];
    const rest = trackIds.filter((_, i) => i !== startIndex);
    set({ original: trackIds, queue: [first, ...shuffled(rest)] });
    void loadAndPlay(0);
  } else {
    set({ original: trackIds, queue: trackIds });
    void loadAndPlay(startIndex);
  }
}

/** Plays all of these tracks in random order, turning shuffle on. */
export function shufflePlay(trackIds: string[]) {
  if (trackIds.length === 0) return;
  set({ shuffle: true });
  playTracks(trackIds, Math.floor(Math.random() * trackIds.length));
}

export function togglePlay() {
  const element = getAudio();
  // Nothing loaded yet: this is the first play after a relaunch, so pick up
  // where the restored song left off.
  if (!element.src) return void loadAndPlay(get().index, get().time);
  if (element.paused) void element.play().catch(() => {});
  else element.pause();
}

export function next() {
  const { queue, index } = get();
  if (queue.length === 0) return;
  void loadAndPlay(index + 1 < queue.length ? index + 1 : 0);
}

export function previous() {
  const { index } = get();
  const element = getAudio();
  if (element.currentTime > 3 || index === 0) {
    element.currentTime = 0;
    if (element.paused && element.src) void element.play().catch(() => {});
    return;
  }
  void loadAndPlay(index - 1);
}

export function seek(seconds: number) {
  const element = getAudio();
  if (!Number.isFinite(element.duration)) return;
  element.currentTime = Math.max(0, Math.min(seconds, element.duration));
  set({ time: element.currentTime });
}

export function jumpTo(index: number) {
  void loadAndPlay(index);
}

export function toggleShuffle() {
  const { shuffle, queue, original, index } = get();
  const currentId = queue[index];
  if (!shuffle) {
    const rest = queue.filter((_, i) => i !== index);
    set({
      shuffle: true,
      queue: currentId ? [currentId, ...shuffled(rest)] : queue,
      index: 0,
    });
  } else {
    set({
      shuffle: false,
      queue: original,
      index: Math.max(0, original.indexOf(currentId)),
    });
  }
  void prepareNext();
}

export function cycleRepeat() {
  const order: RepeatMode[] = ["off", "all", "one"];
  const { repeat } = get();
  set({ repeat: order[(order.indexOf(repeat) + 1) % order.length] });
  void prepareNext();
}

export function playNext(trackId: string) {
  const { queue, original, index } = get();
  if (queue.length === 0) return playTracks([trackId]);
  const currentId = queue[index];
  const at = original.indexOf(currentId) + 1;
  set({
    queue: [...queue.slice(0, index + 1), trackId, ...queue.slice(index + 1)],
    original: [...original.slice(0, at), trackId, ...original.slice(at)],
  });
  void prepareNext();
}

export function addToQueue(trackId: string) {
  const { queue, original } = get();
  if (queue.length === 0) return playTracks([trackId]);
  set({ queue: [...queue, trackId], original: [...original, trackId] });
  void prepareNext();
}

export function removeFromQueue(position: number) {
  const { queue, original, index } = get();
  if (position === index || position < 0 || position >= queue.length) return;
  const removedId = queue[position];
  const nextOriginal = [...original];
  const at = nextOriginal.lastIndexOf(removedId);
  if (at >= 0) nextOriginal.splice(at, 1);
  set({
    queue: queue.filter((_, i) => i !== position),
    original: nextOriginal,
    index: position < index ? index - 1 : index,
  });
  void prepareNext();
}

/** Stops playback and empties the queue, for when the library is cleared. */
export function resetPlayer() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  release(prepared?.url);
  prepared = null;
  if (activeUrl?.startsWith("blob:")) URL.revokeObjectURL(activeUrl);
  activeUrl = null;
  transient.clear();
  set({
    queue: [],
    original: [],
    index: 0,
    track: null,
    playing: false,
    time: 0,
    duration: 0,
    error: null,
  });
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
}

// --- remembering the queue between launches ---------------------------------

const SAVED_KEY = "mp3-player";

type Saved = Pick<
  PlayerState,
  "queue" | "original" | "index" | "time" | "shuffle" | "repeat"
> & {
  /** Streamed tracks in the queue, which the library cannot bring back. */
  streamed?: Track[];
};

function save() {
  const { queue, original, index, time, shuffle, repeat } = get();
  const streamed = queue.flatMap((id) => transient.get(id) ?? []).slice(0, 300);
  const saved: Saved = {
    queue,
    original,
    index,
    time,
    shuffle,
    repeat,
    streamed,
  };
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: the queue simply won't be restored.
  }
}

let restored = false;

/**
 * Call once when the app opens. Brings back the last queue, paused at the
 * position it was left, and starts saving changes from then on.
 */
export async function restorePlayer() {
  if (restored) return;
  restored = true;
  try {
    const saved = JSON.parse(
      localStorage.getItem(SAVED_KEY) ?? "null",
    ) as Saved | null;
    registerTracks(saved?.streamed ?? []);
    const trackId = saved?.queue?.[saved.index];
    const [track] = trackId ? await lookupTracks([trackId]) : [];
    // Only restore if nothing started playing while the library was loading.
    if (saved && track && !get().track) {
      set({
        queue: saved.queue,
        original: saved.original ?? saved.queue,
        index: saved.index,
        track,
        time: saved.time ?? 0,
        duration: track.durationMs / 1000,
        shuffle: Boolean(saved.shuffle),
        repeat: saved.repeat ?? "off",
      });
    }
  } catch {
    // A corrupt save is ignored; the player starts empty.
  }

  // Save on every queue or mode change, and the position every few seconds.
  let lastTimeSave = 0;
  usePlayer.subscribe((state, previous) => {
    const structural =
      state.queue !== previous.queue ||
      state.index !== previous.index ||
      state.shuffle !== previous.shuffle ||
      state.repeat !== previous.repeat ||
      state.playing !== previous.playing;
    if (structural || Math.abs(state.time - lastTimeSave) >= 5) {
      lastTimeSave = state.time;
      save();
    }
  });
  window.addEventListener("pagehide", save);
}

// --- Media Session (lock screen, Control Center) ----------------------------

function onPlayState(playing: boolean) {
  set({ playing });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }
  syncPosition();
}

function updateMetadata(track: Track) {
  if (!("mediaSession" in navigator)) return;
  const cover = peekArtworkUrl(track.artworkId, "large");
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: cover
      ? [{ src: cover, sizes: "1000x1000", type: "image/jpeg" }]
      : [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
  });
  if (!cover && track.artworkId) {
    // Not warmed yet (first play after launch): fill it in when it arrives.
    void loadArtworkUrl(track.artworkId, "large").then((url) => {
      if (url && get().track?.id === track.id) updateMetadata(track);
    });
  }
}

function syncPosition() {
  if (!audio || !("mediaSession" in navigator)) return;
  const { duration, currentTime, playbackRate } = audio;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(currentTime, duration),
      playbackRate,
    });
  } catch {
    // Some browsers reject position updates mid-load; the next one succeeds.
  }
}

function registerMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const session = navigator.mediaSession;
  const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
    // Cleared on purpose: with these set, iOS hides next/previous.
    ["seekbackward", null],
    ["seekforward", null],
    [
      "play",
      () =>
        void getAudio()
          .play()
          .catch(() => {}),
    ],
    ["pause", () => getAudio().pause()],
    ["nexttrack", next],
    ["previoustrack", previous],
    ["seekto", (details) => seek(details.seekTime ?? 0)],
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // This browser does not support the action.
    }
  }
}
