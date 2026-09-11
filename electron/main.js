const { app, BrowserWindow, ipcMain, dialog, shell, utilityProcess } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const net = require('net');

// Office PCs frequently run old/integrated GPU drivers that crash or hang Chromium's GPU
// process silently. Chromium's print pipeline rasterizes pages through that same GPU
// compositor, so a flaky GPU driver on a client machine can leave a print job stuck at
// "Spooling" forever even though the exact same code prints fine on a dev machine with a
// healthier GPU. Must be called before app is ready.
app.disableHardwareAcceleration();

let mainWindow = null;
let logFilePath = null;
// The Next.js standalone server, running in its own utility process (production only).
let serverProcess = null;
let serverUrl = null;

function formatArg(a) {
  if (a instanceof Error || (a && typeof a === 'object' && a.stack)) {
    return a.stack || a.message || String(a);
  }
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a, null, 2);
    } catch (_) {
      return String(a);
    }
  }
  return a;
}

function log(...args) {
  const msg = `[${new Date().toISOString()}] ` + args.map(formatArg).join(' ');
  process.stdout.write(msg + '\n');
  if (!logFilePath) {
    try {
      const logDir = app.getPath('userData');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      logFilePath = path.join(logDir, 'app.log');
    } catch (_) {}
  }
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, msg + '\n');
    } catch (_) {}
  }
}

console.log = (...args) => log(...args);
console.error = (...args) => log('[ERROR]', ...args);

