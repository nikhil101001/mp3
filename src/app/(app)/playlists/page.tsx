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
import { useCanLinkFolders } from "@/components/linked-folders";
import {
  audioFilesIn,
  folderNameOf,
  importFiles,
  linkFolder,
  useImport,
} from "@/lib/import/client";
import { createPlaylist, playlistEntries } from "@/lib/playlists";

const ACCEPT = "audio/*,.mp3,.m4a,.aac,.flac,.wav,.aiff,.ogg,.opus";

const rowClass =
  "press flex h-[4.5rem] w-full cursor-pointer items-center gap-3 text-left text-accent";

/**
 * A row that picks songs from the device and makes a playlist of them.
 * With `folder`, the browser offers a folder picker and the playlist takes the
 * folder's name; otherwise several files are picked and the name is asked.
 */
function FromFilesRow({
  folder = false,
  onPicked,
}: {
  folder?: boolean;
  onPicked: (files: File[]) => void;
}) {
  const importing = useImport((state) => state.running);
  return (
    <label
      className={`${rowClass} ${importing ? "pointer-events-none opacity-40" : ""}`}
    >
      <span className="card flex h-14 w-14 shrink-0 items-center justify-center rounded-lg">
        <Icon name={folder ? "albums" : "songs"} />
      </span>
      <span className="row-line flex h-full flex-1 flex-col justify-center pr-4">
        <span className="text-[17px]">
          {folder ? "New playlist from a folder" : "New playlist from files"}
        </span>
        <span className="text-sm text-muted">
          {folder
            ? "Pick a folder; every song in it is added"
            : "Pick songs on this device"}
        </span>
      </span>
      <input
        type="file"
        multiple
        accept={folder ? undefined : ACCEPT}
        className="sr-only"
        disabled={importing}
        onChange={(event) => {
          const files = audioFilesIn(Array.from(event.target.files ?? []));
          event.target.value = "";
          if (files.length > 0) onPicked(files);
        }}
        {...(folder ? { webkitdirectory: "" } : {})}
      />
    </label>
  );
}

export default function PlaylistsPage() {
  const [naming, setNaming] = useState(false);
  /** Songs picked for a new playlist, waiting for it to be named. */
  const [picked, setPicked] = useState<File[] | null>(null);
  const canLink = useCanLinkFolders();
  const importing = useImport((state) => state.running);
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
          playlists.length > 0
            ? plural(playlists.length, "playlist")
            : undefined
        }
      />
      <ul className="pl-4 md:pl-6">
        <li>
          <button className={rowClass} onClick={() => setNaming(true)}>
            <span className="card flex h-14 w-14 shrink-0 items-center justify-center rounded-lg">
              <Icon name="plus" />
            </span>
            <span className="row-line flex h-full flex-1 items-center text-[17px]">
              New playlist
            </span>
          </button>
        </li>
        <li>
          <FromFilesRow onPicked={setPicked} />
        </li>
        {/* Desktop Chrome and Edge link a folder in place; other desktop
            browsers can still pick a folder, which copies its songs. */}
        {canLink ? (
          <li>
            <button
              className={`${rowClass} ${importing ? "pointer-events-none opacity-40" : ""}`}
              onClick={() => void linkFolder()}
            >
              <span className="card flex h-14 w-14 shrink-0 items-center justify-center rounded-lg">
                <Icon name="albums" />
              </span>
              <span className="row-line flex h-full flex-1 flex-col justify-center pr-4">
                <span className="text-[17px]">Link a folder</span>
                <span className="text-sm text-muted">
                  Plays songs from the folder in place, without copying
                </span>
              </span>
            </button>
          </li>
        ) : (
          <li className="hidden md:block">
            <FromFilesRow
              folder
              onPicked={(files) => {
                const name = folderNameOf(files);
                if (name) importFiles(files, name);
                else setPicked(files);
              }}
            />
          </li>
        )}
        {playlists.map(({ playlist, count, artworkId }) => (
          <li key={playlist.id}>
            <Link
              href={`/playlist?id=${encodeURIComponent(playlist.id)}`}
              className="flex h-[4.5rem] items-center gap-3 active:opacity-60"
            >
              <Artwork
                id={artworkId}
                rounded="rounded-lg"
                className="h-14 w-14"
              />
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
          Playlists you create appear here. Pick songs from this device to make
          one in a single step, or add a song from its ⋯ menu.
        </p>
      )}
      <div className="chrome-space" />
      {picked && (
        <NameSheet
          title={`New playlist from ${plural(picked.length, "song")}`}
          initial={folderNameOf(picked) ?? ""}
          confirmLabel="Create playlist"
          onClose={() => setPicked(null)}
          onSubmit={(name) => importFiles(picked, name)}
        />
      )}
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
