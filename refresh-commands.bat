@echo off
setlocal

rem Change to the directory of this script
cd /d "%~dp0"

rem Check Node availability
node -v >nul 2>&1 || (
  echo Node.js is not installed or not in PATH.
  exit /b 1
)

rem Determine target scope: first arg 'guild' or 'global' (default: env or config)
set "DEPLOY_TARGET_ARG=%~1"
if /I "%DEPLOY_TARGET_ARG%"=="guild" (
  set "DEPLOY_TARGET=guild"
) else if /I "%DEPLOY_TARGET_ARG%"=="global" (
  set "DEPLOY_TARGET=global"
)

echo Deploying Discord application (slash) commands... (target=%DEPLOY_TARGET%)
set "NODE_OPTIONS="
"%SystemRoot%\System32\cmd.exe" /c "set DEPLOY_TARGET=%DEPLOY_TARGET%&& node deploy-commands.js"
if errorlevel 1 (
  echo ❌ Failed to deploy slash commands.
  exit /b 1
)

rem Determine Render deploy hook URL (arg 2 takes precedence, else env var)
set "HOOK="
if not "%~2"=="" (
  set "HOOK=%~2"
) else if not "%RENDER_DEPLOY_HOOK%"=="" (
  set "HOOK=%RENDER_DEPLOY_HOOK%"
)

if not "%HOOK%"=="" (
  echo Triggering Render deploy via hook...
  powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%HOOK%' -Method POST -UseBasicParsing ^| Out-Null; exit 0 } catch { Write-Error $_; exit 1 }"
  if errorlevel 1 (
    echo ❌ Failed to trigger Render deploy via hook.
    exit /b 1
  )
  echo ✅ Render deploy triggered.
) else (
  echo ℹ️ No Render deploy hook provided. Skipping service restart.
  echo    To auto-redeploy: pass the hook URL as the first argument or set RENDER_DEPLOY_HOOK.
)

echo ✅ Done.
exit /b 0


