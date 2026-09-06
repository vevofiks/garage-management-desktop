export interface PrintInvoicePayload {
  options?: Record<string, unknown>;
  debugContext?: Record<string, unknown>;
}

export interface PrintInvoiceResult {
  success: boolean;
  error?: string | null;
  elapsedMs?: number;
  printerUsed?: string | null;
}

export interface ElectronAPI {
  logToApp?: (payload: { message: string; data?: Record<string, unknown>; at?: string }) => Promise<void>;
  printInvoice?: (payload?: PrintInvoicePayload) => Promise<PrintInvoiceResult>;
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
