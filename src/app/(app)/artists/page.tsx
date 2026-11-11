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
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <PageHeader title="Artists" subtitle={plural(artists.length, "artist")} />
      <ul className="pl-4 md:pl-6">
        {artists.map((artist) => (
          <li key={artist.id}>
            <Link
              href={`/artist?id=${encodeURIComponent(artist.id)}`}
              className="flex h-[3.75rem] items-center gap-3 active:opacity-60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white/70">
                {artist.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="row-line flex h-full min-w-0 flex-1 items-center pr-4 text-[17px]">
                <span className="truncate">{artist.name}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="chrome-space" />
    </div>
  );
}
