/**
 * scripts/gen-https-certs.mjs
 *
 * Generates a trusted local HTTPS certificate for this machine using the
 * bundled mkcert binary (vendor/mkcert/<platform>/mkcert).
 *
 * What it does:
 *   1. Locates mkcert (bundled, or from PATH).
 *   2. Installs a local Certificate Authority into the OS trust store
 *      (best effort — Windows and macOS install automatically; on Linux the
 *      rootCA.pem path is printed for a manual copy).
 *   3. Creates certs/server.crt + certs/server.key trusting localhost,
 *      127.0.0.1, ::1 and every LAN IPv4 address detected on this machine
 *      (so tablets/phones can open https://<teacher-ip>:3000 without warnings,
 *      after the CA is installed on each device).
 *
 * Certificates are machine-specific and generated at install time, so they
 * always match the network the app actually runs on.
 *
 * Usage:  node scripts/gen-https-certs.mjs
 * Output: certs/server.crt, certs/server.key, certs/ca/rootCA.pem
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLAT = `${process.platform}-${process.arch}`;
const CERTS_DIR = path.join(ROOT, 'certs');
const CAROOT = path.join(CERTS_DIR, 'ca');

// ── 1. Find the mkcert binary ────────────────────────────────────────────────
function findMkcert() {
  const exe = process.platform === 'win32' ? 'mkcert.exe' : 'mkcert';
  const bundled = path.join(ROOT, 'vendor', 'mkcert', PLAT, exe);
  if (fs.existsSync(bundled)) return bundled;

  const res = spawnSync(
    process.platform === 'win32' ? 'where' : 'which',
    ['mkcert'],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (res.status === 0 && res.stdout.trim()) return res.stdout.trim().split(/\r?\n/)[0];

  return null;
}

function run(bin, args, { fatalOnFail = true } = {}) {
  console.log(`  running: mkcert ${args.join(' ')}`);
  const res = spawnSync(bin, args, {
    encoding: 'utf8',
    env: { ...process.env, CAROOT },
  });
  const out = [res.stdout, res.stderr].filter(Boolean).join('').trim();
  if (out) console.log(out.split('\n').map((l) => `    ${l}`).join('\n'));
  if (res.status !== 0 && fatalOnFail) {
    console.error(`\n[ERROR] mkcert ${args[0]} failed (exit ${res.status}).`);
    process.exit(1);
  }
  return res.status;
}

// ── 2. LAN IPv4 addresses ────────────────────────────────────────────────────
function lanIpv4s() {
  const ips = new Set();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) ips.add(a.address);
    }
  }
  return [...ips];
}

// ── 3. Go ────────────────────────────────────────────────────────────────────
const mkcert = findMkcert();
if (!mkcert) {
  console.error(
    `\n[ERROR] mkcert binary not found.\n` +
      `  Expected: vendor/mkcert/${PLAT}/mkcert(.exe)\n` +
      `  Fallback: install mkcert from https://github.com/FiloSottile/mkcert and re-run.`,
  );
  process.exit(1);
}

fs.mkdirSync(CERTS_DIR, { recursive: true });
fs.mkdirSync(CAROOT, { recursive: true });

console.log(`\nmkcert:  ${mkcert}`);
console.log(`CA root: ${CAROOT}`);

// Install the local CA into the OS trust store (best effort).
const installStatus = run(mkcert, ['-install'], { fatalOnFail: false });
if (installStatus !== 0) {
  console.warn(
    `\n[WARN] Could not auto-install the CA into the OS trust store.\n` +
      `  On Windows/macOS this usually works without admin rights.\n` +
      `  On Linux, copy the rootCA.pem to each device manually (see below).`,
  );
}

// Generate the server certificate for localhost + all detected LAN IPs.
const sanHosts = ['localhost', '127.0.0.1', '::1', ...lanIpv4s()];
const serverCert = path.join(CERTS_DIR, 'server.crt');
const serverKey = path.join(CERTS_DIR, 'server.key');
run(mkcert, [
  '-key-file', serverKey,
  '-cert-file', serverCert,
  ...sanHosts,
]);

const rootCA = path.join(CAROOT, 'rootCA.pem');
console.log('\n[OK] Certificate generated.');
console.log(`  cert:  ${serverCert}`);
console.log(`  key:   ${serverKey}`);
console.log(`  trusts: ${sanHosts.join(', ')}`);
console.log(`  local CA: ${rootCA}`);
console.log(
  `\nTo trust it on a tablet/phone, transfer ${rootCA} to the device and install\n` +
    `it as a CA certificate (Settings → Security → Install CA), then open\n` +
    `https://<this-machine-IP>:3000`,
);