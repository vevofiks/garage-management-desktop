"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DatabaseIcon, DownloadIcon, Trash2Icon, RefreshCwIcon, Loader2, ShieldCheckIcon, CloudIcon, CheckCircle2Icon, AlertCircleIcon, GlobeIcon } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatBytes, formatDate } from "@/lib/format";
import { useRequireRole } from "@/hooks/use-auth";
import { useSync } from "@/hooks/use-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppUpdateCard } from "@/components/app-update-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BackupInfo = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
};

type BackupSettingsData = {
  weeklyBackupEnabled: boolean;
  lastWeeklyBackupAt: string;
  backups: BackupInfo[];
};

export default function SettingsPage() {
  const { isAllowed, isLoading: isAuthLoading } = useRequireRole("admin");
  const queryClient = useQueryClient();
  const { status, isSyncing, lastSyncedAt, syncNow, cloudUrlHost } = useSync();

  const { data, isLoading } = useQuery<BackupSettingsData>({
    queryKey: ["settings", "backup"],
    queryFn: () => apiClient.get<BackupSettingsData>("/api/settings/backup"),
    enabled: isAllowed,
  });

  const toggleWeeklyBackupMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient.patch("/api/settings/backup", { weekly_backup_enabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "backup"] });
      toast.success("Backup settings updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Failed to update backup settings"),
  });

  const createBackupMutation = useMutation({
    mutationFn: () => apiClient.post<BackupInfo>("/api/settings/backup", undefined),
    onSuccess: (newBackup) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "backup"] });
      toast.success(`Backup created: ${newBackup.filename}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Failed to create backup"),
  });

  const deleteBackupMutation = useMutation({
    mutationFn: (filename: string) => apiClient.delete(`/api/settings/backup/${filename}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "backup"] });
      toast.success("Backup file deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Failed to delete backup file"),
  });

  const handleDownload = (filename: string) => {
    window.open(`/api/settings/backup/${filename}`, "_blank");
  };

  if (isAuthLoading || !isAllowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" description="Configure system options and manage database backups." />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CloudIcon className="size-5 text-primary" />
              <CardTitle>Cloud Database Synchronization</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Offline-first synchronization with remote Neon PostgreSQL cloud database.
            </CardDescription>
          </div>
          <Button
            onClick={() => syncNow()}
            disabled={isSyncing}
          >
            <RefreshCwIcon className={`size-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Synchronizing..." : "Sync Now"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border rounded-lg p-4 bg-muted/20">
            <div>
              <div className="text-xs text-muted-foreground">Cloud Status</div>
              <div className="flex items-center gap-2 mt-1">
                {status === "synced" ? (
                  <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                    <CheckCircle2Icon className="size-3 mr-1" /> Synced
                  </Badge>
                ) : status === "syncing" ? (
                  <Badge variant="secondary" className="text-blue-600 bg-blue-100 dark:bg-blue-950">
                    <RefreshCwIcon className="size-3 mr-1 animate-spin" /> Syncing
                  </Badge>
                ) : status === "offline" ? (
                  <Badge variant="outline" className="text-amber-600 border-amber-500">
                    <AlertCircleIcon className="size-3 mr-1" /> Offline
                  </Badge>
                ) : status === "never" ? (
                  <Badge variant="outline" className="text-blue-600 border-blue-400">
                    <CloudIcon className="size-3 mr-1" /> Ready to Sync
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <AlertCircleIcon className="size-3 mr-1" /> Error
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Cloud Database Host</div>
              <div className="font-mono text-xs mt-1 truncate" title={cloudUrlHost}>
                {cloudUrlHost}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last Cloud Sync</div>
              <div className="text-sm font-medium mt-1">
                {lastSyncedAt ? formatDate(lastSyncedAt) : "Never"}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Offline Guarantee:</strong> Invoices, customers, and expenses are saved to local high-speed storage first, ensuring instantaneous operations even if your internet connection is down. When internet connectivity is present, data automatically uploads to Neon cloud.
          </p>
        </CardContent>
      </Card>

      <AppUpdateCard />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5 text-primary" />
            <CardTitle>Automatic Weekly Backup</CardTitle>
          </div>
          <CardDescription>
            Automatically create a full copy of the garage database every week (7 days).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <div className="font-medium text-sm">Weekly Automatic Backup</div>
              <div className="text-xs text-muted-foreground">
                {data?.lastWeeklyBackupAt
                  ? `Last automatic backup: ${formatDate(data.lastWeeklyBackupAt)}`
                  : "No automatic backup recorded yet."}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={data?.weeklyBackupEnabled ?? true}
                onChange={(e) => toggleWeeklyBackupMutation.mutate(e.target.checked)}
                disabled={toggleWeeklyBackupMutation.isPending || isLoading}
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <DatabaseIcon className="size-5 text-primary" />
              <CardTitle>Database Backups</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Create point-in-time database snapshots and download backup files.
            </CardDescription>
          </div>
          <Button
            onClick={() => createBackupMutation.mutate()}
            disabled={createBackupMutation.isPending}
          >
            {createBackupMutation.isPending ? (
              <RefreshCwIcon className="size-4 animate-spin" />
            ) : (
              <DatabaseIcon className="size-4" />
            )}
            Create Backup Now
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <p className="text-sm text-muted-foreground">Loading backups…</p>
          ) : data.backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backups found. Click &quot;Create Backup Now&quot; to generate one.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.backups.map((backup, index) => (
                  <TableRow key={backup.filename}>
                    <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium">{backup.filename}</TableCell>
                    <TableCell>{formatBytes(backup.sizeBytes)}</TableCell>
                    <TableCell>{formatDate(backup.createdAt)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(backup.filename)}
                      >
                        <DownloadIcon className="size-3.5" /> Download
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete ${backup.filename}?`)) {
                            deleteBackupMutation.mutate(backup.filename);
                          }
                        }}
                        disabled={deleteBackupMutation.isPending}
                      >
                        <Trash2Icon className="size-3.5" /> Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
