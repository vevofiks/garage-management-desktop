export interface PrintInvoicePayload {
  options?: Record<string, unknown>;
  debugContext?: Record<string, unknown>;
  saveAsPdf?: boolean;
  defaultFilename?: string;
}

export interface PrintInvoiceResult {
  success: boolean;
  error?: string | null;
  canceled?: boolean;
  filePath?: string | null;
  elapsedMs?: number;
  printerUsed?: string | null;
  /** True when the direct spooler job failed and the PDF hand-off was used instead. */
  usedFallback?: boolean;
  /** Where the fallback PDF was written, when `usedFallback` is true. */
  fallbackPath?: string | null;
  /** The original direct-print failure that triggered the fallback. */
  directPrintError?: string | null;
}

export interface DownloadInvoicePayload {
  defaultFilename?: string;
  debugContext?: Record<string, unknown>;
}

export interface DownloadInvoiceResult {
  success: boolean;
  error?: string | null;
  canceled?: boolean;
  filePath?: string | null;
  elapsedMs?: number;
}

export interface ElectronAPI {
  logToApp?: (payload: { message: string; data?: Record<string, unknown>; at?: string }) => Promise<void>;
  printInvoice?: (payload?: PrintInvoicePayload) => Promise<PrintInvoiceResult>;
  downloadInvoice?: (payload?: DownloadInvoicePayload) => Promise<DownloadInvoiceResult>;
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
