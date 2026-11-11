"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { restorePlayer } from "@/lib/player";
import "./glass.css";
import "./motion.css";
import { Icon, type IconName } from "./icons";
import { ImportStatus } from "./import-button";
import { InstallHint } from "./install-hint";
import { rescanAllowedFolders } from "./linked-folders";
import { useMiniPlayer } from "./mini-player";
import { NowPlaying } from "./now-playing";
import { PlayerBar } from "./player-bar";

type NavItem = { href: string; label: string; icon: IconName; match: string[] };

/** The five tabs on phones. Desktop's sidebar adds Settings below them. */
const TABS: NavItem[] = [
  { href: "/", label: "Songs", icon: "songs", match: ["/"] },
  {
    href: "/albums",
    label: "Albums",
    icon: "albums",
    match: ["/albums", "/album"],
  },
  {
    href: "/artists",
    label: "Artists",
    icon: "artists",
    match: ["/artists", "/artist"],
  },
  {
    href: "/playlists",
    label: "Playlists",
    icon: "playlists",
    match: ["/playlists", "/playlist"],
  },
  { href: "/search", label: "Search", icon: "search", match: ["/search"] },
];
const SETTINGS: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: "settings",
  match: ["/settings"],
};
/** Pages that show the settings shortcut on phones. */
const TOP_LEVEL = ["/", "/albums", "/artists", "/playlists"];

/**
 * Pages fill the whole screen and scroll underneath the floating glass:
 * a tab bar and player capsule on phones, a sidebar and player bar on desktop.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const mini = useMiniPlayer();
  const activeTab = TABS.findIndex((item) => item.match.includes(pathname));

  useEffect(() => {
    void restorePlayer();
    void rescanAllowedFolders();
  }, []);

  return (
    <div className="relative flex h-dvh overflow-hidden">
      <nav className="hidden w-60 shrink-0 flex-col gap-1 border-r border-white/[0.06] bg-white/[0.03] p-3 md:flex">
        <p className="px-3 pb-5 pt-3 text-2xl font-bold tracking-tight">
          mp<span className="text-accent">3</span>
        </p>
        {[...TABS, SETTINGS].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors duration-200 hover:bg-white/[0.06] ${
              item.match.includes(pathname) ? "bg-white/10" : ""
            }`}
          >
            <Icon name={item.icon} size={20} className="text-accent" />
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
        {/* Keyed by route so each page eases in as it opens. */}
        <div key={pathname} className="page-in flex min-h-0 flex-1 flex-col">
          {children}
        </div>
        {TOP_LEVEL.includes(pathname) && (
          <Link
            href="/settings"
            aria-label="Settings"
            className="glass-thin press absolute right-4 top-[calc(env(safe-area-inset-top)+1.6rem)] z-30 flex h-10 w-10 items-center justify-center rounded-full text-accent md:hidden"
          >
            <Icon name="settings" size={19} />
          </Link>
        )}
      </main>

      {/* Floating chrome. It lets touches through everywhere except the bars. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:left-60">
        <div className="chrome-fade absolute inset-x-0 bottom-0 h-40 md:h-28" />
        <div className="relative flex flex-col gap-2 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] md:px-6 md:pb-4">
          <InstallHint />
          <ImportStatus />
          <PlayerBar
            onExpand={() => setExpanded(true)}
            miniPlayer={mini.supported ? mini : undefined}
          />
          <nav className="glass pointer-events-auto relative mx-auto flex w-full max-w-md rounded-full p-1 md:hidden">
            {/* The highlight slides between tabs instead of jumping. */}
            <span
              aria-hidden="true"
              className="motion-safe-only absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/5)] rounded-full bg-white/[0.14] transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                translate: `${Math.max(activeTab, 0) * 100}% 0`,
                opacity: activeTab < 0 ? 0 : 1,
              }}
            />
            {TABS.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={index === activeTab ? "page" : undefined}
                className={`relative flex h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition-[color,scale] duration-200 active:scale-90 ${
                  index === activeTab ? "text-accent" : "text-white/75"
                }`}
              >
                <Icon name={item.icon} size={22} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <NowPlaying open={expanded} onClose={() => setExpanded(false)} />
      {mini.portal}
    </div>
  );
}
