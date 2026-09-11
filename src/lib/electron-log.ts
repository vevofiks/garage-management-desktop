/** Forward renderer logs to Electron main process → `%APPDATA%/babuawamirautogarage/app.log` */
export function logToApp(message: string, data?: Record<string, unknown>) {
  const payload = { message, data, at: new Date().toISOString() };
  if (typeof window !== "undefined" && window.electronAPI?.logToApp) {
    void window.electronAPI.logToApp(payload);
    return;
  }
  console.log(`[PRINT] ${message}`, data ?? "");
}

/**
 * Wait for the invoice's images and web fonts to settle before the page is printed.
 *
 * Event-driven: each image resolves on `load` OR `error`, because a broken image is still
 * settled. The previous version polled every 100ms and only returned once every image had
 * loaded *successfully* — so one missing file (a 404 logo, say) held every single print
 * for the full timeout, during which a second click fired another job. It also claimed to
 * wait for fonts but never did; `document.fonts.ready` now covers that, so a print can't
 * go out in a fallback font.
 */
export async function waitForPrintAssets(timeoutMs = 8000): Promise<{
  readyState: string;
  imageCount: number;
  imagesLoaded: number;
  imagesFailed: string[];
  bodyTextLength: number;
  timedOut: boolean;
}> {
  const imgs = Array.from(document.images);

  const settled = Promise.all([
    ...imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
    ),
    document.fonts?.ready,
  ]);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    settled.then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), timeoutMs);
    }),
  ]);
  clearTimeout(timer);

  return {
    readyState: document.readyState,
    imageCount: imgs.length,
    imagesLoaded: imgs.filter((img) => img.complete && img.naturalHeight > 0).length,
    imagesFailed: imgs.filter((img) => img.complete && img.naturalHeight === 0).map((img) => img.src),
    // Main process reads this to warn about an empty page instead of probing the DOM itself.
    bodyTextLength: document.body?.innerText.length ?? 0,
    timedOut,
  };
}
