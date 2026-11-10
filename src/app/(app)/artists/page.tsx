"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { EmptyLibrary, PageHeader } from "@/components/library";
import { db } from "@/lib/db";
import { plural } from "@/lib/format";

export default function ArtistsPage() {
  const artists = useLiveQuery(() => db.artists.orderBy("sortName").toArray());
  if (!artists) return null;
  if (artists.length === 0) return <EmptyLibrary />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
      <PageHeader title="Artists" subtitle={plural(artists.length, "artist")} />
      <ul className="px-2 md:px-4">
        {artists.map((artist) => (
          <li key={artist.id}>
            <Link
              href={`/artist?id=${encodeURIComponent(artist.id)}`}
              className="flex min-h-14 items-center gap-3 rounded-lg px-2 hover:bg-surface active:bg-surface"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-line font-semibold text-muted">
                {artist.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">{artist.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
