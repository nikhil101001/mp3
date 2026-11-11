"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useState } from "react";
import { NameSheet } from "@/components/action-sheet";
import { Artwork } from "@/components/artwork";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/library";
import { db } from "@/lib/db";
import { plural } from "@/lib/format";
import { createPlaylist, playlistEntries } from "@/lib/playlists";

export default function PlaylistsPage() {
  const [naming, setNaming] = useState(false);
  const playlists = useLiveQuery(async () => {
    const all = await db.playlists.orderBy("name").toArray();
    return Promise.all(
      all.map(async (playlist) => {
        const entries = await playlistEntries(playlist.id);
        return {
          playlist,
          count: entries.length,
          artworkId: entries.find((entry) => entry.track.artworkId)?.track
            .artworkId,
        };
      }),
    );
  });
  if (!playlists) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <PageHeader
        title="Playlists"
        subtitle={
          playlists.length > 0 ? plural(playlists.length, "playlist") : undefined
        }
      />
      <ul className="pl-4 md:pl-6">
        <li>
          <button
            className="flex h-[4.5rem] w-full items-center gap-3 text-left text-accent active:opacity-60"
            onClick={() => setNaming(true)}
          >
            <span className="card flex h-14 w-14 shrink-0 items-center justify-center rounded-lg">
              <Icon name="plus" />
            </span>
            <span className="row-line flex h-full flex-1 items-center text-[17px]">
              New playlist
            </span>
          </button>
        </li>
        {playlists.map(({ playlist, count, artworkId }) => (
          <li key={playlist.id}>
            <Link
              href={`/playlist?id=${encodeURIComponent(playlist.id)}`}
              className="flex h-[4.5rem] items-center gap-3 active:opacity-60"
            >
              <Artwork id={artworkId} rounded="rounded-lg" className="h-14 w-14" />
              <span className="row-line flex h-full min-w-0 flex-1 flex-col justify-center pr-4">
                <span className="truncate text-[17px]">{playlist.name}</span>
                <span className="truncate text-sm text-muted">
                  {plural(count, "song")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {playlists.length === 0 && (
        <p className="px-4 pt-6 text-sm text-muted md:px-6">
          Playlists you create appear here. You can also add a song to a
          playlist from its ⋯ menu.
        </p>
      )}
      <div className="chrome-space" />
      {naming && (
        <NameSheet
          title="New playlist"
          confirmLabel="Create"
          onClose={() => setNaming(false)}
          onSubmit={(name) => void createPlaylist(name)}
        />
      )}
    </div>
  );
}
