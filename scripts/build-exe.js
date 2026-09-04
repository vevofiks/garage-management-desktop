const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Cleaning build directories...');
const distDir = path.join(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}

const nextDir = path.join(__dirname, '../.next');
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
}

console.log('Building Next.js app...');
execSync('npm run build', { stdio: 'inherit' });

const standaloneDir = path.join(__dirname, '../.next/standalone');
console.log('Copying static assets to standalone folder...');
const publicDir = path.join(__dirname, '../public');
const staticDir = path.join(__dirname, '../.next/static');

if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standaloneDir, 'public'), { recursive: true });
}

if (fs.existsSync(staticDir)) {
  fs.mkdirSync(path.join(standaloneDir, '.next'), { recursive: true });
  fs.cpSync(staticDir, path.join(standaloneDir, '.next/static'), { recursive: true });
}

const buildIdFile = path.join(__dirname, '../.next/BUILD_ID');
if (fs.existsSync(buildIdFile)) {
  fs.cpSync(buildIdFile, path.join(standaloneDir, '.next/BUILD_ID'));
}

const envLocalFile = path.join(__dirname, '../.env.local');
if (fs.existsSync(envLocalFile)) {
  fs.copyFileSync(envLocalFile, path.join(standaloneDir, '.env.production'));
  fs.copyFileSync(envLocalFile, path.join(standaloneDir, '.env'));
}

console.log('Ensuring complete Next.js runtime in standalone node_modules...');
const srcNext = path.join(__dirname, '../node_modules/next');
const destNext = path.join(standaloneDir, 'node_modules/next');
if (fs.existsSync(srcNext)) {
  fs.cpSync(srcNext, destNext, { recursive: true });
}

// Fallback: If Next placed server.js in a subfolder, also ensure the root has server.js
if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  const entries = fs.readdirSync(standaloneDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '.next' && entry.name !== 'public') {
      const nestedServer = path.join(standaloneDir, entry.name, 'server.js');
      if (fs.existsSync(nestedServer)) {
        console.log(`Found nested server in ${entry.name}, copying to root standalone directory...`);
        fs.cpSync(path.join(standaloneDir, entry.name), standaloneDir, { recursive: true });
        break;
      }
    }
  }
}

if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  console.error('ERROR: server.js was not found in .next/standalone!');
  process.exit(1);
}

console.log('Standalone server and assets verified. Ready for electron-builder.');

