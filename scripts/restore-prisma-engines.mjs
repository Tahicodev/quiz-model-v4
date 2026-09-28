#!/usr/bin/env node
/**
 * scripts/restore-prisma-engines.mjs
 *
 * Restores the Prisma engine binaries snapshotted into vendor/offline/prisma-engines
 * on an offline machine, so `prisma generate` / `prisma migrate` / the running app
 * all work without ever contacting binaries.prisma.sh.
 *
 * The snapshot is a copy of a real node_modules/@prisma/engines package directory
 * (the binaries sit at its root: query_engine-windows.dll.node +
 * schema-engine-windows.exe on Windows, query-engine/libquery_engine.so.node +
 * schema-engine on Linux, etc.). Prisma 5.x needs those binaries in THREE places:
 *
 *   1. node_modules/@prisma/engines/           - package dir; some internals read it
 *   2. node_modules/prisma/                    - where the `prisma` CLI actually loads
 *                                                the engines from during generate/migrate
 *   3. node_modules/.cache/prisma/master/<enginesVersion>/<platform>/
 *      (binary + <binary>.sha256)             - Prisma's download cache. When this
 *                                                exists with a matching checksum, Prisma
 *                                                skips the download check entirely, which
 *                                                keeps offline installs working even when
 *                                                its version check can't run (e.g. on a
 *                                                very new or very old Node.js).
 *
 * Exit codes: 0 = restored OK
 *             1 = no snapshot for this platform (caller should warn and continue;
 *                 `prisma generate` will then need internet once)
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLAT = `${process.platform}-${process.arch}`;
const offlineDir = path.join(ROOT, 'vendor', 'offline', 'prisma-engines', PLAT);
const enginesPkgDir = path.join(ROOT, 'node_modules', '@prisma', 'engines');
const cliDir = path.join(ROOT, 'node_modules', 'prisma');

function engineFiles(dir, re) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const name of fs.readdirSync(dir)) {
    const f = path.join(dir, name);
    if (fs.statSync(f).isFile() && re.test(name)) found.push(f);
  }
  return found;
}

function pickEngine(re) {
  const cands = engineFiles(offlineDir, re);
  return cands[0] || null;
}

function dot(p) {
  return p.replace(ROOT, '.');
}

if (!fs.existsSync(offlineDir)) {
  console.warn(`  [WARN] No bundled Prisma engines for ${PLAT}`);
  console.warn('         prisma generate will need internet this once.');
  process.exit(1);
}

// ── 1. node_modules/@prisma/engines (full package restore, as before) ─────────
console.log(`  Restoring Prisma engines for ${PLAT}...`);
fs.rmSync(enginesPkgDir, { recursive: true, force: true });
fs.cpSync(offlineDir, enginesPkgDir, { recursive: true });

// ── 2. node_modules/prisma (the CLI loads engines from here) ──────────────────
if (fs.existsSync(cliDir)) {
  for (const f of engineFiles(offlineDir, /(?:query|schema)[_-]?engine/i)) {
    const dest = path.join(cliDir, path.basename(f));
    fs.copyFileSync(f, dest);
    console.log(`  - ${path.basename(f)} -> node_modules\\prisma`);
  }
} else {
  console.warn('  [WARN] node_modules/prisma not found — skipped CLI engine restore.');
}

// ── 3. Seed Prisma's download cache (binary + .sha256) ────────────────────────
try {
  const { getBinaryTargetForCurrentPlatform } = require(
    path.join(ROOT, 'node_modules', '@prisma', 'get-platform'),
  );
  const { enginesVersion } = require(
    path.join(ROOT, 'node_modules', '@prisma', 'engines-version'),
  );
  const binaryTarget = await getBinaryTargetForCurrentPlatform();
  const cacheDir = path.join(
    ROOT, 'node_modules', '.cache', 'prisma', 'master', enginesVersion, binaryTarget,
  );
  fs.mkdirSync(cacheDir, { recursive: true });

  const queryLib = pickEngine(/libquery|query[_-]?engine.*\.(?:dll\.node|so\.node|dylib\.node)$/i)
    || pickEngine(/query[_-]?engine/i);
  const schemaEng = pickEngine(/schema[_-]?engine/i);

  const cacheEntries = [
    ['libquery-engine', queryLib],
    ['schema-engine', schemaEng],
  ];
  for (const [cacheName, src] of cacheEntries) {
    if (!src) {
      console.warn(`  [WARN] No ${cacheName} found in snapshot — cache not seeded.`);
      continue;
    }
    const dest = path.join(cacheDir, cacheName);
    fs.copyFileSync(src, dest);
    const hash = createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
    fs.writeFileSync(`${dest}.sha256`, hash);
    console.log(`  - ${cacheName} + .sha256 -> ${dot(cacheDir)}`);
  }
} catch (err) {
  console.warn(`  [WARN] Could not seed Prisma download cache: ${err.message.split('\n')[0]}`);
}

console.log('  Prisma engines restored.');
process.exit(0);