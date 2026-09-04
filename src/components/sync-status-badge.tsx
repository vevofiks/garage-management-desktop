"use client";

import { useSync } from "@/hooks/use-sync";
import { Button } from "@/components/ui/button";
import {
  CloudIcon,
  CloudOffIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
} from "lucide-react";

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never synced";
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 15) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ago`;
  } catch (_) {
    return "Recently";
  }
}

export function SyncStatusBadge() {
  const { status, isSyncing, lastSyncedAt, syncNow, cloudUrlHost } = useSync();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => syncNow()}
        disabled={isSyncing}
        title={`Connected to ${cloudUrlHost}. Click to synchronize immediately.`}
        className="h-8 gap-1.5 px-2.5 text-xs font-medium border border-border/60 hover:bg-muted/60 transition-all"
      >
        {isSyncing ? (
          <>
            <RefreshCwIcon className="size-3.5 animate-spin text-blue-500" />
            <span className="text-blue-600 dark:text-blue-400">Syncing...</span>
          </>
        ) : status === "synced" ? (
          <>
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
            </span>
            <CheckCircle2Icon className="size-3.5 text-emerald-500" />
            <span className="text-muted-foreground hidden sm:inline">
              Cloud: <strong className="text-foreground font-semibold">Synced</strong> ({formatRelativeTime(lastSyncedAt)})
            </span>
            <span className="text-muted-foreground sm:hidden">Synced</span>
          </>
        ) : status === "offline" ? (
          <>
            <CloudOffIcon className="size-3.5 text-amber-500" />
            <span className="text-amber-600 dark:text-amber-400">Offline (Local)</span>
          </>
        ) : status === "error" ? (
          <>
            <AlertCircleIcon className="size-3.5 text-destructive" />
            <span className="text-destructive">Sync Error (Retry)</span>
          </>
        ) : (
          <>
            <CloudIcon className="size-3.5 text-muted-foreground" />
            <span>Sync to Cloud</span>
          </>
        )}
      </Button>
    </div>
  );
}
