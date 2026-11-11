"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, type Track } from "@/lib/db";
import { addToPlaylist, createPlaylist } from "@/lib/playlists";
import {
  NameSheet,
  Sheet,
  SheetCancel,
  sheetRow,
  SheetTitle,
} from "./action-sheet";
import { Icon } from "./icons";

/** Picks a playlist for a song, or creates a new one with the song in it. */
export function AddToPlaylist({
  track,
  onClose,
}: {
  track: Track;
  onClose: () => void;
}) {
  const playlists = useLiveQuery(() => db.playlists.orderBy("name").toArray());
  const [naming, setNaming] = useState(false);

  if (naming) {
    return (
      <NameSheet
        title="New playlist"
        confirmLabel="Create and add"
        onClose={onClose}
        onSubmit={async (name) => {
          const playlist = await createPlaylist(name);
          await addToPlaylist(playlist.id, track.id);
        }}
      />
    );
  }

  return (
    <Sheet label="Add to playlist" onClose={onClose}>
      <SheetTitle title="Add to playlist" subtitle={track.title} />
      <button className={`${sheetRow} text-accent`} onClick={() => setNaming(true)}>
        <Icon name="plus" size={20} />
        New playlist
      </button>
      {(playlists ?? []).map((playlist) => (
        <button
          key={playlist.id}
          className={sheetRow}
          onClick={async () => {
            await addToPlaylist(playlist.id, track.id);
            onClose();
          }}
        >
          <Icon name="playlists" size={20} className="text-white/60" />
          <span className="truncate">{playlist.name}</span>
        </button>
      ))}
      <SheetCancel onClose={onClose} />
    </Sheet>
  );
}
