/** Forward renderer logs to Electron main process → `%APPDATA%/babuawamirautogarage/app.log` */
export function logToApp(message: string, data?: Record<string, unknown>) {
  const payload = { message, data, at: new Date().toISOString() };
  if (typeof window !== "undefined" && window.electronAPI?.logToApp) {
    void window.electronAPI.logToApp(payload);
    return;
  }
  console.log(`[PRINT] ${message}`, data ?? "");
}

/** Wait for invoice images/fonts before Electron rasterizes the page. */
export async function waitForPrintAssets(timeoutMs = 8000): Promise<{
  readyState: string;
  imageCount: number;
  imagesLoaded: number;
  imagesFailed: string[];
  timedOut: boolean;
}> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const imgs = Array.from(document.images);
    const imagesFailed = imgs
      .filter((img) => img.complete && img.naturalHeight === 0)
      .map((img) => img.src);
    const imagesLoaded = imgs.filter((img) => img.complete && img.naturalHeight > 0).length;

    if (document.readyState === "complete" && imagesFailed.length === 0 && imagesLoaded === imgs.length) {
      return {
        readyState: document.readyState,
        imageCount: imgs.length,
        imagesLoaded,
        imagesFailed,
        timedOut: false,
      };
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  const imgs = Array.from(document.images);
  return {
    readyState: document.readyState,
    imageCount: imgs.length,
    imagesLoaded: imgs.filter((img) => img.complete && img.naturalHeight > 0).length,
    imagesFailed: imgs
      .filter((img) => img.complete && img.naturalHeight === 0)
      .map((img) => img.src),
    timedOut: true,
  };
}
