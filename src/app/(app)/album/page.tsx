"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Artwork } from "@/components/artwork";
import { PlayActions } from "@/components/library";
import { TrackList } from "@/components/track-list";
import { byAlbumOrder, db } from "@/lib/db";
import { formatTime, plural } from "@/lib/format";

function AlbumView() {
  const id = useSearchParams().get("id") ?? "";
  const data = useLiveQuery(async () => {
    const [album, tracks] = await Promise.all([
      db.albums.get(id),
      db.tracks.where("albumId").equals(id).toArray(),
    ]);
    return { album, tracks: tracks.sort(byAlbumOrder) };
  }, [id]);

  if (!data) return null;
  const { album, tracks } = data;
  if (!album) {
    return <p className="p-6 text-muted">This album is not in your library.</p>;
  }
  const seconds = tracks.reduce((sum, track) => sum + track.durationMs, 0) / 1000;

  return (
    <TrackList
      tracks={tracks}
      variant="album"
      header={
        <header className="flex flex-col items-center gap-4 px-4 pb-4 pt-5 text-center md:flex-row md:items-end md:gap-6 md:px-6 md:text-left">
          <Artwork
            id={album.artworkId}
            size="large"
            rounded="rounded-2xl"
            className="w-56 shadow-2xl shadow-black/60 md:w-56"
          />
          <div className="w-full min-w-0">
            <h1 className="text-2xl font-bold tracking-tight md:text-4xl">
              {album.title}
            </h1>
            <p className="mt-1 text-sm text-muted">
              <Link
                href={`/artist?id=${encodeURIComponent(album.artistId)}`}
                className="text-accent hover:underline"
              >
                {album.artist}
              </Link>
              {album.year ? ` · ${album.year}` : ""} ·{" "}
              {plural(tracks.length, "song")} · {formatTime(seconds)}
            </p>
            <div className="mx-auto mt-4 grid w-full max-w-md grid-cols-2 gap-3 md:mx-0">
              <PlayActions trackIds={tracks.map((track) => track.id)} />
            </div>
          </div>
        </header>
      }
    />
  );
}

export default function AlbumPage() {
  return (
    <Suspense>
      <AlbumView />
    </Suspense>
  );
}
