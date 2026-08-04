"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Confirms before the user loses unsaved form edits. Covers three exit
 * paths, since none of them overlap in Next.js's App Router:
 * - Tab close / refresh / typed a new URL: native `beforeunload` dialog.
 * - Clicking an in-app <Link> (nav sidebar, bottom tab bar, etc.): a capture
 *   click listener intercepts internal navigation and shows our own dialog.
 * - Browser back/forward button: client-side routing never fires
 *   `beforeunload`, so a sentinel history entry + `popstate` listener does
 *   the equivalent — push a same-URL entry while dirty, and if the user
 *   backs out of it, immediately re-push it and show the dialog instead.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const [pending, setPending] = useState<{ type: "link"; href: string } | { type: "back" } | null>(null);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!dirtyRef.current || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest("a");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href || href.startsWith("#") || anchor.target === "_blank") return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;

      e.preventDefault();
      setPending({ type: "link", href });
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    if (!dirty) return;

    history.pushState(null, "", window.location.href);
    function handlePopState() {
      if (!dirtyRef.current) return;
      history.pushState(null, "", window.location.href);
      setPending({ type: "back" });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [dirty]);

  function confirmLeave() {
    if (!pending) return;
    if (pending.type === "link") {
      router.push(pending.href);
    } else {
      history.go(-2);
    }
    setPending(null);
  }

  function cancelLeave() {
    setPending(null);
  }

  return { confirmOpen: pending !== null, confirmLeave, cancelLeave };
}
