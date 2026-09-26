#!/usr/bin/env node
/**
 * scripts/make-offline-package.mjs
 *
 * Builds the ready-to-copy offline installer package:
 *
 *     npm run offline:package
 *
 * Output:
 *   dist/quiz-app-v4-offline/   (folder — copy this or the zip to the target PC)
 *   dist/quiz-app-v4-offline.zip
 *
 * On the target machine: double-click setup.bat (Windows) or run ./install.sh
 * (Linux/macOS). Node.js must be installed on the server machine once.
 *
 * What it produces:
 *   - all root files (admin.html, questions-management.js, server.js, the
 *     legacy UI, docs, Docker launcher files, .env.example — NOT .env)
 *   - src/, public/, scripts/, scripts + vendor/
 *     (vendor/offline dependency bundle + bundled mkcert for HTTPS certs)
 *   - prisma/ — ONLY migrations/, schema.prisma, seed.js (no dev/test DB files)
 *   - node_modules/ — a clean lockfile-pure snapshot with the .bundled.marker
 *     (built once with `npm ci --ignore-scripts` and cached in
 *     dist/vendored-node_modules), so setup.bat / install.sh skip npm entirely
 *     on the target machine
 *   - quiz-app-v4-image.tar — a loadable Docker image of the app (best effort:
 *     re-saved from the local `quiz-app-v4:local` image when Docker Engine is
 *     running; otherwise the existing tar in the package is kept as-is)
 *
 * Excluded: .git, certs/, dist/, tests/, .env (secrets), stray reports/SC,
 * DB files under prisma/.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  cpSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const pkg = join(dist, 'quiz-app-v4-offline');
const zipPath = join(dist, 'quiz-app-v4-offline.zip');
const stage = join(dist, '.staging_pkg');
const prev = join(dist, '.prev_pkg');
const nmCache = join(dist, 'vendored-node_modules');

const EXCLUDE = new Set([
  '.git', '.github', '.kilo', '.zcode', 'certs', 'dist',
  'gui-test-screenshots', 'tests', 'node_modules', 'prisma', '.env',
  '.import-staging',
]);
const STRAY_RE = /^report\..+\.json$|^\.prev_pkg$|^\.staging_pkg$/;

function dirSizeMB(p) {
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else total += statSync(f).size;
    }
  };
  walk(p);
  return (total / 1048576).toFixed(1);
}

const npmCmd = process.platform === 'win32' ? 'cmd' : 'npm';
const npmArgs = process.platform === 'win32' ? ['/c', 'npm'] : [];

function runNpm(args, cwd) {
  // npm is a .cmd shim on Windows — it must go through cmd.exe.
  return spawnSync(npmCmd, [...npmArgs, ...args], { cwd, stdio: 'inherit' });
}

console.log('Quiz App — Offline Package Builder');
console.log('==================================');

// ── 1. Vendored node_modules (lockfile-pure, cached) ────────────────────────
let nmSrc = null;
if (existsSync(join(nmCache, 'node_modules', '.bundled.marker'))) {
  nmSrc = join(nmCache, 'node_modules');
} else {
  console.log('\n  Building vendored node_modules (needs npm once — cached afterwards)…');
  const build = join(dist, '.nmbuild');
  rmSync(build, { recursive: true, force: true });
  mkdirSync(build, { recursive: true });
  cpSync(join(root, 'package.json'), join(build, 'package.json'));
  cpSync(join(root, 'package-lock.json'), join(build, 'package-lock.json'));
  const r = runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], build);
  if (r.status !== 0) {
    console.error('\n  [ERROR] npm ci failed. Check internet/npm, then re-run.');
    process.exit(1);
  }
  mkdirSync(nmCache, { recursive: true });
  cpSync(join(build, 'node_modules'), join(nmCache, 'node_modules'), { recursive: true });
  writeFileSync(join(nmCache, 'node_modules', '.bundled.marker'), 'skip npm ci --offline\n');
  rmSync(build, { recursive: true, force: true });
  nmSrc = join(nmCache, 'node_modules');
  console.log(`  Vendored node_modules cached (${dirSizeMB(nmSrc)} MB).`);
}

// ── 2. Stage a fresh copy of the app ────────────────────────────────────────
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

console.log('\n  Copying app files…');
const entries = readdirSync(root, { withFileTypes: true });
for (const e of entries) {
  if (EXCLUDE.has(e.name) || STRAY_RE.test(e.name)) continue;
  cpSync(join(root, e.name), join(stage, e.name), { recursive: true });
}

// prisma: whitelist only — never ship dev/test databases.
mkdirSync(join(stage, 'prisma'), { recursive: true });
cpSync(join(root, 'prisma', 'migrations'), join(stage, 'prisma', 'migrations'), { recursive: true });
cpSync(join(root, 'prisma', 'schema.prisma'), join(stage, 'prisma', 'schema.prisma'));
cpSync(join(root, 'prisma', 'seed.js'), join(stage, 'prisma', 'seed.js'));

console.log(`  - node_modules vendored (${dirSizeMB(nmSrc)} MB)`);

// ── 3. Docker image tar (best effort) ───────────────────────────────────────
const imageTar = join(pkg, 'quiz-app-v4-image.tar');
let dockerOk = false;
try {
  const tags = execFileSync('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000,
  });
  dockerOk = tags.split(/\r?\n/).map((s) => s.trim()).includes('quiz-app-v4:local');
} catch {
  dockerOk = false;
}

if (dockerOk) {
  console.log('  - Docker Engine up — saving image tar…');
  try {
    const tmpTar = join(dist, '.image-tmp.tar');
    execFileSync('docker', ['save', 'quiz-app-v4:local', '-o', tmpTar], {
      stdio: 'inherit', timeout: 600000,
    });
    rmSync(imageTar, { force: true });
    cpSync(tmpTar, imageTar);
    rmSync(tmpTar, { force: true });
    console.log(`  - quiz-app-v4-image.tar saved (${(statSync(imageTar).size / 1048576).toFixed(1)} MB)`);
  } catch (err) {
    console.warn('  [WARN] docker save failed — keeping existing image tar if present.');
  }
}
if (existsSync(imageTar)) {
  console.warn('  [WARN] Reusing existing quiz-app-v4-image.tar — for Docker installs it only');
  console.warn('         reflects the last build where Docker was available; native setup.bat unaffected.');
  cpSync(imageTar, join(stage, 'quiz-app-v4-image.tar'));
} else {
  console.warn('  [WARN] No Docker image tar in package (Docker-only installs will not work).');
}

// ── 4. Assemble node_modules into the stage ─────────────────────────────────
cpSync(nmSrc, join(stage, 'node_modules'), { recursive: true });

// ── 5. Swap into place ──────────────────────────────────────────────────────
rmSync(prev, { recursive: true, force: true });
if (existsSync(pkg)) cpSync(pkg, prev, { recursive: true });
rmSync(pkg, { recursive: true, force: true });
cpSync(stage, pkg, { recursive: true });
rmSync(stage, { recursive: true, force: true });

// ── 6. Zip it (libarchive/bsdtar -a — NOT Compress-Archive) ─────────────────
console.log(`\n  Package folder:  dist/quiz-app-v4-offline  (${dirSizeMB(pkg)} MB)`);
console.log('  Zipping…');
rmSync(zipPath, { force: true });
const tarResult = spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', dist, 'quiz-app-v4-offline'], {
  stdio: 'inherit',
});
if (tarResult.status !== 0) {
  console.error('\n  [ERROR] zip step failed — restoring previous package.');
  rmSync(pkg, { recursive: true, force: true });
  if (existsSync(prev)) cpSync(prev, pkg, { recursive: true });
  rmSync(prev, { recursive: true, force: true });
  process.exit(1);
}
rmSync(prev, { recursive: true, force: true });

console.log(`  dist/quiz-app-v4-offline.zip  (${(statSync(zipPath).size / 1048576).toFixed(1)} MB)`);
console.log('\n  Done. Copy the ZIP (or the folder) to the target machine, unpack,');
console.log('  then double-click setup.bat (Windows) or run ./install.sh (Linux/macOS).');
console.log('  Students open http://<server-ip>:3000  —  login: admin / admin123');
console.log();