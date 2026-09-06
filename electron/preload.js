/**
 * electron/preload.js
 *
 * Secure bridge between Electron's main process and the Next.js renderer (UI).
 * Use `contextBridge.exposeInMainWorld` here to safely expose specific
 * Electron/Node APIs to the frontend — never enable nodeIntegration.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  logToApp: (payload) => ipcRenderer.invoke('log-to-app', payload),
  printInvoice: (payload) => ipcRenderer.invoke('print-invoice', payload),
  // Route through print-invoice so PDF works even when the dedicated handler
  // hasn't been picked up yet (Electron main doesn't hot-reload in dev).
  downloadInvoice: (payload) =>
    ipcRenderer.invoke('print-invoice', { ...payload, saveAsPdf: true }),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateProgress: (callback) => {
    const handler = (_event, val) => callback(val);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, val) => callback(val);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
});