// Catch uncaught exceptions
process.on('uncaughtException', (err) => {
  log('Uncaught Exception in Main Process:', err && err.stack ? err.stack : err);
  if (!app.isPackaged) {
    dialog.showErrorBox('Main Process Error', (err && err.message) || String(err));
  }
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const isDev = !app.isPackaged;

function getIconPath() {
  const candidates = [
    path.join(__dirname, '../public/app-logo.png'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked/.next/standalone/public/app-logo.png'),
    path.join(process.resourcesPath || '', 'public/app-logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function findStandaloneServer() {
  const resourcesDir = process.resourcesPath || path.join(__dirname, '../..');
  const candidates = [
    path.join(resourcesDir, 'standalone/server.js'),
    path.join(resourcesDir, 'app.asar.unpacked/.next/standalone/server.js'),
    path.join(__dirname, '../../app.asar.unpacked/.next/standalone/server.js'),
    path.join(resourcesDir, 'app.asar.unpacked/.next/standalone/babuawamir/server.js'),
    path.join(__dirname, '../.next/standalone/server.js'),
    path.join(resourcesDir, 'app/.next/standalone/server.js')
  ];
  for (const candidate of candidates) {
    log('Checking candidate server path:', candidate);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getAvailablePort(preferredPort = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      const fallback = net.createServer();
      fallback.once('error', () => resolve(3000));
      fallback.listen(0, '127.0.0.1', () => {
        const port = fallback.address().port;
        fallback.close(() => resolve(port));
      });
    });
    server.listen(preferredPort, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function loadAppUrl(win, url) {
  let attempts = 0;
  const maxAttempts = 100; // Up to 30 seconds
  const poll = () => {
    attempts++;
    http.get(url, (res) => {
      res.resume(); // drain the probe response so its socket is released
      log(`Server responded at ${url} with status ${res.statusCode}. Loading in window...`);
      win.loadURL(url);
    }).on('error', (err) => {
      if (attempts < maxAttempts) {
        setTimeout(poll, 300);
      } else {
        log(`Failed to connect to ${url} after ${maxAttempts} attempts:`, err ? err.message : '');
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Startup Failed</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; max-width: 500px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                h1 { font-size: 1.5rem; color: #ef4444; margin-bottom: 1rem; }
                p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem; }
                button { background: #2563eb; color: #fff; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
                button:hover { background: #1d4ed8; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>Application Failed to Start</h1>
                <p>The local service did not respond in time. Please verify that the application has permissions to run on this machine or check the log file at:<br><br><code>${logFilePath || 'AppData/Roaming/garage-management-system/app.log'}</code></p>
                <button onclick="window.location.reload()">Retry Connection</button>
              </div>
            </body>
          </html>
        `;
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
        dialog.showErrorBox(
          'Application Error',
          `The internal server failed to start.\n\nPlease check the log file:\n${logFilePath || 'app.log'}`
        );
      }
    });
  };
  poll();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const splashHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Garage Management System</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; user-select: none; }
          .spinner { width: 44px; height: 44px; border: 4px solid #1e293b; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 0.9s linear infinite; margin: 0 auto 1.25rem; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          h2 { font-size: 1.25rem; font-weight: 600; color: #f1f5f9; margin: 0; }
          p { color: #94a3b8; font-size: 0.875rem; margin-top: 0.5rem; }
        </style>
      </head>
      <body>
        <div style="text-align: center;">
          <div class="spinner"></div>
          <h2>Garage Management System</h2>
          <p>Starting local services, please wait...</p>
        </div>
      </body>
    </html>
  `;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);

  if (isDev) {
    log('Running in DEVELOPMENT mode');
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    log('Running in PRODUCTION mode');
    if (serverProcess && serverUrl) {
      // macOS re-opens a window from the dock while the server is still running —
      // point the new window at it instead of starting a second server.
      loadAppUrl(mainWindow, serverUrl);
      return;
    }
    const userDataPath = app.getPath('userData');
    log('User Data Path:', userDataPath);
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    const dbDir = path.join(userDataPath, 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'garage.db');

    // If an initial seed database exists and user db does not, copy it to user storage
    const seedCandidates = [
      path.join(process.resourcesPath || '', 'standalone/data/garage.db'),
      path.join(__dirname, '../data/garage.db'),
      path.join(__dirname, '../../data/garage.db')
    ];
    if (!fs.existsSync(dbPath)) {
      for (const sc of seedCandidates) {
        if (fs.existsSync(sc)) {
          try {
            fs.copyFileSync(sc, dbPath);
            log('Copied initial seed database to:', dbPath);
            break;
          } catch (e) {
            log('Failed to copy seed database:', e);
          }
        }
      }
    }

    const defaultCloudUrl = 'postgresql://neondb_owner:npg_2WfIXydQTn1z@ep-purple-frost-aynhchr1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
    if (!process.env.CLOUD_DATABASE_URL) {
      process.env.CLOUD_DATABASE_URL = defaultCloudUrl;
    }
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgres')) {
      process.env.DATABASE_URL = defaultCloudUrl;
    }

    const port = await getAvailablePort(3000);
    log(`Selected port: ${port}`);

    // Ensure Next.js cache directory is inside writable userData (prevents EPERM in Program Files)
    const cacheDir = path.join(userDataPath, '.cache');
    if (!fs.existsSync(cacheDir)) {
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
    }

    const serverScript = findStandaloneServer();
    if (!serverScript) {
      log('CRITICAL: Standalone server.js could not be found!');
      dialog.showErrorBox(
        'Startup Error',
        'Could not locate the standalone application server files.\nPlease check the log file at:\n' + logFilePath
      );
      mainWindow.show();
      return;
    }

    const serverDir = path.dirname(serverScript);
    const standaloneModules = path.join(serverDir, 'node_modules');

    // The Next.js server runs in its own utility process, never inside this one.
    //
    // It used to be require()d straight into the Electron main process. That put every
    // HTTP request and every synchronous SQLite query on the same thread as Chromium's
    // UI and print pipeline, so anything that blocked that thread during printing — the
    // native print dialog, a slow driver, a stuck spooler — froze the backend with it and
    // the whole app locked up. Measured against a 5s main-thread block: the in-process
    // server answered a request after 4.00s; a utilityProcess server answered in 0.01s.
    // Running `server.js` as its own process is also how Next documents standalone output.
    const serverEnv = {
      ...process.env,
      APP_DATA_DIR: userDataPath,
      DATABASE_PATH: dbPath,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NEXT_CACHE_DIR: cacheDir,
      ...(fs.existsSync(standaloneModules) ? { NODE_PATH: standaloneModules } : {}),
    };
    // A utility process is already a Node environment; this flag must not leak into it.
    delete serverEnv.ELECTRON_RUN_AS_NODE;

    log(`Starting standalone server in a utility process: ${serverScript}`);
    log(`Standalone cwd: ${serverDir}`);

    try {
      serverProcess = utilityProcess.fork(serverScript, [], {
        cwd: serverDir,
        env: serverEnv,
        stdio: 'pipe',
        serviceName: 'Garage App Server',
      });

      // The server's own console output (DB init, API errors) still lands in app.log.
      const pipeServerOutput = (stream, tag) => {
        if (!stream) return;
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          for (const line of chunk.split(/\r?\n/)) {
            if (line) log(`[SERVER${tag}] ${line}`);
          }
        });
      };
      pipeServerOutput(serverProcess.stdout, '');
      pipeServerOutput(serverProcess.stderr, ':err');

      serverProcess.on('spawn', () => log(`Server process started (pid ${serverProcess.pid})`));
      serverProcess.on('exit', (code) => {
        log(`Server process exited with code ${code}`);
        serverProcess = null;
        serverUrl = null;
      });
    } catch (err) {
      log('FATAL: Could not start the standalone server process:', err && err.stack ? err.stack : err);
      dialog.showErrorBox(
        'Server Launch Error',
        'An error occurred while starting the internal server:\n\n' + ((err && err.message) || String(err)) + '\n\nCheck log: ' + logFilePath
      );
    }

    serverUrl = `http://127.0.0.1:${port}`;
    loadAppUrl(mainWindow, serverUrl);
  }
}

// Renderer calls window.electronAPI.printInvoice() (exposed via preload.js)
ipcMain.handle('log-to-app', (_event, payload = {}) => {
  const { message, data, at } = payload;
  log(`[PRINT][ui] ${at ? `[${at}] ` : ''}${message || '(no message)'}`, data ? JSON.stringify(data) : '');
});

async function saveInvoiceAsPdf(win, defaultFilename, startedAt, debugContext = {}) {
  log('[DOWNLOAD] ========== PDF export started ==========');
  if (Object.keys(debugContext).length > 0) {
    log('[DOWNLOAD] Renderer context:', JSON.stringify(debugContext));
  }

  try {
    // preferCSSPageSize lets the sheet's own `@page` rule decide the paper, so the
    // exported PDF matches what the printer path produces on every platform.
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultFilename,
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) {
      log('[DOWNLOAD] Save dialog canceled');
      return { success: false, canceled: true, error: 'Save canceled', elapsedMs: Date.now() - startedAt };
    }

    await fs.promises.writeFile(filePath, pdfData);
    log('[DOWNLOAD] Invoice PDF saved:', filePath);
    log('[DOWNLOAD] ========== PDF export finished ==========');
    return { success: true, filePath, elapsedMs: Date.now() - startedAt };
  } catch (err) {
    log('[DOWNLOAD] ERROR:', err && err.stack ? err.stack : err);
    return {
      success: false,
      error: (err && err.message) || String(err),
      elapsedMs: Date.now() - startedAt,
    };
  }
}

// One print or PDF operation per window at a time. Chromium does not support overlapping
// print operations on one WebContents, and a second click while the first dialog or spool
// was still open used to stack another job on top of it — compounding any freeze.
const printJobsInFlight = new Set();

async function withPrintLock(webContents, job) {
  const key = webContents.id;
  if (printJobsInFlight.has(key)) {
    log('[PRINT] Rejected: a print job is already in progress for this window');
    return { success: false, error: 'A print job is already in progress' };
  }
  printJobsInFlight.add(key);
  try {
    return await job();
  } finally {
    printJobsInFlight.delete(key);
  }
}

/**
 * Logs the installed printers to app.log. Called only AFTER a job has been handed off and
 * never awaited — enumeration queries every installed driver, which on Windows can take
 * seconds for an offline or misconfigured printer, and printing doesn't need any of it.
 */
async function logPrinterInventory(win) {
  try {
    if (win.isDestroyed()) return;
    const printers = await win.webContents.getPrintersAsync();
    if (printers.length === 0) {
      log('[PRINT] Printer inventory: none detected');
      return;
    }
    for (const p of printers) {
      log(
        '[PRINT] Printer inventory:',
        JSON.stringify({ name: p.name, displayName: p.displayName, isDefault: p.isDefault, status: p.status })
      );
    }
  } catch (err) {
    log('[PRINT] Printer inventory failed:', err && err.message);
  }
}

/** Chromium words a dismissed print dialog differently per platform. */
function isUserCancel(reason) {
  return typeof reason === 'string' && /cancel/i.test(reason);
}

/**
 * Last-resort print route, used when the direct spooler job fails or never returns.
 *
 * Renders the same page to a PDF and opens it in whatever the OS registers as the
 * default PDF handler, so the operator can print from there. `shell.openPath` is the
 * cross-platform door — Windows, macOS and Linux all resolve it — which makes this the
 * one path that does not depend on the printer driver behaving during rasterization.
 */
async function printViaPdfFallback(win, reason) {
  log('[PRINT] Direct print did not complete —', reason);
  log('[PRINT] Falling back to PDF hand-off via the OS default PDF viewer…');
  try {
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      // Honour the sheet's own @page rules rather than re-imposing a paper size.
      preferCSSPageSize: true,
    });

    const outPath = path.join(app.getPath('temp'), `invoice-${Date.now()}.pdf`);
    await fs.promises.writeFile(outPath, pdfData);
    log('[PRINT] Fallback PDF written:', outPath, `(${pdfData.length} bytes)`);

    const openError = await shell.openPath(outPath); // '' means it opened
    if (openError) {
      log('[PRINT] Fallback: OS could not open the PDF:', openError);
      return {
        success: false,
        usedFallback: true,
        fallbackPath: outPath,
        error: `Printing failed and the PDF viewer could not be opened. The invoice was saved to ${outPath}`,
      };
    }

    log('[PRINT] Fallback: PDF opened in the OS default viewer — operator prints from there');
    return {
      success: true,
      usedFallback: true,
      fallbackPath: outPath,
      error: null,
    };
  } catch (err) {
    log('[PRINT] Fallback FAILED:', err && err.stack ? err.stack : err);
    return {
      success: false,
      usedFallback: true,
      error: `Printing failed (${reason}) and the PDF fallback also failed: ${(err && err.message) || String(err)}`,
    };
  }
}

async function runPrintJob(event, payload = {}) {
  const customOptions = payload.options || {};
  const debugContext = payload.debugContext || {};
  const startedAt = Date.now();

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    log('[PRINT] ERROR: No BrowserWindow found for print request');
    return { success: false, error: 'No active window found', elapsedMs: Date.now() - startedAt };
  }

  if (payload.saveAsPdf) {
    return saveInvoiceAsPdf(
      win,
      payload.defaultFilename || 'invoice.pdf',
      startedAt,
      debugContext
    );
  }

  log('[PRINT] ========== Print job started ==========');
  log('[PRINT] App packaged:', app.isPackaged);
  log('[PRINT] Platform:', process.platform);
  log('[PRINT] Electron:', process.versions.electron, '| Chrome:', process.versions.chrome);
  if (Object.keys(debugContext).length > 0) {
    log('[PRINT] Renderer context:', JSON.stringify(debugContext));
  }

  const pageUrl = win.webContents.getURL();
  log('[PRINT] Window URL:', pageUrl);
  log('[PRINT] Window title:', win.webContents.getTitle());
  log('[PRINT] Page isLoading:', win.webContents.isLoading());
  log('[PRINT] Page isLoadingMainFrame:', win.webContents.isLoadingMainFrame());

  // No executeJavaScript probe and no printer enumeration on this path any more.
  //
  // The renderer already waits for images and fonts and measures the page before it
  // calls in (waitForPrintAssets), and sends that snapshot as debugContext — a second
  // round trip into the page here only delayed the job. Printer enumeration was worse:
  // getPrintersAsync() queries every installed driver, which on Windows can take
  // seconds when a printer is offline or misconfigured, and it ran before every print
  // purely to feed the log. It now runs after the job instead (logPrinterInventory).
  if (debugContext.bodyTextLength === 0) {
    log('[PRINT] WARNING: Page body appears empty — invoice may not have rendered yet');
  }
  if (Array.isArray(debugContext.imagesFailed) && debugContext.imagesFailed.length > 0) {
    log('[PRINT] WARNING: Broken image(s) on page:', debugContext.imagesFailed.join(', '));
  }

  // Page size, colour mode, margins and deviceName are all deliberately left alone.
  //
  // Every one of them writes into the driver's DEVMODE, and a value the driver can't
  // satisfy is a classic cause of a job that reaches the queue and then sits at
  // "Spooling" forever without ever rasterizing. An earlier revision forced
  // `pageSize: 'A4'`, `margins: { marginType: 'none' }` and `color: false` at once,
  // which is the maximum amount of DEVMODE interference possible.
  //
  // `usePrinterDefaultPageSize` instead keeps whatever paper the selected printer
  // actually reports — A4, Letter or a roll — and Electron falls back to A4 by itself
  // if the driver can't be queried. The invoice sheet is laid out at 210mm x 273mm,
  // which fits inside both A4 (210x297) and US Letter (216x279), so the same document
  // comes out correct on either without the driver having to scale it.
  //
  // `deviceName` must be an exact OS-level printer name, so hard-coding one model
  // makes the call fail on every other machine and every other OS. With `silent: false`
  // the native dialog already preselects the system default and lets the operator
  // choose. A caller can still pass an explicit deviceName through `payload.options`.
  const printOptions = {
    silent: false,
    printBackground: true,
    usePrinterDefaultPageSize: true,
    ...customOptions,
  };

  // Electron rejects usePrinterDefaultPageSize and pageSize together — an explicit
  // pageSize from the caller wins.
  if (printOptions.pageSize) {
    delete printOptions.usePrinterDefaultPageSize;
  }

  log('[PRINT] Calling webContents.print() with options:', JSON.stringify(printOptions));

  const directResult = await new Promise((resolve) => {
    let settled = false;
    const timeoutMs = 60000;
    const printStartedAt = Date.now();

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      const elapsedMs = Date.now() - startedAt;
      log(
        `[PRINT] TIMEOUT after ${timeoutMs}ms — webContents.print() callback never fired. ` +
          'The job is likely stuck in the print queue (Windows: "Spooling"; macOS/Linux: ' +
          'held in CUPS). Falling back to the PDF hand-off.'
      );
      resolve({
        success: false,
        error: 'Print job timed out waiting for the printer.',
        elapsedMs,
        printerUsed: printOptions.deviceName || null,
      });
    }, timeoutMs);

    try {
      win.webContents.print(printOptions, (success, failureReason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const callbackMs = Date.now() - printStartedAt;
        const elapsedMs = Date.now() - startedAt;
        log(
          `[PRINT] webContents.print() callback after ${callbackMs}ms — success=${success}, ` +
            `failureReason=${failureReason || 'none'}, totalElapsed=${elapsedMs}ms`
        );
        log('[PRINT] ========== Print job finished ==========');
        resolve({
          success,
          error: failureReason || null,
          elapsedMs,
          printerUsed: printOptions.deviceName || null,
        });
      });
      log('[PRINT] webContents.print() invoked — waiting for dialog and spooler…');
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      log('[PRINT] ERROR: webContents.print() threw:', err && err.stack ? err.stack : err);
      resolve({
        success: false,
        error: (err && err.message) || String(err),
        elapsedMs: Date.now() - startedAt,
        printerUsed: printOptions.deviceName || null,
      });
    }
  });

  // Diagnostics only — runs after the job was handed off, and is never awaited.
  void logPrinterInventory(win);

  // A user who closes the dialog meant to stop; anything else is a real failure and
  // gets the PDF hand-off so the invoice can still be printed.
  if (directResult.success || isUserCancel(directResult.error)) {
    return directResult;
  }

  const fallback = await printViaPdfFallback(win, directResult.error || 'direct print failed');
  return { ...directResult, ...fallback, directPrintError: directResult.error };
}

ipcMain.handle('print-invoice', (event, payload = {}) =>
  withPrintLock(event.sender, () => runPrintJob(event, payload))
);

ipcMain.handle('download-invoice', (event, payload = {}) =>
  withPrintLock(event.sender, () => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { success: false, error: 'No active window found', elapsedMs: 0 };
    }
    return saveInvoiceAsPdf(
      win,
      payload.defaultFilename || 'invoice.pdf',
      Date.now(),
      payload.debugContext || {}
    );
  })
);

// Auto-updater setup and IPC Handlers
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-progress', Math.round(progressObj.percent || 0));
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info);
  });
} catch (e) {
  log('AutoUpdater setup warning:', e.message);
}

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return { status: 'dev-mode', currentVersion: app.getVersion(), message: 'Running in development mode.' };
  }
  if (!autoUpdater) {
    return { status: 'error', currentVersion: app.getVersion(), message: 'Auto-updater is not configured.' };
  }
  try {
    const res = await autoUpdater.checkForUpdates();
    if (res && res.updateInfo) {
      const isNewer = res.updateInfo.version !== app.getVersion();
      return {
        status: isNewer ? 'update-available' : 'latest',
        currentVersion: app.getVersion(),
        latestVersion: res.updateInfo.version,
        updateInfo: res.updateInfo,
      };
    }
    return { status: 'latest', currentVersion: app.getVersion() };
  } catch (err) {
    log('Check for updates error:', err && err.message);
    return { status: 'error', currentVersion: app.getVersion(), message: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  if (!autoUpdater) return { status: 'error', message: 'Auto-updater not available' };
  try {
    await autoUpdater.downloadUpdate();
    return { status: 'downloading' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
});

ipcMain.handle('install-update', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall();
  }
});

app.whenReady().then(createWindow);

// The server is its own process now, so stop it explicitly instead of trusting the OS to
// reap it — an orphaned server would keep holding its port and the SQLite database.
app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

