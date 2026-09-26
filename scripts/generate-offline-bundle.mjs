#!/usr/bin/env node
/**
 * generate-offline-bundle.mjs
 *
 * One-time setup tool. Run this ONLY on a machine that HAS internet:
 *
 *     node scripts/generate-offline-bundle.mjs
 *
 * It downloads every dependency of the project — the full tree pinned in
 * package-lock.json (production AND development packages) — as npm tarballs
 * into vendor/offline/packages/, snapshots the Prisma engine binaries for the
 * current OS into vendor/offline/prisma-engines/<platform>-<arch>/, and writes
 * vendor/offline/manifest.json (the complete dependency list).
 *
 * Then copy the app folder together with vendor/offline/ to the offline
 * machine and run setup.bat (Windows) or ./install.sh (Linux/macOS). The
 * installer detects the bundle, seeds the local npm cache from it, and runs
 * `npm ci --offline` — no registry access required.
 *
 * Notes:
 *  - The Prisma engines are platform-specific, so generate one bundle per OS
 *    (re-run this script once on each different OS you need).
 *  - bcrypt ships prebuilt binaries for every platform inside its package, so
 *    no extra step is needed for it.
 *  - vite/esbuild style build tools resolve their platform binary through npm
 *    optionalDependencies, which are part of the lockfile and therefore part
 *    of this bundle.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  cpSync,
} from 'node:fs';
import { join, relative, dirname } from 'node:path';

const root = process.cwd();
const offlineDir = join(root, 'vendor', 'offline');
const packsDir = join(offlineDir, 'packages');
const plat = `${process.platform}-${process.arch}`;
const platEnginesDir = join(offlineDir, 'prisma-engines', plat);

// npm.cmd cannot be spawned directly via spawnSync on Windows, so we invoke
// npm through its JS entrypoint with `node` — this is shell-independent and
// works the same on every OS.
const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

function run(cmd, args, capture = false) {
  const res = spawnSync(cmd, args, {
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`command failed (exit ${res.status}): ${cmd} ${args.join(' ')}`);
  }
  return capture ? res.stdout.trim() : '';
}

function npm(args, capture = false) {
  const cmd = existsSync(npmCli) ? 'node' : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const cmdArgs = existsSync(npmCli) ? [npmCli, ...args] : args;
  return run(cmd, cmdArgs, capture);
}

// ── 1. Read the lockfile and collect the full dependency closure ────────────
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const pkgMeta = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const specs = new Map(); // name@version -> { name, version }
const integrityByName = new Map(); // name@version -> integrity
for (const [key, meta] of Object.entries(lock.packages || {})) {
  if (!key.startsWith('node_modules/')) continue;
  if (!meta.version) continue;
  // Nested entries look like "node_modules/a/node_modules/b" — the package
  // name is always the segment AFTER the LAST "node_modules/".
  const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
  specs.set(`${name}@${meta.version}`, { name, version: meta.version });
  if (meta.integrity) integrityByName.set(`${name}@${meta.version}`, meta.integrity);
}
const list = [...specs.values()];

// npm stores scoped packages with a flattened filename: @scope/name -> scope-name
function tarballFile(name, version) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

function tarballVerified(filePath, spec) {
  if (!existsSync(filePath)) return false;
  const expected = integrityByName.get(spec);
  if (!expected) return false;
  const actual = `sha512-${createHash('sha512').update(readFileSync(filePath)).digest('base64')}`;
  return actual === expected;
}

console.log('Quiz App — Offline Bundle Generator');
console.log('====================================');
console.log(`  Platform     : ${plat}`);
console.log(`  Packages     : ${list.length} (full tree from package-lock.json)`);
console.log(`  Output       : ${relative(root, offlineDir)}`);
console.log();

// ── 2. Download every package tarball ───────────────────────────────────────
mkdirSync(packsDir, { recursive: true });

const packed = [];
let ok = 0;
let failed = [];
let i = 0;
for (const { name, version } of list) {
  i++;
  const spec = `${name}@${version}`;
  const expectedFile = join(packsDir, tarballFile(name, version));
  if (tarballVerified(expectedFile, spec)) {
    packed.push({ name, version, platform: null, file: relative(offlineDir, expectedFile), sizeBytes: statSync(expectedFile).size, integrity: 'verified' });
    process.stdout.write(`\r  [${String(i).padStart(3, '0')}/${list.length}] ${spec.padEnd(52)} cached`);
    continue;
  }
  try {
    const out = npm(['pack', spec, '--pack-destination', packsDir, '--no-audit', '--no-fund', '--silent', '--loglevel=error'], true);
    const fileName = out.split(/\r?\n/).filter(Boolean).pop();
    const filePath = join(packsDir, fileName || `${name.replace('/', '-')}-${version}.tgz`);
    if (!existsSync(filePath)) throw new Error('tarball not produced');
    const sizeBytes = statSync(filePath).size;

    const expected = integrityByName.get(spec);
    let integrityOk = true;
    if (expected) {
      const actual = createHash('sha512').update(readFileSync(filePath)).digest('base64');
      integrityOk = `sha512-${actual}` === expected;
      if (integrityOk) ok++;
    }
    const extra = expected ? (integrityOk ? 'verified' : 'INTEGRITY MISMATCH') : 'no-lock-integrity';
    packed.push({ name, version, platform: null, file: relative(offlineDir, filePath), sizeBytes, integrity: extra });
    process.stdout.write(`\r  [${String(i).padStart(3, '0')}/${list.length}] ${spec.padEnd(52)} ${extra}`);
  } catch (err) {
    failed.push(`${spec}: ${err.message.split('\n')[0]}`);
    process.stdout.write(`\r  [${String(i).padStart(3, '0')}/${list.length}] ${spec.padEnd(52)} FAILED`);
  }
}
console.log();

// ── 3. Snapshot the Prisma engines (platform-specific binaries) ─────────────
let prismaEnginesOk = false;
const enginesSrc = join(root, 'node_modules', '@prisma', 'engines');
if (existsSync(enginesSrc)) {
  mkdirSync(platEnginesDir, { recursive: true });
  cpSync(enginesSrc, platEnginesDir, { recursive: true });
  prismaEnginesOk = readdirSync(platEnginesDir).length > 0;
  console.log(`\n  Prisma engines snapshotted for ${plat} -> ${relative(root, platEnginesDir)}`);
} else {
  console.warn(`\n  [WARN] ${join('node_modules', '@prisma', 'engines')} not found.`);
  console.warn('         Prisma generate on the offline machine will need internet once.');
}

// ── 4. Write the manifest (the dependency list) ─────────────────────────────
const totalBytes = packed.reduce((s, p) => s + p.sizeBytes, 0);
const verifiedCount = packed.filter((p) => p.integrity === 'verified').length;
const manifest = {
  generatedAt: new Date().toISOString(),
  platform: plat,
  node: run('node', ['--version'], true),
  npm: npm(['--version'], true),
  topLevel: {
    dependencies: pkgMeta.dependencies,
    devDependencies: pkgMeta.devDependencies,
  },
  counts: { packages: packed.length, integrityVerified: verifiedCount, failed: failed.length },
  totalBytes,
  hasOfflinePrismaEngines: prismaEnginesOk,
  packages: packed.sort((a, b) => a.name.localeCompare(b.name)),
  howToInstall: [
    'GENERATE (one online machine per OS): node scripts/generate-offline-bundle.mjs',
    'TRANSPORT: copy this folder together with the app to the offline machine',
    'INSTALL (auto-detects this bundle): setup.bat on Windows, ./install.sh on Linux/macOS',
    'The installer seeds the npm cache from packages/*.tgz, then runs npm ci --offline.',
    'Prisma engines are restored from prisma-engines/<platform>-<arch>/ before prisma generate.',
    'Default login after install: admin / admin123 (created by the seed)',
  ],
};
writeFileSync(join(offlineDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(
  join(offlineDir, 'DEPENDENCIES.txt'),
  [
    'Quiz App — offline dependency list',
    `Generated: ${manifest.generatedAt} on ${plat}`,
    `Packages : ${packed.length}`,
    '',
    'Top-level dependencies:',
    ...Object.entries(pkgMeta.dependencies).map(([n, v]) => `  prod  ${n}  ${v}`),
    ...Object.entries(pkgMeta.devDependencies || {}).map(([n, v]) => `  dev   ${n}  ${v}`),
    '',
    'Full resolved list (name@version):',
    ...packed.map((p) => `  ${p.name}@${p.version}`),
    '',
  ].join('\n'),
);

// ── 5. Summary ───────────────────────────────────────────────────────────────
console.log('\n');
console.log('  Bundle complete.');
console.log(`  ${packed.length} tarballs  |  ${(totalBytes / 1048576).toFixed(1)} MB  |  ${verifiedCount} integrity-verified  |  ${failed.length} failed`);
if (failed.length) {
  console.warn('\n  Failed packages:');
  for (const f of failed) console.warn('   -', f);
}
console.log('\n  Next steps on the offline machine (same OS):');
console.log('    Windows : double-click  setup.bat');
console.log('    Linux   :               ./install.sh');
console.log('  Then open http://localhost:3000  —  login: admin / admin123');
console.log();