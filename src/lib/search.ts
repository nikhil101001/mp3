import { create } from "zustand";

/** The search text, kept outside the page so it survives opening a result. */
export const useSearch = create<{
  query: string;
  /** Where to look: your own library, or the Audius catalogue. */
  scope: "library" | "audius";
}>(() => ({ query: "", scope: "library" }));

/** Lower-cases and strips accents, so "beyonce" finds "Beyoncé". */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Returns a test that passes when every word of the query appears. */
export function matcher(query: string): ((haystack: string) => boolean) | null {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return (haystack) => words.every((word) => haystack.includes(word));
}
