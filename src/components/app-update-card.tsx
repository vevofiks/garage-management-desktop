"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  SparklesIcon,
  RefreshCwIcon,
  DownloadIcon,
  ArrowUpCircleIcon,
} from "lucide-react";

export function AppUpdateCard() {
  const [currentVersion, setCurrentVersion] = useState<string>("0.1.0");
  const [checking, setChecking] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [newVersion, setNewVersion] = useState<string>("");
  const [isReadyToInstall, setIsReadyToInstall] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    // Read current version from Electron
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI
        .getAppVersion()
        .then((v: string) => {
          if (v) setCurrentVersion(v);
        })
        .catch(() => {});
    }

    // Subscribe to download progress
    let unsubProgress: (() => void) | undefined;
    if (window.electronAPI?.onUpdateProgress) {
      unsubProgress = window.electronAPI.onUpdateProgress((pct: number) => {
        setProgress(pct);
        setDownloading(true);
      });
    }

    // Subscribe to download completion
    let unsubDownloaded: (() => void) | undefined;
    if (window.electronAPI?.onUpdateDownloaded) {
      unsubDownloaded = window.electronAPI.onUpdateDownloaded(() => {
        setDownloading(false);
        setIsReadyToInstall(true);
        toast.success("Update downloaded! Click 'Restart & Install' to apply.");
      });
    }

    return () => {
      if (unsubProgress) unsubProgress();
      if (unsubDownloaded) unsubDownloaded();
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) {
      toast.info("Auto-updater is available in the desktop application.");
      return;
    }

    setChecking(true);
    setStatusMessage("");
    try {
      const res = await window.electronAPI.checkForUpdates();
      if (res?.status === "update-available") {
        setUpdateAvailable(true);
        setNewVersion(res.latestVersion || "Newer version");
        toast.info(`New version ${res.latestVersion} is available to download!`);
      } else if (res?.status === "latest") {
        setUpdateAvailable(false);
        toast.success("You are running the latest version.");
        setStatusMessage("App is up to date.");
      } else if (res?.status === "dev-mode") {
        toast.info("Running in development mode. Updates are checked in packaged builds.");
        setStatusMessage("Development mode");
      } else {
        toast.error(res?.message || "Could not connect to update server.");
        setStatusMessage(res?.message || "Failed to check updates");
      }
    } catch (err: any) {
      toast.error(err.message || "Error checking updates");
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!window.electronAPI?.downloadUpdate) return;
    setDownloading(true);
    setProgress(0);
    try {
      const res = await window.electronAPI.downloadUpdate();
      if (res?.status === "error") {
        setDownloading(false);
        toast.error(res.message || "Download failed");
      }
    } catch (err: any) {
      setDownloading(false);
      toast.error(err.message || "Download failed");
    }
  };

  const handleInstallUpdate = () => {
    if (window.electronAPI?.installUpdate) {
      window.electronAPI.installUpdate();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-primary" />
            <CardTitle>Application Updates</CardTitle>
          </div>
          <CardDescription className="mt-1">
            Check for new releases and install updates with a single click.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            v{currentVersion}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border rounded-lg bg-muted/20">
          <div>
            <div className="text-sm font-medium">
              {isReadyToInstall
                ? "Update Ready to Install"
                : downloading
                ? `Downloading Update (${progress}%)`
                : updateAvailable
                ? `New Version Available: v${newVersion}`
                : "Latest Version Installed"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {isReadyToInstall
                ? "The update is ready. Click restart to apply it immediately."
                : downloading
                ? "Downloading the latest version in the background..."
                : updateAvailable
                ? "A new update with features and bug fixes is ready to download."
                : statusMessage || `Current installed version is v${currentVersion}`}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isReadyToInstall ? (
              <Button
                onClick={handleInstallUpdate}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              >
                <ArrowUpCircleIcon className="size-4" />
                Restart & Apply Update
              </Button>
            ) : downloading ? (
              <Button disabled variant="outline" className="w-full sm:w-auto gap-2">
                <RefreshCwIcon className="size-4 animate-spin text-blue-500" />
                Downloading ({progress}%)
              </Button>
            ) : updateAvailable ? (
              <Button
                onClick={handleDownloadUpdate}
                className="w-full sm:w-auto gap-1.5"
              >
                <DownloadIcon className="size-4" />
                Download Update
              </Button>
            ) : (
              <Button
                onClick={handleCheckForUpdates}
                disabled={checking}
                variant="outline"
                className="w-full sm:w-auto gap-1.5"
              >
                <RefreshCwIcon className={`size-4 ${checking ? "animate-spin" : ""}`} />
                {checking ? "Checking..." : "Check for Updates"}
              </Button>
            )}
          </div>
        </div>

        {downloading && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Downloading update package...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
