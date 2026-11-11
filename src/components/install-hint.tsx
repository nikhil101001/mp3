"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "mp3-install-dismissed";

/** Chrome's install event, which is not in the standard type library. */
type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode =
  | { kind: "hidden" }
  | { kind: "ios" }
  | { kind: "prompt"; event: InstallPromptEvent };

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac, but a Mac has no touch screen.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Registers the service worker and, when the app is running in a browser tab,
 * offers to install it. iPhone has no install button, so it gets instructions.
 */
export function InstallHint() {
  const [mode, setMode] = useState<Mode>({ kind: "hidden" });

  useEffect(() => {
    // The service worker is production-only: in development it would serve
    // stale code and fight hot reloading.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Storage blocked: show the hint; it can still be closed for this visit.
    }
    if (dismissed || isStandalone()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setMode({ kind: "prompt", event: event as InstallPromptEvent });
    };
    const onInstalled = () => setMode({ kind: "hidden" });
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Decided after mount, because the server cannot know the device.
    const timer = setTimeout(() => {
      if (isIos()) setMode({ kind: "ios" });
    }, 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode.kind === "hidden") return null;

  function dismiss() {
    setMode({ kind: "hidden" });
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to remember if storage is blocked.
    }
  }

  async function install(event: InstallPromptEvent) {
    await event.prompt();
    await event.userChoice;
    setMode({ kind: "hidden" });
  }

  return (
    <div className="glass rise-in pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl px-4 py-3 text-sm">
      <div className="relative min-w-0 flex-1">
        <p className="font-semibold">Install mp3</p>
        <p className="text-white/65">
          {mode.kind === "ios"
            ? "Tap Share, then “Add to Home Screen”. Music then keeps playing with the screen locked."
            : "Add it to this device to open it like an app, even offline."}
        </p>
      </div>
      {mode.kind === "prompt" && (
        <button
          className="press relative shrink-0 rounded-full bg-accent px-4 py-2 font-semibold text-black"
          onClick={() => void install(mode.event)}
        >
          Install
        </button>
      )}
      <button
        className="relative shrink-0 font-medium text-accent"
        onClick={dismiss}
      >
        {mode.kind === "ios" ? "Got it" : "Not now"}
      </button>
    </div>
  );
}
