const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const copyOptions = { recursive: true, dereference: true };

console.log('Cleaning build directories...');
const distDir = path.join(projectRoot, 'dist');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}

const nextDir = path.join(projectRoot, '.next');
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
}

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

console.log('Ensuring prebuilt better-sqlite3 in standalone node_modules...');
const srcBetterSqlite = path.join(projectRoot, 'node_modules/better-sqlite3');
const destBetterSqlite = path.join(standaloneDir, 'node_modules/better-sqlite3');
if (fs.existsSync(srcBetterSqlite)) {
  fs.cpSync(srcBetterSqlite, destBetterSqlite, copyOptions);
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

const bindingPath = path.join(standaloneDir, 'node_modules/better-sqlite3/build/Release');
if (fs.existsSync(bindingPath)) {
  const nodeFiles = fs.readdirSync(bindingPath).filter((f) => f.endsWith('.node'));
  console.log(`Verified native sqlite binding: ${nodeFiles.join(', ')}`);
}

console.log('Standalone server and assets verified. Ready for electron-builder.');
