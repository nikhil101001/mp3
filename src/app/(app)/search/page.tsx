"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { AlbumGrid } from "@/components/library";
import { TrackList } from "@/components/track-list";
import { audiusSearch, audiusTrending } from "@/lib/audius";
import { db, type Track } from "@/lib/db";
import { fold, matcher, useSearch } from "@/lib/search";

const MAX_SONGS = 100;

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="px-4 pb-2 pt-5 text-xl font-bold tracking-tight md:px-6">
      {children}
    </h2>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pt-6 text-sm text-muted md:px-6">{children}</p>;
}

/** Everything in the library that matches the query. */
function useLibraryResults(query: string) {
  const library = useLiveQuery(async () => ({
    tracks: await db.tracks.orderBy("sortTitle").toArray(),
    albums: await db.albums.orderBy("sortTitle").toArray(),
    artists: await db.artists.orderBy("sortName").toArray(),
  }));

  // Searchable text for every item, built once per library change.
  const index = useMemo(
    () =>
      library && {
        tracks: library.tracks.map((track) => ({
          track,
          title: fold(track.title),
          all: fold(`${track.title} ${track.artist} ${track.album}`),
        })),
        albums: library.albums.map((album) => ({
          album,
          all: fold(`${album.title} ${album.artist}`),
        })),
        artists: library.artists.map((artist) => ({
          artist,
          all: fold(artist.name),
        })),
      },
    [library],
  );

  return useMemo(() => {
    const matches = matcher(query);
    if (!index || !matches) return null;
    const songs = index.tracks.filter((entry) => matches(entry.all));
    // Songs whose own title matches come before those found by artist or album.
    songs.sort((a, b) => Number(!matches(a.title)) - Number(!matches(b.title)));
    return {
      songs: songs.slice(0, MAX_SONGS).map((entry) => entry.track),
      albums: index.albums
        .filter((entry) => matches(entry.all))
        .slice(0, 6)
        .map((entry) => entry.album),
      artists: index.artists
        .filter((entry) => matches(entry.all))
        .slice(0, 5)
        .map((entry) => entry.artist),
    };
  }, [index, query]);
}

type AudiusState = {
  /** The request this result belongs to, so stale answers are ignored. */
  key: string;
  tracks: Track[];
  error: boolean;
};

/** Audius results for the query, or this week's trending when it is empty. */
function useAudiusResults(query: string, enabled: boolean) {
  const [state, setState] = useState<AudiusState | null>(null);
  const trimmed = query.trim();
  const key = enabled ? `q:${trimmed}` : "";

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    // Wait for a pause in typing before asking the network.
    const timer = setTimeout(
      () => {
        const request = trimmed
          ? audiusSearch(trimmed, controller.signal)
          : audiusTrending(controller.signal);
        request
          .then((tracks) => setState({ key, tracks, error: false }))
          .catch(() => {
            if (!controller.signal.aborted) {
              setState({ key, tracks: [], error: true });
            }
          });
      },
      trimmed ? 350 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, trimmed]);

  const current = state?.key === key ? state : null;
  return {
    tracks: current?.tracks ?? [],
    loading: Boolean(key) && !current,
    error: Boolean(current?.error),
    trending: !trimmed,
  };
}

export default function SearchPage() {
  const query = useSearch((state) => state.query);
  const scope = useSearch((state) => state.scope);
  const deferredQuery = useDeferredValue(query);
  const library = useLibraryResults(scope === "library" ? deferredQuery : "");
  const audius = useAudiusResults(deferredQuery, scope === "audius");

  const libraryEmpty =
    library &&
    library.songs.length + library.albums.length + library.artists.length === 0;

  const header = (
    <div>
      <div className="px-4 pb-2 pt-6 md:px-6 md:pt-8">
        <h1 className="text-[34px] font-bold leading-tight tracking-tight">
          Search
        </h1>
        <label className="card mt-3 flex h-11 items-center gap-2 rounded-xl px-3 focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" size={18} className="shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => useSearch.setState({ query: event.target.value })}
            placeholder={
              scope === "library" ? "Songs, albums, artists" : "Search Audius"
            }
            aria-label={
              scope === "library" ? "Search your library" : "Search Audius"
            }
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              aria-label="Clear search"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-black/80"
              onClick={() => useSearch.setState({ query: "" })}
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </label>

        {/* Where to search. The highlight slides between the two choices. */}
        <div
          role="tablist"
          aria-label="Where to search"
          className="card relative mt-3 flex rounded-xl p-0.5"
        >
          <span
            aria-hidden="true"
            className="motion-safe-only absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-[0.6rem] bg-white/[0.16] transition-[translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ translate: scope === "audius" ? "100% 0" : "0 0" }}
          />
          {(["library", "audius"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={scope === value}
              className="relative h-8 flex-1 rounded-[0.6rem] text-sm font-semibold"
              onClick={() => useSearch.setState({ scope: value })}
            >
              {value === "library" ? "Your Library" : "Audius"}
            </button>
          ))}
        </div>
      </div>

      {scope === "library" ? (
        <>
          {!library && (
            <Note>
              Search everything in your library by song, album or artist.
            </Note>
          )}
          {libraryEmpty && (
            <Note>
              Nothing in your library matches “{deferredQuery.trim()}”. Try
              Audius for free streaming.
            </Note>
          )}
          {library && library.artists.length > 0 && (
            <>
              <SectionTitle>Artists</SectionTitle>
              <ul className="pl-4 md:pl-6">
                {library.artists.map((artist) => (
                  <li key={artist.id}>
                    <Link
                      href={`/artist?id=${encodeURIComponent(artist.id)}`}
                      className="press flex h-14 items-center gap-3"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 font-semibold text-white/70">
                        {artist.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="row-line flex h-full min-w-0 flex-1 items-center pr-4 text-[17px]">
                        <span className="truncate">{artist.name}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {library && library.albums.length > 0 && (
            <>
              <SectionTitle>Albums</SectionTitle>
              <AlbumGrid albums={library.albums} />
            </>
          )}
          {library && library.songs.length > 0 && (
            <SectionTitle>Songs</SectionTitle>
          )}
        </>
      ) : (
        <>
          <SectionTitle>
            {audius.trending ? "Trending this week" : "Songs on Audius"}
          </SectionTitle>
          <p className="-mt-1 px-4 pb-2 text-sm text-muted md:px-6">
            Free streaming from independent artists on Audius. Needs a
            connection.
          </p>
          {audius.loading && <Note>Loading…</Note>}
          {audius.error && (
            <Note>
              Audius could not be reached. Check your connection and try again.
            </Note>
          )}
          {!audius.loading &&
            !audius.error &&
            !audius.trending &&
            audius.tracks.length === 0 && (
              <Note>Nothing on Audius matches “{deferredQuery.trim()}”.</Note>
            )}
        </>
      )}
    </div>
  );

  const tracks = scope === "library" ? (library?.songs ?? []) : audius.tracks;
  return <TrackList tracks={tracks} header={header} />;
}
