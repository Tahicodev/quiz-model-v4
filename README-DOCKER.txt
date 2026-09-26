Quiz App v4 — DOCKER version (any OS)
======================================

Run the app on Windows, Linux or macOS with ONE click — no Node.js installs
on the target machine, no npm, no per-OS packages.

REQUIREMENT (once per machine)
------------------------------
Docker Desktop / Docker Engine must be installed:
  Windows/macOS: https://www.docker.com/products/docker-desktop
  Linux:         sudo apt install docker docker-compose-plugin   (or distro equivalent)

QUICK START
-----------
1. Copy this whole folder to the target machine.
2. Double-click  docker-start.bat   (Windows)
   or run       ./docker-start.sh   (Linux / macOS)
3. Your browser opens http://localhost:3000 — Login: admin / admin123

The launcher does everything:
  - generates a .env with random secret keys
  - loads the bundled image from quiz-app-v4-image.tar   (OFFLINE — no internet)
    OR builds the image the first time if the .tar is not present (needs internet)
  - starts the container and opens the browser

TWO WAYS TO GET THE IMAGE
-------------------------
A) OFFLINE (recommended for classroom/LAN machines):
   - copy quiz-app-v4-image.tar into this folder once
   - done; docker-start will never touch the network

B) INTERNET:
   - no .tar needed; the first docker-start builds the image automatically
     (downloads node image + npm packages once, then caches it)

DATA & RESTART
--------------
- All data lives in the Docker volume "quiz-data" (SQLite at /app/prisma/dev.db).
  It survives container restarts and docker compose down.
- To reset completely:   docker compose -f docker-compose.local.yml down -v
- To stop:               docker compose -f docker-compose.local.yml down
- Logs:                  docker compose -f docker-compose.local.yml logs app

CHANGE ADMIN PASSWORD right after first login (Settings page) — default is
admin / admin123.