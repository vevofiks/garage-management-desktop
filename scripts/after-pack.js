const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  console.log('[afterPack] Checking standalone node_modules in packaged app...');
  const standaloneNodeModules = path.join(context.packager.projectDir, '.next/standalone/node_modules');
  const targetNodeModules = path.join(context.appOutDir, 'resources/standalone/node_modules');

  if (fs.existsSync(standaloneNodeModules)) {
    console.log('[afterPack] Copying standalone node_modules to resources/standalone/node_modules...');
    if (fs.existsSync(targetNodeModules)) {
      fs.rmSync(targetNodeModules, { recursive: true, force: true });
    }
    fs.cpSync(standaloneNodeModules, targetNodeModules, { recursive: true });
    console.log('[afterPack] Successfully copied standalone node_modules.');
  } else {
    console.warn('[afterPack] Warning: .next/standalone/node_modules not found in project directory.');
  }

  const rootNext = path.join(context.packager.projectDir, 'node_modules/next');
  const targetNext = path.join(context.appOutDir, 'resources/standalone/node_modules/next');
  if (fs.existsSync(rootNext)) {
    console.log('[afterPack] Ensuring complete next package in resources/standalone/node_modules/next...');
    fs.cpSync(rootNext, targetNext, { recursive: true });
  }
};
