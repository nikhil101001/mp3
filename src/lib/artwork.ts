import { useEffect, useState } from "react";
import { db } from "./db";

export type ArtworkSize = "thumb" | "large";

// Object URLs for covers, kept for the session so lists don't flicker and the
// player can read a cover synchronously when the phone is locked.
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();

const keyFor = (id: string, size: ArtworkSize) => `${size}:${id}`;

/** Streamed tracks carry their cover as a web address; use it directly. */
function webCover(id: string, size: ArtworkSize): string | undefined {
  if (!id.startsWith("http")) return undefined;
  return size === "large" ? id.replace("480x480", "1000x1000") : id;
}

export function peekArtworkUrl(
  id: string | undefined,
  size: ArtworkSize,
): string | undefined {
  return id ? (webCover(id, size) ?? cache.get(keyFor(id, size))) : undefined;
}

export function loadArtworkUrl(
  id: string | undefined,
  size: ArtworkSize,
): Promise<string | undefined> {
  if (!id) return Promise.resolve(undefined);
  const web = webCover(id, size);
  if (web) return Promise.resolve(web);
  const key = keyFor(id, size);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  let request = pending.get(key);
  if (!request) {
    request = db.artwork
      .get(id)
      .then((artwork) => {
        if (!artwork) return undefined;
        const url = URL.createObjectURL(artwork[size]);
        cache.set(key, url);
        return url;
      })
      .catch(() => undefined)
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}

export function clearArtworkCache(): void {
  cache.forEach((url) => URL.revokeObjectURL(url));
  cache.clear();
}

export function useArtworkUrl(
  id: string | undefined,
  size: ArtworkSize = "thumb",
): string | undefined {
  const [loaded, setLoaded] = useState<{ key: string; url?: string }>();
  const key = id ? keyFor(id, size) : "";

  useEffect(() => {
    if (!id || peekArtworkUrl(id, size)) return;
    let cancelled = false;
    loadArtworkUrl(id, size).then((url) => {
      if (!cancelled) setLoaded({ key: keyFor(id, size), url });
    });
    return () => {
      cancelled = true;
    };
  }, [id, size]);

  return (
    peekArtworkUrl(id, size) ?? (loaded?.key === key ? loaded.url : undefined)
  );
}
