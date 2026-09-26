/**
 * scripts/lan-ip.mjs
 *
 * Prints the most likely LAN IPv4 address of this machine that students
 * should use to reach the app (e.g. 192.168.1.42), or "localhost" if none
 * is found. Virtual adapters (Docker, VMware, Hyper-V, VirtualBox) are
 * deprioritized so the real Wi-Fi/Ethernet IP wins.
 * Used by setup.bat / install.sh to show students which URL to open.
 */
import os from 'node:os';

const VIRTUAL = /vEthernet|docker|vmware|virtualbox|hyper-?v/i;

const candidates = [];
for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
  const virtual = VIRTUAL.test(name);
  for (const a of addrs || []) {
    if (a && a.family === 'IPv4' && !a.internal) {
      candidates.push({ ip: a.address, virtual });
    }
  }
}

// Real adapters first, then 192.168.x / 10.x / 172.16-31.x as a tiebreak.
candidates.sort((a, b) => {
  if (a.virtual !== b.virtual) return a.virtual ? 1 : -1;
  const score = (ip) => {
    if (ip.startsWith('192.168.')) return 0;
    if (/^10\./.test(ip)) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    return 3;
  };
  return score(a.ip) - score(b.ip);
});

console.log(candidates[0]?.ip || 'localhost');