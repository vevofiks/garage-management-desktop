export interface ElectronAPI {
  printInvoice?: () => Promise<void> | void;
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
