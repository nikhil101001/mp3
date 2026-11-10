"use client";

import { useArtworkUrl, type ArtworkSize } from "@/lib/artwork";
import { Icon } from "./icons";

export function Artwork({
  id,
  size = "thumb",
  className = "",
  rounded = "rounded-md",
}: {
  id: string | undefined;
  size?: ArtworkSize;
  className?: string;
  rounded?: string;
}) {
  const url = useArtworkUrl(id, size);
  return (
    <div
      className={`relative aspect-square shrink-0 overflow-hidden bg-line ${rounded} ${className}`}
    >
      {url ? (
        // Covers are local blobs, so the Next image optimizer does not apply.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          <Icon name="songs" className="h-2/5 w-2/5" />
        </div>
      )}
    </div>
  );
}
