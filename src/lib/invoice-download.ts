import { toast } from "sonner";
import { logToApp, waitForPrintAssets } from "@/lib/electron-log";

export type DownloadInvoiceResult = {
  success: boolean;
  error?: string | null;
  canceled?: boolean;
  filePath?: string | null;
};

type ElectronDownloadPayload = {
  defaultFilename: string;
  debugContext: Record<string, unknown>;
};

async function invokeElectronPdfDownload(
  payload: ElectronDownloadPayload
): Promise<DownloadInvoiceResult> {
  // Prefer downloadInvoice (preload routes to print-invoice + saveAsPdf).
  if (window.electronAPI?.downloadInvoice) {
    return window.electronAPI.downloadInvoice(payload) as Promise<DownloadInvoiceResult>;
  }
  // Fallback for older preload builds.
  if (window.electronAPI?.printInvoice) {
    return window.electronAPI.printInvoice({
      ...payload,
      saveAsPdf: true,
    }) as Promise<DownloadInvoiceResult>;
  }
  throw new Error("Electron PDF API unavailable");
}

export async function downloadInvoicePdf(invoiceId: number): Promise<DownloadInvoiceResult> {
  const onPrintPage =
    typeof window !== "undefined" && window.location.pathname.endsWith("/print");

  logToApp("Download button clicked", {
    invoiceId,
    onPrintPage,
    hasElectronAPI: !!window.electronAPI?.downloadInvoice,
  });

  if (window.electronAPI?.downloadInvoice || window.electronAPI?.printInvoice) {
    try {
      if (!onPrintPage) {
        window.location.href = `/invoices/${invoiceId}/print?download=1`;
        return { success: true };
      }

      logToApp("Waiting for print assets before PDF export…");
      const readiness = await waitForPrintAssets();
      logToApp("PDF asset readiness", readiness);

      const payload: ElectronDownloadPayload = {
        defaultFilename: `INV-${invoiceId}.pdf`,
        debugContext: { invoiceId, href: window.location.href },
      };

      const res = await invokeElectronPdfDownload(payload);
      logToApp("PDF download returned", res);

      if (res.canceled) {
        return res;
      }
      if (!res.success) {
        toast.error(res.error || "Failed to save PDF");
        return res;
      }
      toast.success("Invoice saved as PDF");
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logToApp("PDF download threw", { message });

      if (message.includes("No handler registered")) {
        toast.error("Restart the app (npm run dev) to enable PDF download, then try again.");
        return { success: false, error: message };
      }

      toast.error(`Download error: ${message}`);
      return { success: false, error: message };
    }
  }

  if (!onPrintPage) {
    window.location.href = `/invoices/${invoiceId}/print?download=1`;
    return { success: true };
  }

  logToApp("electronAPI unavailable — using window.print() browser fallback for PDF");
  toast.info("Choose 'Save as PDF' in the print dialog");
  window.print();
  return { success: true };
}
