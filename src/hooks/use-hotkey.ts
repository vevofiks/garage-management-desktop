"use client";

import { useEffect } from "react";

/**
 * Binds a Ctrl+<key> shortcut while the component is mounted. Windows-only
 * target (see docs/prd.md §Platform) so Ctrl is the only modifier needed —
 * no Cmd/meta branching.
 */
export function useHotkey(key: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, handler, enabled]);
}
