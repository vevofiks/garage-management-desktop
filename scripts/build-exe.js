const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const copyOptions = { recursive: true, dereference: true };

function readElectronVersion() {
  const electronPkgPath = path.join(projectRoot, 'node_modules/electron/package.json');
  if (!fs.existsSync(electronPkgPath)) {
    throw new Error('Electron is not installed. Run npm install before building.');
  }
  return require(electronPkgPath).version;
}

function rebuildNativeModulesForElectron(moduleDir, electronVersion) {
  console.log(`Rebuilding native modules for Electron ${electronVersion} in ${moduleDir}...`);
  execSync(
    `npx @electron/rebuild --version ${electronVersion} -f -w better-sqlite3 -m "${moduleDir}"`,
    { stdio: 'inherit', cwd: projectRoot }
  );
}

function verifyBetterSqlite3Binding(moduleDir) {
  const bindingRoot = path.join(moduleDir, 'node_modules/better-sqlite3');
  if (!fs.existsSync(bindingRoot)) {
    throw new Error('better-sqlite3 was not traced into the standalone bundle.');
  }

  const buildDir = path.join(bindingRoot, 'build/Release');
  if (!fs.existsSync(buildDir)) {
    throw new Error('better-sqlite3 native build output is missing from standalone/node_modules.');
  }

  const nodeFiles = fs.readdirSync(buildDir).filter((name) => name.endsWith('.node'));
  if (nodeFiles.length === 0) {
    throw new Error('No better_sqlite3.node binary found in standalone build output.');
  }

  console.log(`Verified better-sqlite3 binding: ${nodeFiles.join(', ')}`);
}

function warnIfCrossCompilingWindows() {
  const argv = process.argv.join(' ');
  const buildingForWindows = argv.includes('--win') || process.env.npm_config_target_platform === 'win32';
  if (buildingForWindows && process.platform !== 'win32') {
    console.warn('\n*** WARNING ***');
    console.warn('You are building a Windows installer from a non-Windows machine.');
    console.warn('Native modules like better-sqlite3 must be compiled on Windows for the client install to work.');
    console.warn('Login and database APIs will fail with Internal Server Error if the .node binary targets the wrong OS.');
    console.warn('Build the Windows installer on a Windows PC or Windows CI runner instead.\n');
  }
}

console.log('Cleaning build directories...');
const distDir = path.join(projectRoot, 'dist');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}

const nextDir = path.join(projectRoot, '.next');
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
}

warnIfCrossCompilingWindows();

console.log('Building Next.js app...');
execSync('npm run build', { stdio: 'inherit', cwd: projectRoot });

const standaloneDir = path.join(projectRoot, '.next/standalone');
console.log('Copying static assets to standalone folder...');
const publicDir = path.join(projectRoot, 'public');
const staticDir = path.join(projectRoot, '.next/static');

if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standaloneDir, 'public'), copyOptions);
}

if (fs.existsSync(staticDir)) {
  fs.mkdirSync(path.join(standaloneDir, '.next'), { recursive: true });
  fs.cpSync(staticDir, path.join(standaloneDir, '.next/static'), copyOptions);
}

const buildIdFile = path.join(projectRoot, '.next/BUILD_ID');
if (fs.existsSync(buildIdFile)) {
  fs.cpSync(buildIdFile, path.join(standaloneDir, '.next/BUILD_ID'));
}

const envLocalFile = path.join(projectRoot, '.env.local');
if (fs.existsSync(envLocalFile)) {
  fs.copyFileSync(envLocalFile, path.join(standaloneDir, '.env.production'));
  fs.copyFileSync(envLocalFile, path.join(standaloneDir, '.env'));
}

console.log('Ensuring complete Next.js runtime in standalone node_modules...');
const srcNext = path.join(projectRoot, 'node_modules/next');
const destNext = path.join(standaloneDir, 'node_modules/next');
if (fs.existsSync(srcNext)) {
  fs.cpSync(srcNext, destNext, copyOptions);
}

// Fallback: If Next placed server.js in a subfolder, also ensure the root has server.js
if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  const entries = fs.readdirSync(standaloneDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '.next' && entry.name !== 'public') {
      const nestedServer = path.join(standaloneDir, entry.name, 'server.js');
      if (fs.existsSync(nestedServer)) {
        console.log(`Found nested server in ${entry.name}, copying to root standalone directory...`);
        fs.cpSync(path.join(standaloneDir, entry.name), standaloneDir, copyOptions);
        break;
      }
    }
  }
}

if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  console.error('ERROR: server.js was not found in .next/standalone!');
  process.exit(1);
}

const electronVersion = readElectronVersion();
rebuildNativeModulesForElectron(standaloneDir, electronVersion);
verifyBetterSqlite3Binding(standaloneDir);

console.log('Standalone server and assets verified. Ready for electron-builder.');
