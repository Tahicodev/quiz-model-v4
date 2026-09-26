@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: ============================================================
::  Quiz App — First-Time Installer (Windows)
::  Works ONLINE (npm registry) or OFFLINE (vendor\offline bundle)
::  Steps: install deps -> .env -> Prisma client -> migrate -> seed
::  Optional step: HTTPS with a trusted local certificate (mkcert)
:: ============================================================

echo.
echo  ==================================================
echo    Quiz App  —  First-Time Installer
echo    * ONLINE mode  : downloads from npm registry
echo    * OFFLINE mode : uses vendor\offline bundle
echo  ==================================================
echo.

:: Silence Prisma telemetry / update checks (best effort)
set CHECKPOINT_DISABLE=1
set PRISMA_HIDE_UPDATE_MESSAGE=1

rem ── 1. Node.js check ──────────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
  echo  [1/9] [ERROR] Node.js is not installed.
  echo         Install Node.js 20+ from https://nodejs.org
  echo         ^(this is the only step that needs internet, once^)
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do set NODEVERSION=%%v
echo  [1/9] Node.js  !NODEVERSION!  detected.

rem ── 2. Detect mode ────────────────────────────────────────────────────
for /f "delims=" %%p in ('node -p "process.platform + '-' + process.arch"') do set PLAT=%%p
set MODE=online
if exist "vendor\offline\manifest.json" if exist "vendor\offline\packages\*.tgz" set MODE=offline
if "!MODE!"=="offline" (
  echo  [2/9] Mode: OFFLINE  ^(bundle found for !PLAT!, no internet needed^)
) else (
  echo  [2/9] Mode: ONLINE   ^(installing from npm registry^)
  echo         Tip: create an offline bundle in advance:
  echo              node scripts\generate-offline-bundle.mjs
)
echo.

rem ── 3. Clean previous install (keep vendored node_modules, if any) ──────
if "!MODE!"=="offline" if exist "node_modules\.bundled.marker" (
  echo  [3/9] Bundled node_modules found — skipping npm install.
  goto :offline_engines
)
if exist node_modules (
  echo  [3/9] Removing old node_modules for a clean install...
  rmdir /s /q node_modules
) else (
  echo  [3/9] No previous node_modules found — clean install.
)

rem ── 4. Install dependencies ───────────────────────────────────────────
if "!MODE!"=="offline" (
  echo  [4/9] Seeding npm cache from vendor\offline\packages ^(!PLAT!^)...
  for %%f in (vendor\offline\packages\*.tgz) do (
    call npm cache add "%%f" >nul 2>&1
    if errorlevel 1 (
      echo  [4/9] [ERROR] Could not seed cache from %%f
      echo         If your npm version is failing offline lookups, use a newer
      echo         package that ships with node_modules already installed.
      pause
      exit /b 1
    )
  )
  echo  [4/9] Installing packages  ^(npm ci --offline^)...
  call npm ci --offline --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    echo  [4/9] [WARN] npm ci --offline failed, retrying with npm install --offline...
    call npm install --offline --ignore-scripts --no-audit --no-fund
    if errorlevel 1 (
      echo  [4/9] [ERROR] Offline install failed.
      echo         Hint: newer npm versions do offline installs from the
      echo         cache unreliably. Get the package that ships with
      echo         node_modules bundled, or use an online npm install once.
      pause
      exit /b 1
    )
  )
) else (
  echo  [4/9] Installing packages  ^(npm ci^)...
  call npm ci --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    echo  [4/9] [ERROR] npm ci failed. Check your internet connection.
    pause
    exit /b 1
  )
)

:offline_engines
rem Restore the Prisma engine binaries snapshotted at bundle time
if "!MODE!"=="offline" (
  if exist "vendor\offline\prisma-engines\!PLAT!" (
    echo  [4/9] Restoring Prisma engines for !PLAT!...
    if exist "node_modules\@prisma\engines" rmdir /s /q "node_modules\@prisma\engines"
    xcopy "vendor\offline\prisma-engines\!PLAT!" "node_modules\@prisma\engines\" /e /i /y >nul
  ) else (
    echo  [4/9] [WARN] No bundled Prisma engines for !PLAT!
    echo         prisma generate will need internet this once.
  )
)
echo  [4/9] Building frontend bundles ^(best effort — if missing, skip and use committed bundles^)...
call npm run build >nul 2>&1
if errorlevel 1 echo  [4/9] [WARN] Frontend build skipped, using committed public\*-bundle.js.

