"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { AlbumGrid, EmptyLibrary, PageHeader } from "@/components/library";
import { db } from "@/lib/db";
import { plural } from "@/lib/format";

export default function AlbumsPage() {
  const albums = useLiveQuery(() => db.albums.orderBy("sortTitle").toArray());
  if (!albums) return null;
  if (albums.length === 0) return <EmptyLibrary />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <PageHeader title="Albums" subtitle={plural(albums.length, "album")} />
      <AlbumGrid albums={albums} />
      <div className="chrome-space" />
    </div>
  );
}
