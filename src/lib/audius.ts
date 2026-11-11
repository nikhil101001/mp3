// Audius: a free, open streaming catalogue of independent artists.
// Its tracks are browsed live and streamed; nothing is copied unless the
// listener saves a track to the library, and even then only its details are
// stored. The audio always streams from Audius.

import type { Track } from "./db";

const API = "https://api.audius.co/v1";
const APP = "app_name=mp3";

type AudiusTrack = {
  id: string;
  title: string;
  duration: number;
  genre?: string;
  permalink?: string;
  is_streamable?: boolean;
  is_stream_gated?: boolean;
  is_delete?: boolean;
  is_available?: boolean;
  artwork?: Record<string, string> | null;
  user: { name: string; handle: string };
};

function sortKey(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .trim();
}

function toTrack(source: AudiusTrack): Track {
  const artist = source.user.name || source.user.handle;
  return {
    id: `audius:${source.id}`,
    title: source.title,
    sortTitle: sortKey(source.title),
    artist,
    artistId: `artist:${artist.normalize("NFKC").toLowerCase().trim()}`,
    album: "Audius",
    albumId: "",
    discNo: 1,
    trackNo: 0,
    durationMs: source.duration * 1000,
    genre: source.genre,
    // For streamed tracks the cover is a web address, not a stored picture.
    artworkId: source.artwork?.["480x480"],
    addedAt: Date.now(),
    remote: {
      source: "audius",
      id: source.id,
      permalink: source.permalink ? `https://audius.co${source.permalink}` : undefined,
    },
  };
}

async function request(path: string, signal?: AbortSignal): Promise<Track[]> {
  const joiner = path.includes("?") ? "&" : "?";
  const response = await fetch(`${API}${path}${joiner}${APP}`, { signal });
  if (!response.ok) throw new Error(`Audius answered ${response.status}`);
  const body = (await response.json()) as { data?: AudiusTrack[] };
  return (body.data ?? [])
    .filter(
      (track) =>
        track.is_streamable !== false &&
        track.is_available !== false &&
        !track.is_stream_gated &&
        !track.is_delete,
    )
    .map(toTrack);
}

export function audiusTrending(signal?: AbortSignal): Promise<Track[]> {
  return request("/tracks/trending?time=week&limit=50", signal);
}

export function audiusSearch(query: string, signal?: AbortSignal): Promise<Track[]> {
  return request(
    `/tracks/search?query=${encodeURIComponent(query)}&limit=50`,
    signal,
  );
}

/** A web address that plays the track. It redirects to the audio file. */
export function audiusStreamUrl(id: string): string {
  return `${API}/tracks/${encodeURIComponent(id)}/stream?${APP}`;
}
