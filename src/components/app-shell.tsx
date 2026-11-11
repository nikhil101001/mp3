"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import "./glass.css";
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

/**
 * Pages fill the whole screen and scroll underneath the floating glass:
 * a tab bar and player capsule on phones, a sidebar and player bar on desktop.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const isActive = (match: string[]) => match.includes(pathname);

  return (
    <div className="relative flex h-dvh overflow-hidden">
      <nav className="hidden w-60 shrink-0 flex-col gap-1 border-r border-white/[0.06] bg-white/[0.03] p-3 md:flex">
        <p className="px-3 pb-5 pt-3 text-2xl font-bold tracking-tight">
          mp<span className="text-accent">3</span>
        </p>
        {NAV.map((item) => {
          const active = isActive(item.match);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors hover:bg-white/[0.06] ${
                active ? "bg-white/10" : ""
              }`}
            >
              <Icon name={item.icon} size={20} className="text-accent" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
        {children}
      </main>

      {/* Floating chrome. It lets touches through everywhere except the bars. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:left-60">
        <div className="chrome-fade absolute inset-x-0 bottom-0 h-40 md:h-28" />
        <div className="relative flex flex-col gap-2 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] md:px-6 md:pb-4">
          <ImportStatus />
          <PlayerBar onExpand={() => setExpanded(true)} />
          <nav className="glass pointer-events-auto mx-auto flex w-full max-w-md rounded-full p-1 md:hidden">
            {NAV.map((item) => {
              const active = isActive(item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                    active ? "bg-white/[0.14] text-accent" : "text-white/75"
                  }`}
                >
                  <Icon name={item.icon} size={22} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <NowPlaying open={expanded} onClose={() => setExpanded(false)} />
    </div>
  );
}
