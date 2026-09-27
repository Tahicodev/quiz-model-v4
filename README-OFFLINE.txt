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

TRUSTING THE CERTIFICATE ON STUDENT DEVICES (step by step)
------------------------------------------------------------
Only the one file matters:  certs\ca\rootCA.pem  (created on the SERVER
machine when you answered YES to HTTPS during setup; it sits in the
"certs" folder next to setup.bat). Copy it to each student device once
(USB / email / network share), then install it there. Test on one
device before rolling out to the rest.

  Windows (Chrome / Edge / Firefox):
    1. Double-click rootCA.pem -> "Install Certificate..."
    2. Storage location: Current User -> Next
    3. Tick "Place all certificates in the following store" -> Browse
    4. Choose "Trusted Root Certification Authorities" -> OK -> Next -> Finish
    5. Restart the browser, then open https://<server-IP>:3000

  Android (Chrome):
    1. Open the rootCA.pem file (tap it in e-mail / Downloads)
    2. Settings -> Security -> More security settings
       -> Encryption & credentials -> Install a certificate -> CA certificate
    3. Pick the file, confirm with your PIN
    4. Reopen Chrome -> https://<server-IP>:3000

  iPhone / iPad (Safari) — BOTH steps are required:
    1. Open rootCA.pem -> Settings -> "Profile Downloaded" -> Install (PASSCODE)
    2. Settings -> General -> About -> Certificate Trust Settings
       -> switch ON full trust for the "rootCA" certificate
    3. Open https://<server-IP>:3000 in Safari

  macOS (Safari / Chrome):
    1. Double-click rootCA.pem (Keychain Access opens)
    2. Get Info on "rootCA" -> expand "Trust"
       -> "When using this certificate" -> "Always Trust"
    3. Reopen the browser -> https://<server-IP>:3000

Check: if the browser STILL shows "Your connection is not private"
(NET::ERR_CERT_AUTHORITY_INVALID), the CA did not install or the
browser was not restarted. The steps above install it once per device;
afterwards the warning goes away for good.

Remember:
  - Students must open  https://<server-IP>:3000  (the IP printed at the
    end of setup.bat), NOT "localhost" — the certificate is made to trust
    the server's LAN address, not each student PC.
  - Keep the "certs" folder inside the app folder. If you re-run HTTPS
    setup later, a NEW CA is created and students need the new rootCA.pem.
  - No internet is required — this is all local files.

    - Skip HTTPS anytime by answering N — plain HTTP works fine.

Notes
-----
- Everything runs locally (SQLite database). No cloud needed.
- Images: question option/media images are saved inside the app's
  "uploads" folder and referenced from the database — they travel with
  this package, so image questions keep working offline. Full backups
  can be exported as a ZIP (data + images) and re-imported from that
  same ZIP, so images come back too.
- AI image options: when the AI generator produces Multiple-Choice,
  Multi-Answer, Odd-One-Out or Drag & Drop questions, it can also
  auto-generate the option pictures (like doing it manually). This
  happens when the selected AI model is OpenAI, OpenRouter or a Google
  image model (e.g. Nano Banana, gemini-2.5-flash-image). Image-only
  models cannot write text, so picking one auto-pairs it with a text
  model from the same provider/key (per provider default below) that
  writes the question text while the image model renders the option
  pictures. Any other provider (or a failed image) falls back to
  normal text options. Optional server settings:
    AI_IMAGE_MODEL        image model (defaults: gpt-image-1 / openai/gpt-image-1)
    AI_IMAGE_QUESTION_MODEL  text model for image-only models (defaults per provider: google → gemini-2.5-flash, openai→gpt-4o-mini, openrouter→openai/gpt-4o-mini)
    AI_IMAGE_SIZE         image size (default 1024x1024)
    AI_IMAGE_MAX_TOTAL    max images generated per request (default 20)
    AI_IMAGE_CONCURRENCY  parallel image calls (default 2)
- Option A is built for Windows x64 (win32-x64): it bundles installed
  node_modules + Prisma engines for that platform, so install is instant
  and independent of your npm version.
- Option A reinstall from scratch: delete node_modules, .env and
  prisma\dev.db, then run setup.bat again (falls back to the tgz bundle).
- Option B (Docker) also works offline via the bundled quiz-app-v4-image.tar.