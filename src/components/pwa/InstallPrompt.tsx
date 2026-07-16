"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The `beforeinstallprompt` event (not in the standard DOM lib types).
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "tulay:install-dismissed";

/**
 * <InstallPrompt> — captures the browser's `beforeinstallprompt` event and
 * surfaces a small "Install Tulay" CTA (a bottom banner). Clicking it triggers
 * the native install dialog; dismissing it remembers the choice for the session
 * so we don't nag. Renders nothing until the browser signals installability
 * (and never after the app is already installed).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const onBeforeInstall = (event: Event) => {
      // Prevent the mini-infobar so we can present our own CTA.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  }, [deferred]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage failures (private mode).
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      data-component-id="install-prompt"
      role="dialog"
      aria-label="Install Tulay"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-4 flex max-w-lg items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-lg sm:inset-x-4"
    >
      <div
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-base font-extrabold text-white"
      >
        T
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <b className="text-ink">Install Tulay</b>
        <p className="text-ink-soft">
          Add it to your home screen for quick, offline-friendly access.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-md px-2 py-1.5 text-sm font-medium text-ink-muted"
      >
        Not now
      </button>
      <button
        type="button"
        onClick={() => void install()}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white"
      >
        Install
      </button>
    </div>
  );
}

export default InstallPrompt;
