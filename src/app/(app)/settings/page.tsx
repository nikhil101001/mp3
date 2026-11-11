"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ImportButton } from "@/components/import-button";
import { PageHeader } from "@/components/library";
import { clearArtworkCache } from "@/lib/artwork";
import { clearLibrary, db } from "@/lib/db";
import { formatBytes, plural } from "@/lib/format";
import { useImport } from "@/lib/import/client";
import { resetPlayer } from "@/lib/player";

type Storage = { used: number; quota: number; persisted: boolean };

async function readStorage(): Promise<Storage | null> {
  try {
    const [estimate, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted(),
    ]);
    return {
      used: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      persisted,
    };
  } catch {
    return null;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card rounded-2xl p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const songCount = useLiveQuery(() => db.tracks.count());
  const importing = useImport((state) => state.running);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Re-read after each import or removal so the numbers stay current.
  useEffect(() => {
    let cancelled = false;
    readStorage().then((value) => {
      if (!cancelled) setStorage(value);
    });
    return () => {
      cancelled = true;
    };
  }, [songCount, importing]);

  async function removeEverything() {
    resetPlayer();
    await clearLibrary();
    clearArtworkCache();
    setConfirming(false);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <PageHeader title="Settings" />
      <div className="mx-4 flex max-w-xl flex-col gap-4 md:mx-6">
        <Section title="Add music">
          <p className="mb-3 text-sm text-muted">
            Songs are copied into the app, so they keep playing offline and with
            the screen locked. MP3, AAC, FLAC and more are supported.
          </p>
          <div className="flex flex-wrap gap-2">
            <ImportButton primary />
            <span className="hidden md:inline-flex">
              <ImportButton folder />
            </span>
          </div>
        </Section>

        <Section title="Storage">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Library</dt>
              <dd>{plural(songCount ?? 0, "song")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Space used</dt>
              <dd>
                {storage
                  ? `${formatBytes(storage.used)} of ${formatBytes(storage.quota)}`
                  : "Unknown"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Protected from clean-up</dt>
              <dd>{storage?.persisted ? "Yes" : "Not yet"}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Remove music">
          {confirming ? (
            <div>
              <p className="mb-3 text-sm">
                Remove all {plural(songCount ?? 0, "song")} from this app? The
                original files on your device are not touched. This cannot be
                undone.
              </p>
              <div className="flex gap-2">
                <button
                  className="min-h-11 rounded-full bg-bad px-5 text-sm font-semibold text-black"
                  onClick={removeEverything}
                >
                  Remove everything
                </button>
                <button
                  className="min-h-11 rounded-full bg-white/10 px-5 text-sm font-medium"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              disabled={!songCount || importing}
              className="min-h-11 rounded-full bg-white/10 px-5 text-sm font-medium text-bad disabled:opacity-40"
              onClick={() => setConfirming(true)}
            >
              Remove all music
            </button>
          )}
        </Section>

        <Section title="Diagnostics">
          <Link href="/spike" className="text-sm text-accent hover:underline">
            Open the iPhone playback test
          </Link>
        </Section>
      </div>
      <div className="chrome-space" />
    </div>
  );
}
