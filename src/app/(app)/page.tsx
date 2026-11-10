"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { EmptyLibrary, PageHeader, PlayActions } from "@/components/library";
import { TrackList } from "@/components/track-list";
import { db } from "@/lib/db";
import { plural } from "@/lib/format";

export default function SongsPage() {
  const tracks = useLiveQuery(() => db.tracks.orderBy("sortTitle").toArray());
  if (!tracks) return null;
  if (tracks.length === 0) return <EmptyLibrary />;
  return (
    <TrackList
      tracks={tracks}
      header={
        <PageHeader title="Songs" subtitle={plural(tracks.length, "song")}>
          <PlayActions trackIds={tracks.map((track) => track.id)} />
        </PageHeader>
      }
    />
  );
}
