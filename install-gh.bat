@echo off
REM Installs GitHub CLI (gh) on Windows.
REM SAFE: only downloads and installs the official GitHub CLI.
REM It does NOT log in, does NOT touch your project, does NOT push anything.
REM
REM Method 1 (preferred): winget
REM Method 2 (fallback): official MSI from GitHub releases
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Installing GitHub CLI
echo ============================================================
echo.

set GH_EXE=
if exist "%ProgramFiles%\GitHub CLI\gh.exe" set GH_EXE=%ProgramFiles%\GitHub CLI\gh.exe
if not defined GH_EXE if exist "%ProgramFiles(x86)%\GitHub CLI\gh.exe" set GH_EXE=%ProgramFiles(x86)%\GitHub CLI\gh.exe
if not defined GH_EXE if exist "%LocalAppData%\Programs\GitHub CLI\gh.exe" set GH_EXE=%LocalAppData%\Programs\GitHub CLI\gh.exe

if defined GH_EXE (
  echo [OK] Already installed at: %GH_EXE%
  goto :verify
)

echo [Step 1] Trying winget ...
where winget >nul 2>&1
if errorlevel 1 (
  echo        winget not available. Skipping to manual download.
  goto :manual
)

winget install --id GitHub.cli --exact --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity
if exist "%ProgramFiles%\GitHub CLI\gh.exe" set GH_EXE=%ProgramFiles%\GitHub CLI\gh.exe
if not defined GH_EXE if exist "%LocalAppData%\Programs\GitHub CLI\gh.exe" set GH_EXE=%LocalAppData%\Programs\GitHub CLI\gh.exe
if defined GH_EXE goto :verify

:manual
echo.
echo [Step 2] winget failed. Downloading the official installer instead.
echo         Source: https://github.com/cli/cli/releases/latest
echo.
set MSI=%TEMP%\gh_windows_x64.msi
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-WebRequest -Uri 'https://github.com/cli/cli/releases/latest/download/gh_windows_x64.msi' -OutFile '%MSI%' -UseBasicParsing; Write-Host '  Downloaded OK' } catch { Write-Host '  Download failed:' $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :failed
if not exist "%MSI%" goto :failed

echo.
echo Installing the MSI (a UAC prompt may appear - click Yes) ...
msiexec /i "%MSI%" /quiet /norestart
if exist "%ProgramFiles%\GitHub CLI\gh.exe" set GH_EXE=%ProgramFiles%\GitHub CLI\gh.exe
if not defined GH_EXE if exist "%LocalAppData%\Programs\GitHub CLI\gh.exe" set GH_EXE=%LocalAppData%\Programs\GitHub CLI\gh.exe
del "%MSI%" >nul 2>&1
if defined GH_EXE goto :verify

:failed
echo.
echo [FAILED] Could not install automatically.
echo.
echo Please do it manually - it takes 1 minute:
echo   1. Open: https://github.com/cli/cli/releases/latest
echo   2. Download the file named windows_x64.msi
echo   3. Double click it, click Next / Install
echo   4. Close and reopen cmd, then run: gh --version
echo.
pause
exit /b 1

:verify
echo.
echo ============================================================
echo   INSTALL OK
echo   Installed at: %GH_EXE%
echo.
echo   Close this window, open a NEW cmd window, and run:
echo.
echo       gh auth login
echo.
echo   Then choose: GitHub.com - HTTPS - Login with a web browser
echo ============================================================
echo.
pause
