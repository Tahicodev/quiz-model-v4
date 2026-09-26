Quiz App v4.0.0 — Offline Installer
====================================

This folder contains EVERYTHING needed to run the Quiz App on a fresh
machine — no internet required.

TWO WAYS TO INSTALL — pick one (both are already in this folder):

  OPTION A  Native (Node.js) — for Windows / Linux / macOS machines
  OPTION B  Docker         — for machines WITHOUT any Node.js install

----------------------------------------------------------------
OPTION A — NATIVE (requires only Node.js once)
----------------------------------------------------------------
Requirements on the new machine
    - Windows 10/11 + Node.js 20+ (https://nodejs.org)  -> setup.bat
    - Linux / macOS + Node.js 20+                        -> ./install.sh

Install
    1. Copy this whole folder to the new machine (keep it in one piece).
    2. Make sure Node.js is installed (the ONLY step that needs internet).
    3. DOUBLE-CLICK  setup.bat  (Windows)   or run:  ./install.sh  (Unix)
    4. Answer the prompts. The installer:
         - uses the node_modules that already ships inside this folder
           (no npm install at all — works with ANY npm version, no cache)
         - creates a .env file with fresh random secret keys
         - generates the Prisma client + applies database migrations
         - seeds the database with the default login
    5. When asked "Start the server now?" press  Y  (Enter).

----------------------------------------------------------------
OPTION B — DOCKER (no Node.js on the machine at all)
----------------------------------------------------------------
Requirement (once per machine)
    - Docker Desktop / Docker Engine  https://www.docker.com/products/docker-desktop
      (install takes a few minutes; afterwards everything is OFFLINE)

Install
    1. Copy this whole folder to the machine.
    2. DOUBLE-CLICK  docker-start.bat  (Windows)  or run  ./docker-start.sh  (Linux/macOS)
    3. The launcher auto-loads the bundled image from quiz-app-v4-image.tar
       (fully offline) and opens http://localhost:3000.
    4. See README-DOCKER.txt for details (data volume, reset, logs).

----------------------------------------------------------------
Opening the app
----------------------------------------------------------------
    This PC:  http://localhost:3000     (or https:// if you enabled HTTPS)
    Students:  http://<server-IP>:3000  — the installer prints this IP.
              (Students just open that address in a browser; nothing
               needs to be installed on their machines.)
    Login  :  admin
    Password:  admin123     <-- CHANGE IT after first login (Settings)

----------------------------------------------------------------
OPTIONAL — HTTPS (secure access from tablets/phones on the LAN)
----------------------------------------------------------------
During setup.bat / install.sh you can answer YES to "Enable HTTPS?".
    - The installer generates a trusted certificate for THIS machine
      (bundled mkcert, fully offline) covering localhost + all its LAN IPs.
    - The app then runs at  https://localhost:3000  (or https://<IP>:3000).
    - To remove the browser warning on each tablet/phone, install
      certs\ca\rootCA.pem  as a CA certificate once on each device
      (Settings → Security → Install cert), then open https://<IP>:3000.
    - Skip HTTPS anytime by answering N — plain HTTP works fine.

Notes
-----
- Everything runs locally (SQLite database). No cloud needed.
- Images: question option/media images are saved inside the app's
  "uploads" folder and referenced from the database — they travel with
  this package, so image questions keep working offline. Full backups
  can be exported as a ZIP (data + images) and re-imported from that
  same ZIP, so images come back too.
- Option A is built for Windows x64 (win32-x64): it bundles installed
  node_modules + Prisma engines for that platform, so install is instant
  and independent of your npm version.
- Option A reinstall from scratch: delete node_modules, .env and
  prisma\dev.db, then run setup.bat again (falls back to the tgz bundle).
- Option B (Docker) also works offline via the bundled quiz-app-v4-image.tar.