"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AlbumGrid, PageHeader, PlayActions } from "@/components/library";
import { TrackList } from "@/components/track-list";
import { byAlbumOrder, db } from "@/lib/db";
import { plural } from "@/lib/format";

function ArtistView() {
  const id = useSearchParams().get("id") ?? "";
  const data = useLiveQuery(async () => {
    const [artist, albums, tracks] = await Promise.all([
      db.artists.get(id),
      db.albums.where("artistId").equals(id).sortBy("sortTitle"),
      db.tracks.where("artistId").equals(id).toArray(),
    ]);
    // Songs grouped by album, each album in its own running order.
    const albumOrder = new Map(albums.map((album, index) => [album.id, index]));
    tracks.sort(
      (a, b) =>
        (albumOrder.get(a.albumId) ?? 0) - (albumOrder.get(b.albumId) ?? 0) ||
        byAlbumOrder(a, b),
    );
    return { artist, albums, tracks };
  }, [id]);

  if (!data) return null;
  const { artist, albums, tracks } = data;
  if (!artist) {
    return <p className="p-6 text-muted">This artist is not in your library.</p>;
  }

  return (
    <TrackList
      tracks={tracks}
      header={
        <div className="pb-2">
          <PageHeader
            title={artist.name}
            subtitle={`${plural(albums.length, "album")} · ${plural(tracks.length, "song")}`}
          >
            <PlayActions trackIds={tracks.map((track) => track.id)} />
          </PageHeader>
          <h2 className="px-4 pb-3 pt-2 text-sm font-semibold uppercase tracking-widest text-muted md:px-6">
            Albums
          </h2>
          <AlbumGrid albums={albums} />
          <h2 className="px-4 pb-1 pt-6 text-sm font-semibold uppercase tracking-widest text-muted md:px-6">
            Songs
          </h2>
        </div>
      }
    />
  );
}

export default function ArtistPage() {
  return (
    <Suspense>
      <ArtistView />
    </Suspense>
  );
}
