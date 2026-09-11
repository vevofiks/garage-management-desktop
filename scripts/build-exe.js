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
execSync('npm run build', {
  stdio: 'inherit',
  cwd: projectRoot,
  env: { ...process.env, NEXT_PHASE: 'phase-production-build' },
});

const standaloneDir = path.join(projectRoot, '.next/standalone');

// Never ship a database. Next's output tracing follows db.ts's filesystem access and
// copies whatever sits in ./data into the standalone build — on a developer machine that
// is the live garage.db: every customer, the password hashes and valid session tokens.
// electron/main.js would then install it as the "seed" database on first run.
// next.config.ts excludes ./data from tracing; this strips and checks as a backstop.
const tracedDataDir = path.join(standaloneDir, 'data');
if (fs.existsSync(tracedDataDir)) {
  console.warn('WARNING: removing traced ./data from the standalone build — it must never ship.');
  fs.rmSync(tracedDataDir, { recursive: true, force: true });
}
const findDatabases = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : findDatabases(entryPath);
    return /\.(db|sqlite3?)(-wal|-shm|-journal)?$/i.test(entry.name) ? [entryPath] : [];
  });
const leakedDatabases = findDatabases(standaloneDir);
if (leakedDatabases.length > 0) {
  console.error('ERROR: database files found in the standalone build — refusing to package:');
  leakedDatabases.forEach((dbFile) => console.error('  ' + dbFile));
  process.exit(1);
}
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

// Ship production config only when it is deliberately provided as .env.production.
// .env.local is a developer's machine-local file (it can hold personal tokens) and was
// previously copied in wholesale, embedding it in every installer built on that machine.
// CI never has one, so this also makes local builds match the releases customers get.
const envProductionFile = path.join(projectRoot, '.env.production');
if (fs.existsSync(envProductionFile)) {
  console.log('Including .env.production in standalone build...');
  fs.copyFileSync(envProductionFile, path.join(standaloneDir, '.env.production'));
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

console.log('Ensuring pg and dependencies in standalone node_modules...');
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
  const src = path.join(projectRoot, 'node_modules', pkg);
  const dest = path.join(standaloneDir, 'node_modules', pkg);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, copyOptions);
  }
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
