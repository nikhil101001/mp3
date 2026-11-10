"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { ImportStatus } from "./import-button";
import { NowPlaying } from "./now-playing";
import { PlayerBar } from "./player-bar";

const NAV: { href: string; label: string; icon: IconName; match: string[] }[] = [
  { href: "/", label: "Songs", icon: "songs", match: ["/"] },
  { href: "/albums", label: "Albums", icon: "albums", match: ["/albums", "/album"] },
  { href: "/artists", label: "Artists", icon: "artists", match: ["/artists", "/artist"] },
  { href: "/settings", label: "Settings", icon: "settings", match: ["/settings"] },
];

/** Sidebar on desktop, bottom tabs on phones, with the player always present. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const isActive = (match: string[]) => match.includes(pathname);

  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line p-3 md:flex">
        <p className="px-3 pb-4 pt-2 text-xl font-bold tracking-tight">
          mp<span className="text-accent">3</span>
        </p>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-surface ${
              isActive(item.match) ? "bg-surface text-foreground" : "text-muted"
            }`}
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
          {children}
        </main>
        <ImportStatus />
        <PlayerBar onExpand={() => setExpanded(true)} />
        <nav className="flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                isActive(item.match) ? "text-accent" : "text-muted"
              }`}
            >
              <Icon name={item.icon} size={22} />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <NowPlaying open={expanded} onClose={() => setExpanded(false)} />
    </div>
  );
}
