"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ActionSheet, NameSheet } from "@/components/action-sheet";
import { Artwork } from "@/components/artwork";
import { Icon } from "@/components/icons";
import { PlayActions } from "@/components/library";
import { TrackList } from "@/components/track-list";
import { db } from "@/lib/db";
import { formatTime, plural } from "@/lib/format";
import {
  deletePlaylist,
  playlistEntries,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
  type PlaylistEntry,
} from "@/lib/playlists";

const pillBase =
  "glass-thin flex h-9 items-center justify-center rounded-full text-sm font-semibold text-accent transition-transform active:scale-95";
const pill = `${pillBase} px-4`;

function SortableRow({ entry }: { entry: PlaylistEntry }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative flex h-[58px] items-center gap-3 pl-3 pr-1 md:pl-5 ${
        isDragging
          ? "z-10 rounded-xl bg-white/10 shadow-xl shadow-black/50"
          : ""
      }`}
    >
      <button
        aria-label={`Remove ${entry.track.title} from playlist`}
        className="flex h-11 w-8 shrink-0 items-center justify-center text-bad active:opacity-60"
        onClick={() => void removeFromPlaylist(entry.item.id)}
      >
        <Icon name="minus" size={22} />
      </button>
      <Artwork
        id={entry.track.artworkId}
        className="h-11 w-11"
        rounded="rounded-[0.45rem]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-snug">
          {entry.track.title}
        </span>
        <span className="block truncate text-sm text-muted">
          {entry.track.artist}
        </span>
      </span>
      <button
        aria-label={`Reorder ${entry.track.title}`}
        className="flex h-full w-12 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <Icon name="grip" size={22} />
      </button>
    </li>
  );
}

/** Edit mode: drag rows by their handle, or remove them. */
function EditList({
  playlistId,
  entries,
}: {
  playlistId: string;
  entries: PlaylistEntry[];
}) {
  // Holds the dropped order until the database catches up, to avoid a flicker.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const byId = new Map(entries.map((entry) => [entry.item.id, entry]));
  const ordered = pendingOrder
    ? pendingOrder.flatMap((id) => byId.get(id) ?? [])
    : entries;
  const ids = ordered.map((entry) => entry.item.id);

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = arrayMove(
      ids,
      ids.indexOf(String(active.id)),
      ids.indexOf(String(over.id)),
    );
    setPendingOrder(next);
    await reorderPlaylist(playlistId, next);
    setPendingOrder(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul>
          {ordered.map((entry) => (
            <SortableRow key={entry.item.id} entry={entry} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function PlaylistView() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const data = useLiveQuery(
    async () => ({
      playlist: await db.playlists.get(id),
      entries: await playlistEntries(id),
      linked: await db.folders.where("playlistId").equals(id).first(),
    }),
    [id],
  );
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<"menu" | "rename" | "delete" | null>(null);

  if (!data) return null;
  const { playlist, entries, linked } = data;
  if (!playlist) {
    return <p className="p-6 text-muted">This playlist no longer exists.</p>;
  }
  const tracks = entries.map((entry) => entry.track);
  const seconds =
    tracks.reduce((sum, track) => sum + track.durationMs, 0) / 1000;
  const cover = tracks.find((track) => track.artworkId)?.artworkId;

  const toolbar = (
    <div className="flex justify-end gap-2 px-4 pt-3 md:px-6">
      {entries.length > 0 && (
        <button className={pill} onClick={() => setEditing((value) => !value)}>
          {editing ? "Done" : "Edit"}
        </button>
      )}
      {!editing && (
        <button
          aria-label="Playlist options"
          className={`${pillBase} w-9`}
          onClick={() => setSheet("menu")}
        >
          <Icon name="more" size={18} />
        </button>
      )}
    </div>
  );

  const sheets = (
    <>
      {sheet === "menu" && (
        <ActionSheet
          title={playlist.name}
          onClose={() => setSheet(null)}
          actions={[
            {
              label: "Rename",
              keepOpen: true,
              onSelect: () => setSheet("rename"),
            },
            {
              label: "Delete playlist",
              destructive: true,
              keepOpen: true,
              onSelect: () => setSheet("delete"),
            },
          ]}
        />
      )}
      {sheet === "rename" && (
        <NameSheet
          title="Rename playlist"
          initial={playlist.name}
          confirmLabel="Save"
          onClose={() => setSheet(null)}
          onSubmit={(name) => void renamePlaylist(playlist.id, name)}
        />
      )}
      {sheet === "delete" && (
        <ActionSheet
          title={`Delete “${playlist.name}”?`}
          subtitle="The songs stay in your library."
          onClose={() => setSheet(null)}
          actions={[
            {
              label: "Delete playlist",
              destructive: true,
              onSelect: async () => {
                await deletePlaylist(playlist.id);
                router.replace("/playlists");
              },
            },
          ]}
        />
      )}
    </>
  );

  if (editing) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {toolbar}
        <h1 className="px-4 pb-3 pt-2 text-2xl font-bold tracking-tight md:px-6">
          {playlist.name}
        </h1>
        <EditList playlistId={playlist.id} entries={entries} />
        <div className="chrome-space" />
      </div>
    );
  }

  return (
    <>
      <TrackList
        tracks={tracks}
        extraActions={(track) => [
          {
            label: "Remove from playlist",
            destructive: true,
            onSelect: () => {
              const entry = entries.find((e) => e.track.id === track.id);
              if (entry) void removeFromPlaylist(entry.item.id);
            },
          },
        ]}
        header={
          <div>
            {toolbar}
            <header className="flex flex-col items-center gap-4 px-4 pb-4 pt-2 text-center md:flex-row md:items-end md:gap-6 md:px-6 md:text-left">
              <Artwork
                id={cover}
                size="large"
                rounded="rounded-2xl"
                className="w-56 shadow-2xl shadow-black/60"
              />
              <div className="w-full min-w-0">
                <h1 className="text-2xl font-bold tracking-tight md:text-4xl">
                  {playlist.name}
                </h1>
                <p className="mt-1 text-sm text-muted">
                  {linked ? "Linked folder" : "Playlist"} ·{" "}
                  {plural(tracks.length, "song")}
                  {tracks.length > 0 ? ` · ${formatTime(seconds)}` : ""}
                </p>
                <div className="mx-auto mt-4 grid w-full max-w-md grid-cols-2 gap-3 md:mx-0">
                  <PlayActions trackIds={tracks.map((track) => track.id)} />
                </div>
              </div>
            </header>
            {tracks.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-muted">
                This playlist is empty. Add songs from their ⋯ menu.
              </p>
            )}
          </div>
        }
      />
      {sheets}
    </>
  );
}

export default function PlaylistPage() {
  return (
    <Suspense>
      <PlaylistView />
    </Suspense>
  );
}
