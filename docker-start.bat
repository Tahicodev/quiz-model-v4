@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Quiz App  --  Docker Launcher  (any OS)
echo    * looks for quiz-app-v4-image.tar  (offline)
echo    * or builds the image once  (needs internet)
echo  ==================================================
echo.

rem ── 1. Docker installed? ──────────────────────────────────────────────────
where docker >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Docker is not installed.
  echo         Install Docker Desktop (https://www.docker.com/products/docker-desktop)
  echo         or your distro's docker package, then run this again.
  pause
  exit /b 1
)

rem ── 2. Fresh .env with random secrets (used by compose) ───────────────────
if not exist .env (
  echo  [1/4] Creating .env with random secrets...
  for /f "delims=" %%s in ('node -p "require('crypto').randomBytes(32).toString('hex')"') do set JWT_SECRET=%%s
  for /f "delims=" %%s in ('node -p "require('crypto').randomBytes(24).toString('base64url')"') do set QUIZ_ADMIN_SECRET=%%s
  > .env (
    echo APP_MODE=local
    echo DB_PROVIDER=sqlite
    echo DATABASE_URL="file:./dev.db"
    echo JWT_SECRET=!JWT_SECRET!
    echo JWT_ACCESS_EXPIRES=15m
    echo JWT_REFRESH_EXPIRES=7d
    echo BCRYPT_ROUNDS=12
    echo PORT=3000
    echo NODE_ENV=production
    echo CORS_ORIGIN=http://localhost:3000
    echo LOG_LEVEL=info
    echo DEFAULT_SCHOOL_ID=local
    echo QUIZ_ADMIN_SECRET=!QUIZ_ADMIN_SECRET!
  )
) else (
  echo  [1/4] .env already exists -- keeping it.
)

rem ── 3. Make sure the image exists ─────────────────────────────────────────
docker image inspect quiz-app-v4:local >nul 2>&1
if errorlevel 1 (
  if exist "quiz-app-v4-image.tar" (
    echo  [2/4] Loading bundled image ^(offline, no internet needed^)...
    docker load -i "quiz-app-v4-image.tar"
    if errorlevel 1 (
      echo  [ERROR] docker load failed.
      pause
      exit /b 1
    )
  ) else if exist "quiz-app-v4-image.tar.gz" (
    echo  [2/4] Loading bundled image ^(offline, no internet needed^)...
    docker load -i "quiz-app-v4-image.tar.gz"
    if errorlevel 1 (
      echo  [ERROR] docker load failed.
      pause
      exit /b 1
    )
  ) else (
    echo  [2/4] Building image ^(first run only -- needs internet^)...
    docker compose -f docker-compose.local.yml build
    if errorlevel 1 (
      echo  [ERROR] docker build failed. Check your internet connection.
      pause
      exit /b 1
    )
  )
) else (
  echo  [2/4] Image already available.
)

rem ── 4. Start ──────────────────────────────────────────────────────────────
echo  [3/4] Starting the container...
docker compose -f docker-compose.local.yml up -d
if errorlevel 1 (
  echo  [ERROR] docker compose up failed.
  pause
  exit /b 1
)

echo  [4/4] Waiting for the app to be ready...
set /a tries=0
:waitloop
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto ready
set /a tries+=1
if !tries! geq 30 (
  echo  [ERROR] The app did not become ready. Run:
  echo         docker compose -f docker-compose.local.yml logs app
  pause
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto waitloop

:ready
echo.
echo  ==================================================
echo    Quiz App is running!
echo    Login : admin    Password : admin123
echo    URL   : http://localhost:3000
echo  ==================================================
echo.
start http://localhost:3000
echo  To stop:  docker compose -f docker-compose.local.yml down
echo.
pause