"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { db, type LinkedFolder } from "@/lib/db";
import {
  canLinkFolders,
  folderPermission,
  requestFolderPermission,
  unlinkFolder,
} from "@/lib/folders";
import { plural } from "@/lib/format";
import { linkFolder, scanFolder, useImport } from "@/lib/import/client";
import { ActionSheet } from "./action-sheet";

const noSubscription = () => () => {};

/** Whether this browser can link folders. False during the server render. */
export function useCanLinkFolders(): boolean {
  return useSyncExternalStore(noSubscription, canLinkFolders, () => false);
}

const button =
  "min-h-9 rounded-full bg-white/10 px-4 text-sm font-medium transition-transform active:scale-95 disabled:opacity-40";

function FolderRow({ folder }: { folder: LinkedFolder }) {
  const importing = useImport((state) => state.running);
  const songs = useLiveQuery(
    () => db.renditions.where("folderId").equals(folder.id).count(),
    [folder.id],
  );
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void folderPermission(folder).then((state) => {
      if (!cancelled) setAllowed(state === "granted");
    });
    return () => {
      cancelled = true;
    };
  }, [folder]);

  async function rescan() {
    // Asking for access only works from a click, so it happens here first.
    const ok = allowed || (await requestFolderPermission(folder));
    setAllowed(ok);
    if (ok) scanFolder(folder.id);
  }

  return (
    <li className="row-line flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/playlist?id=${encodeURIComponent(folder.playlistId)}`}
          className="block truncate font-medium hover:underline"
        >
          {folder.name}
        </Link>
        <p className="truncate text-sm text-muted">
          {plural(songs ?? 0, "song")}
          {allowed === false ? " · Access needs to be allowed again" : ""}
        </p>
      </div>
      <button className={button} disabled={importing} onClick={rescan}>
        {allowed === false ? "Allow access" : "Rescan"}
      </button>
      <button
        className={`${button} text-bad`}
        disabled={importing}
        onClick={() => setConfirming(true)}
      >
        Unlink
      </button>
      {confirming && (
        <ActionSheet
          title={`Unlink “${folder.name}”?`}
          subtitle="Its songs and playlist leave the app. The files on your computer are not touched."
          onClose={() => setConfirming(false)}
          actions={[
            {
              label: "Unlink folder",
              destructive: true,
              onSelect: () => void unlinkFolder(folder.id),
            },
          ]}
        />
      )}
    </li>
  );
}

/** The Settings section for linked folders. Desktop Chrome and Edge only. */
export function LinkedFoldersSection() {
  const supported = useCanLinkFolders();
  const importing = useImport((state) => state.running);
  const folders = useLiveQuery(() =>
    db.folders.orderBy("playlistId").toArray(),
  );
  if (!supported && !folders?.length) return null;

  return (
    <section className="card rounded-2xl p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
        Linked folders
      </h2>
      <p className="mb-3 text-sm text-muted">
        Songs in a linked folder play straight from your computer and are not
        copied. Each folder gets a playlist of the same name. Rescan after
        adding or removing songs; it also runs when the app opens.
      </p>
      {folders && folders.length > 0 && (
        <ul className="mb-3">
          {folders.map((folder) => (
            <FolderRow key={folder.id} folder={folder} />
          ))}
        </ul>
      )}
      {supported && (
        <button
          disabled={importing}
          className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-black disabled:opacity-40"
          onClick={() => void linkFolder()}
        >
          Link a folder
        </button>
      )}
    </section>
  );
}

/**
 * Rescans every linked folder the browser still allows access to. Runs once
 * when the app opens; folders that need permission again are left for the
 * listener to allow in Settings, since asking needs a click.
 */
export async function rescanAllowedFolders(): Promise<void> {
  if (!canLinkFolders()) return;
  const folders = await db.folders.toArray();
  for (const folder of folders) {
    if ((await folderPermission(folder)) !== "granted") continue;
    // One scan at a time; wait for the previous one to finish.
    while (useImport.getState().running) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    scanFolder(folder.id, true);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
