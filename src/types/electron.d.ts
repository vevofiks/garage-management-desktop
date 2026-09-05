export interface ElectronAPI {
  printInvoice?: (options?: any) => Promise<{ success: boolean; error?: string | null }>;
  getAppVersion?: () => Promise<string>;
  checkForUpdates?: () => Promise<{
    status: "error" | "dev-mode" | "latest" | "update-available";
    currentVersion?: string;
    latestVersion?: string;
    updateInfo?: any;
    message?: string;
  }>;
  downloadUpdate?: () => Promise<{ status: string; message?: string }>;
  installUpdate?: () => Promise<void> | void;
  onUpdateProgress?: (callback: (percent: number) => void) => () => void;
  onUpdateDownloaded?: (callback: (info: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
