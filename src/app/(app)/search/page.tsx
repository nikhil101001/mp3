"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useDeferredValue, useMemo } from "react";
import { Icon } from "@/components/icons";
import { AlbumGrid } from "@/components/library";
import { TrackList } from "@/components/track-list";
import { db } from "@/lib/db";
import { fold, matcher, useSearch } from "@/lib/search";

const MAX_SONGS = 100;

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="px-4 pb-2 pt-5 text-xl font-bold tracking-tight md:px-6">
      {children}
    </h2>
  );
}

export default function SearchPage() {
  const query = useSearch((state) => state.query);
  const deferredQuery = useDeferredValue(query);

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

  const results = useMemo(() => {
    const matches = matcher(deferredQuery);
    if (!index || !matches) return null;
    const songs = index.tracks.filter((entry) => matches(entry.all));
    // Songs whose own title matches come before those found by artist or album.
    songs.sort(
      (a, b) => Number(!matches(a.title)) - Number(!matches(b.title)),
    );
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
  }, [index, deferredQuery]);

  const empty =
    results &&
    results.songs.length + results.albums.length + results.artists.length === 0;

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
            placeholder="Songs, albums, artists"
            aria-label="Search your library"
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
      </div>

      {!results && (
        <p className="px-4 pt-6 text-sm text-muted md:px-6">
          Search everything in your library by song, album or artist.
        </p>
      )}
      {empty && (
        <p className="px-4 pt-6 text-sm text-muted md:px-6">
          Nothing in your library matches “{deferredQuery.trim()}”.
        </p>
      )}

      {results && results.artists.length > 0 && (
        <>
          <SectionTitle>Artists</SectionTitle>
          <ul className="pl-4 md:pl-6">
            {results.artists.map((artist) => (
              <li key={artist.id}>
                <Link
                  href={`/artist?id=${encodeURIComponent(artist.id)}`}
                  className="flex h-14 items-center gap-3 active:opacity-60"
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
      {results && results.albums.length > 0 && (
        <>
          <SectionTitle>Albums</SectionTitle>
          <AlbumGrid albums={results.albums} />
        </>
      )}
      {results && results.songs.length > 0 && <SectionTitle>Songs</SectionTitle>}
    </div>
  );

  return <TrackList tracks={results?.songs ?? []} header={header} />;
}