rem ── 5. .env file ──────────────────────────────────────────────────────
rem Fresh secrets — captured here (outside the if-block, where set /p works)
for /f "delims=" %%s in ('node -p "require('crypto').randomBytes(32).toString('hex')"') do set JWT_SECRET=%%s
for /f "delims=" %%s in ('node -p "require('crypto').randomBytes(24).toString('base64url')"') do set QUIZ_ADMIN_SECRET=%%s
if not exist .env (
  echo  [5/9] Creating .env with fresh random secrets...
  > .env (
    echo APP_MODE=local
    echo DB_PROVIDER=sqlite
    echo DATABASE_URL="file:./dev.db"
    echo JWT_SECRET=!JWT_SECRET!
    echo JWT_ACCESS_EXPIRES=15m
    echo JWT_REFRESH_EXPIRES=7d
    echo BCRYPT_ROUNDS=12
    echo PORT=3000
    echo NODE_ENV=development
    echo CORS_ORIGIN=http://localhost:3000
    echo LOG_LEVEL=info
    echo DEFAULT_SCHOOL_ID=local
    echo QUIZ_ADMIN_SECRET=!QUIZ_ADMIN_SECRET!
  )
  if exist .env (
    echo  [5/9] .env created.
  ) else (
    echo  [5/9] [ERROR] Could not write .env
    pause
    exit /b 1
  )
) else (
  echo  [5/9] .env already exists — keeping it.
)

rem ── 6. Prisma client ──────────────────────────────────────────────────
echo  [6/9] Generating Prisma client...
call npx prisma generate
if errorlevel 1 (
  echo  [6/9] [ERROR] prisma generate failed.
  echo         Offline? Make sure vendor\offline\prisma-engines exists for your OS.
  pause
  exit /b 1
)

rem ── 7. Database: migrate + seed ───────────────────────────────────────
echo  [7/9] Applying database migrations...
call npx prisma migrate deploy
if errorlevel 1 (
  echo  [7/9] [ERROR] prisma migrate deploy failed.
  echo         Check that the prisma folder is writable.
  pause
  exit /b 1
)
echo  [7/9] Seeding database  ^(creates admin / admin123^)...
call npx prisma db seed
if errorlevel 1 (
  echo  [7/9] [WARN] Seeding failed — you can re-run:  npx prisma db seed
)

rem ── 8. Optional HTTPS (trusted local certificate) ─────────────────────
set HTTPS_ON=0
set /p HTTPSQ=Enable HTTPS with a trusted local certificate (Y/N) [N]= 
if /i "!HTTPSQ!"=="Y" (
  echo  [8/9] Generating trusted certificate ^(bundled mkcert — offline^)...
  node scripts\gen-https-certs.mjs
  if errorlevel 1 (
    echo  [8/9] [WARN] HTTPS setup failed — continuing with plain HTTP.
  ) else (
    >>.env echo TLS_ENABLED=1
    >>.env echo TLS_CERT_PATH=certs\server.crt
    >>.env echo TLS_KEY_PATH=certs\server.key
    echo  [8/9] HTTPS enabled. browser URL will be  https://localhost:3000
    echo         To trust it on tablets/phones, install certs\ca\rootCA.pem
    echo         as a CA certificate on each device.
    set HTTPS_ON=1
  )
) else (
  echo  [8/9] HTTPS skipped — using plain HTTP.
)

rem ── 9. Done ───────────────────────────────────────────────────────────
for /f "delims=" %%i in ('node scripts\lan-ip.mjs') do set LANIP=%%i
echo.
echo  ==================================================
echo    [9/9] Installation complete!
echo
echo    Login : admin    Password : admin123
if "!HTTPS_ON!"=="1" (
  echo    On this PC: https://localhost:3000
  echo    Students  : https://!LANIP!:3000
) else (
  echo    On this PC: http://localhost:3000
  echo    Students  : http://!LANIP!:3000
)
echo    Start : node src\backend\server.js
echo  ==================================================
echo.
set /p STARTQ=Start the server now? (Y/N) [Y]= 
if /i "!STARTQ!"=="N" goto :end
start "Quiz App Server" cmd /k "node src\backend\server.js"
echo   Server starting in a new window — keep it open.
:end
echo.
pause
exit /b 0