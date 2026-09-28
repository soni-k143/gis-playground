"use client";

import { useEffect } from "react";

/**
 * Shows the browser's native "changes you made may not be saved" prompt on
 * an actual page reload or tab close, whenever `hasUnsavedChanges` is true.
 *
 * Important limitation: `beforeunload` only fires when the page itself is
 * about to unload — a hard reload, closing the tab, or typing a new URL.
 * It does NOT fire for a client-side Next.js <Link> navigation to another
 * route in this app, since the page never unloads for that (it's a normal
 * React re-render under the hood). So this protects against losing work to
 * an accidental reload, but not against clicking away to another tool page.
 * Guarding that too needs intercepting navigation itself (e.g. a custom
 * Link wrapper with a confirm() prompt), which is a separate, larger change.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue to be set; the string itself is ignored
      // by modern browsers, which show their own generic message instead.
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);
}