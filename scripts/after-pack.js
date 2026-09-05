const fs = require('fs');
const path = require('path');

const copyOptions = { recursive: true, dereference: true };

exports.default = async function (context) {
  console.log('[afterPack] Checking standalone node_modules in packaged app...');
  const projectDir = context.packager.projectDir;
  const standaloneNodeModules = path.join(projectDir, '.next/standalone/node_modules');
  const standaloneDir = path.join(context.appOutDir, 'resources/standalone');
  const targetNodeModules = path.join(standaloneDir, 'node_modules');

  if (fs.existsSync(standaloneNodeModules)) {
    console.log('[afterPack] Copying standalone node_modules to resources/standalone/node_modules...');
    if (fs.existsSync(targetNodeModules)) {
      fs.rmSync(targetNodeModules, { recursive: true, force: true });
    }
    fs.cpSync(standaloneNodeModules, targetNodeModules, copyOptions);
    console.log('[afterPack] Successfully copied standalone node_modules.');
  } else {
    console.warn('[afterPack] Warning: .next/standalone/node_modules not found in project directory.');
  }

  const rootNext = path.join(projectDir, 'node_modules/next');
  const targetNext = path.join(targetNodeModules, 'next');
  if (fs.existsSync(rootNext)) {
    console.log('[afterPack] Ensuring complete next package in resources/standalone/node_modules/next...');
    fs.cpSync(rootNext, targetNext, copyOptions);
  }

  const rootBetterSqlite = path.join(projectDir, 'node_modules/better-sqlite3');
  const targetBetterSqlite = path.join(targetNodeModules, 'better-sqlite3');
  if (fs.existsSync(rootBetterSqlite)) {
    console.log('[afterPack] Ensuring prebuilt better-sqlite3 in resources/standalone/node_modules/better-sqlite3...');
    fs.cpSync(rootBetterSqlite, targetBetterSqlite, copyOptions);
  }

  // If compiler tools exist (e.g. GitHub Actions runner), rebuild better-sqlite3 for Electron ABI
  try {
    const electronPkgPath = path.join(projectDir, 'node_modules/electron/package.json');
    if (fs.existsSync(electronPkgPath) && fs.existsSync(standaloneDir)) {
      const electronVersion = require(electronPkgPath).version;
      const { execSync } = require('child_process');
      console.log(`[afterPack] Attempting native compilation of better-sqlite3 for Electron ${electronVersion}...`);
      execSync(
        `npx @electron/rebuild --version ${electronVersion} -f -w better-sqlite3 -m "${standaloneDir}"`,
        { stdio: 'inherit', cwd: standaloneDir }
      );
      console.log('[afterPack] Successfully rebuilt native module for Electron!');
    }
  } catch (_) {
    console.warn('[afterPack] Native rebuild skipped (compiler not available); app will use built-in node:sqlite driver.');
  }

  console.log('[afterPack] afterPack hook completed successfully.');
};
