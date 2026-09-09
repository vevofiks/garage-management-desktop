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

  const pgPackages = [
    'pg',
    'pg-pool',
    'pg-protocol',
    'pg-types',
    'pgpass',
    'pg-cloudflare',
    'pg-connection-string',
    'pg-int8',
    'postgres-array',
    'postgres-bytea',
    'postgres-date',
    'postgres-interval',
  ];
  for (const pkg of pgPackages) {
    const src = path.join(projectDir, 'node_modules', pkg);
    const dest = path.join(targetNodeModules, pkg);
    if (fs.existsSync(src)) {
      console.log(`[afterPack] Ensuring ${pkg} in resources/standalone/node_modules/${pkg}...`);
      fs.cpSync(src, dest, copyOptions);
    }
  }

  console.log('[afterPack] afterPack hook completed successfully.');
};
