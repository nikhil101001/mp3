"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Album } from "@/lib/db";
import { playTracks, shufflePlay } from "@/lib/player";
import { Artwork } from "./artwork";
import { Icon } from "./icons";
import { ImportButton } from "./import-button";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="px-4 pb-3 pt-5 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

/** Play and Shuffle for a set of tracks, used on every list of songs. */
export function PlayActions({ trackIds }: { trackIds: string[] }) {
  const disabled = trackIds.length === 0;
  return (
    <>
      <button
        disabled={disabled}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-black active:opacity-80 disabled:opacity-40"
        onClick={() => playTracks(trackIds, 0)}
      >
        <Icon name="play" size={18} />
        Play
      </button>
      <button
        disabled={disabled}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-5 text-sm font-medium active:bg-surface disabled:opacity-40"
        onClick={() => shufflePlay(trackIds)}
      >
        <Icon name="shuffle" size={18} />
        Shuffle
      </button>
    </>
  );
}

export function EmptyLibrary() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface text-accent">
        <Icon name="songs" size={36} />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Your library is empty</h1>
        <p className="mt-1 max-w-xs text-sm text-muted">
          Import songs from this device. They are copied into the app, so they
          play offline and with the screen locked.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <ImportButton primary />
        <span className="hidden md:inline-flex">
          <ImportButton folder />
        </span>
      </div>
    </div>
  );
}

export function AlbumGrid({ albums }: { albums: Album[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 px-4 sm:grid-cols-3 md:px-6 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {albums.map((album) => (
        <li key={album.id} className="[content-visibility:auto]">
          <Link
            href={`/album?id=${encodeURIComponent(album.id)}`}
            className="group block"
          >
            <Artwork
              id={album.artworkId}
              rounded="rounded-xl"
              className="w-full transition-opacity group-hover:opacity-80"
            />
            <p className="mt-2 truncate text-sm font-medium">{album.title}</p>
            <p className="truncate text-sm text-muted">{album.artist}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
