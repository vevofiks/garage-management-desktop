const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

    process.env.APP_DATA_DIR = userDataPath;
    process.env.DATABASE_PATH = dbPath;
    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_RUN_AS_NODE = '1';
    process.env.HOSTNAME = '127.0.0.1';

    const defaultCloudUrl = 'postgresql://neondb_owner:npg_2WfIXydQTn1z@ep-purple-frost-aynhchr1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
    if (!process.env.CLOUD_DATABASE_URL) {
      process.env.CLOUD_DATABASE_URL = defaultCloudUrl;
    }
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgres')) {
      process.env.DATABASE_URL = defaultCloudUrl;
    }

    const port = await getAvailablePort(3000);
    process.env.PORT = String(port);
    log(`Selected port: ${port}`);

    // Ensure Next.js cache directory is inside writable userData (prevents EPERM in Program Files)
    const cacheDir = path.join(userDataPath, '.cache');
    if (!fs.existsSync(cacheDir)) {
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
    }
    process.env.NEXT_CACHE_DIR = cacheDir;

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

    // Standalone Next.js must run with its own cwd and module resolution paths.
    process.chdir(serverDir);
    if (fs.existsSync(standaloneModules)) {
      process.env.NODE_PATH = standaloneModules;
      require('module').Module._initPaths();
    }

    log(`Starting standalone server from: ${serverScript}`);
    log(`Standalone cwd: ${serverDir}`);
    log(`Standalone NODE_PATH: ${process.env.NODE_PATH || '(unset)'}`);

    try {
      // Attach built-in SQLite driver to global so Next.js API routes have guaranteed direct access
      try {
        const sqlite = require('node:sqlite');
        global.__node_sqlite = sqlite;
        log('Built-in node:sqlite driver verified and attached to global.__node_sqlite');
      } catch (_) {
        try {
          require(path.join(standaloneModules, 'better-sqlite3'));
          log('better-sqlite3 native module loaded successfully');
        } catch (sqliteErr) {
          log('WARNING: SQLite driver failed to load:', sqliteErr);
        }
      }

      require(serverScript);
      log('Standalone server module required successfully');
    } catch (err) {
      log('FATAL: Exception while requiring standalone server:', err && err.stack ? err.stack : err);
      dialog.showErrorBox(
        'Server Launch Error',
        'An error occurred while initializing the internal server:\n\n' + ((err && err.message) || String(err)) + '\n\nCheck log: ' + logFilePath
      );
    }

    loadAppUrl(mainWindow, `http://127.0.0.1:${port}`);
  }
}

// Renderer calls window.electronAPI.printInvoice() (exposed via preload.js)
ipcMain.handle('log-to-app', (_event, payload = {}) => {
  const { message, data, at } = payload;
  log(`[PRINT][ui] ${at ? `[${at}] ` : ''}${message || '(no message)'}`, data ? JSON.stringify(data) : '');
});

ipcMain.handle('print-invoice', async (event, payload = {}) => {
  const customOptions = payload.options || {};
  const debugContext = payload.debugContext || {};
  const startedAt = Date.now();

  log('[PRINT] ========== Print job started ==========');
  log('[PRINT] App packaged:', app.isPackaged);
  log('[PRINT] Platform:', process.platform);
  log('[PRINT] Electron:', process.versions.electron, '| Chrome:', process.versions.chrome);
  if (Object.keys(debugContext).length > 0) {
    log('[PRINT] Renderer context:', JSON.stringify(debugContext));
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    log('[PRINT] ERROR: No BrowserWindow found for print request');
    return { success: false, error: 'No active window found', elapsedMs: Date.now() - startedAt };
  }

  const pageUrl = win.webContents.getURL();
  log('[PRINT] Window URL:', pageUrl);
  log('[PRINT] Window title:', win.webContents.getTitle());
  log('[PRINT] Page isLoading:', win.webContents.isLoading());
  log('[PRINT] Page isLoadingMainFrame:', win.webContents.isLoadingMainFrame());

  try {
    const readiness = await win.webContents.executeJavaScript(`({
      readyState: document.readyState,
      title: document.title,
      imageCount: document.images.length,
      imagesLoaded: Array.from(document.images).filter(i => i.complete && i.naturalHeight > 0).length,
      imagesFailed: Array.from(document.images).filter(i => i.complete && i.naturalHeight === 0).map(i => i.src),
      bodyTextLength: document.body ? document.body.innerText.length : 0,
    })`, true);
    log('[PRINT] Main-process page snapshot:', JSON.stringify(readiness));
    if (readiness.imagesFailed?.length) {
      log('[PRINT] WARNING: Broken image(s) on page — print raster may fail or hang:', readiness.imagesFailed.join(', '));
    }
    if (readiness.bodyTextLength === 0) {
      log('[PRINT] WARNING: Page body appears empty — invoice may not have rendered yet');
    }
  } catch (err) {
    log('[PRINT] Could not read page snapshot:', err && err.message);
  }

  let printers = [];
  try {
    printers = await win.webContents.getPrintersAsync();
    if (printers.length === 0) {
      log('[PRINT] WARNING: No printers detected by Electron');
    } else {
      for (const p of printers) {
        log(
          '[PRINT] Printer:',
          JSON.stringify({
            name: p.name,
            isDefault: p.isDefault,
            status: p.status,
            description: p.description,
            displayName: p.displayName,
            options: p.options,
          })
        );
      }
    }
  } catch (err) {
    log('[PRINT] ERROR: Failed to enumerate printers:', err && err.stack ? err.stack : err);
  }

  // GUSTEC GT1122n is a monochrome direct-thermal A4 printer — forcing grayscale keeps the
  // rasterized job small. A full-color job (the invoice has red banners) has been observed
  // getting stuck at "Spooling" forever in the Windows print queue on this printer's driver.
  const matchedPrinter = printers.find((p) => /gustec|gt1122/i.test(p.name));
  const defaultPrinter = printers.find((p) => p.isDefault);

  if (matchedPrinter) {
    log('[PRINT] Matched GUSTEC/GT1122 printer:', matchedPrinter.name);
  } else {
    log(
      '[PRINT] No GUSTEC/GT1122 name match — using default printer',
      defaultPrinter ? defaultPrinter.name : '(none — Windows will prompt)'
    );
  }

  const printOptions = {
    silent: false,
    printBackground: true,
    color: false,
    pageSize: 'A4',
    margins: { marginType: 'none' },
    ...(matchedPrinter ? { deviceName: matchedPrinter.name } : {}),
    ...customOptions,
  };

  log('[PRINT] Calling webContents.print() with options:', JSON.stringify(printOptions));

  return new Promise((resolve) => {
    let settled = false;
    const timeoutMs = 60000;
    const printStartedAt = Date.now();

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      const elapsedMs = Date.now() - startedAt;
      log(
        `[PRINT] TIMEOUT after ${timeoutMs}ms — webContents.print() callback never fired. ` +
          'Job may be stuck at "Spooling" in Windows. Try: Printer Properties → Advanced → ' +
          '"Print directly to the printer", clear the print queue, or reinstall the driver.'
      );
      resolve({
        success: false,
        error: 'Print job timed out. Check the printer connection and the Windows print queue.',
        elapsedMs,
        printerUsed: printOptions.deviceName || defaultPrinter?.name || null,
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
          printerUsed: printOptions.deviceName || defaultPrinter?.name || null,
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
        printerUsed: printOptions.deviceName || defaultPrinter?.name || null,
      });
    }
  });
});

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

