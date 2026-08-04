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
 *
 * Callers must use the returned `navigate()` — not router.push — for any
 * navigation they trigger themselves while this hook is active (e.g. the
 * redirect after a successful save). Otherwise the sentinel entry pushed
 * below is never collapsed: it sits underneath the destination page, so
 * pressing Back once afterwards lands back on the sentinel (this same form)
 * instead of wherever the user actually came from.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const sentinelPushed = useRef(false);

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
    sentinelPushed.current = true;
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
      navigate(pending.href);
    } else {
      history.go(-2);
      sentinelPushed.current = false;
    }
    setPending(null);
  }

  function cancelLeave() {
    setPending(null);
  }

  // Collapses the sentinel entry into the destination (router.replace)
  // instead of pushing on top of it (router.push), when one is pending.
  function navigate(href: string) {
    if (sentinelPushed.current) {
      sentinelPushed.current = false;
      router.replace(href);
    } else {
      router.push(href);
    }
  }

  return { confirmOpen: pending !== null, confirmLeave, cancelLeave, navigate };
}
