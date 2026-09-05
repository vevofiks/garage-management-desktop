const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const copyOptions = { recursive: true, dereference: true };

function readElectronVersion(projectDir) {
  const electronPkgPath = path.join(projectDir, 'node_modules/electron/package.json');
  if (!fs.existsSync(electronPkgPath)) {
    throw new Error('Electron package.json not found during afterPack.');
  }
  return require(electronPkgPath).version;
}

function rebuildNativeModulesForElectron(moduleDir, electronVersion) {
  console.log(`[afterPack] Rebuilding native modules for Electron ${electronVersion}...`);
  execSync(
    `npx @electron/rebuild --version ${electronVersion} -f -w better-sqlite3 -m "${moduleDir}"`,
    { stdio: 'inherit', cwd: moduleDir }
  );
}

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

  if (fs.existsSync(standaloneDir)) {
    const electronVersion = readElectronVersion(projectDir);
    rebuildNativeModulesForElectron(standaloneDir, electronVersion);
  }
};
