@echo off
REM ============================================================
REM  My AI Wardrobe - commit, push to PRIVATE repo, deploy to Vercel
REM
REM  Safe by design:
REM    - the GitHub repo is created PRIVATE, never public
REM    - a sensitive-file gate runs before anything is staged
REM    - it aborts on the first problem, nothing half-done
REM    - no API keys are printed or uploaded
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set REPO=my-ai-wardrobe
set GH=C:\Program Files\GitHub CLI\gh.exe
if not exist "%GH%" set GH=gh

echo.
echo ============================================================
echo   STEP 1/5  Stage files
echo ============================================================
git add -A
if errorlevel 1 (
  echo [ABORT] git add failed.
  goto :abort
)
echo staged.

echo.
echo ============================================================
echo   STEP 2/5  Sensitive file gate (checks the REAL staged list)
echo ============================================================
call node scripts\check-staged.mjs
if errorlevel 1 (
  echo.
  echo [ABORT] Something unsafe is staged. Nothing was committed or pushed.
  echo         Run "git reset" to unstage, then tell me.
  goto :abort
)

echo.
echo ============================================================
echo   STEP 3/5  Commit
echo ============================================================
git commit -m "My AI Wardrobe v1.0.0" > commit-output.txt 2>&1
if errorlevel 1 (
  findstr /C:"nothing to commit" commit-output.txt >nul
  if errorlevel 1 (
    echo [ABORT] Commit failed. See commit-output.txt
    type commit-output.txt
    goto :abort
  )
  echo [SKIP] Nothing to commit - already up to date.
) else (
  echo [OK] committed
)

echo.
echo ============================================================
echo   STEP 4/5  Push to PRIVATE GitHub repo
echo ============================================================
"%GH%" auth status > auth-output.txt 2>&1
if errorlevel 1 (
  echo [SKIP] gh is not logged in. Run: gh auth login
  goto :stopped
)

"%GH%" repo view %REPO% --json visibility > repo-check.txt 2>&1
if not errorlevel 1 (
  findstr /C:"PRIVATE" repo-check.txt >nul
  if errorlevel 1 (
    echo.
    echo [ABORT] Repo %REPO% exists but is NOT private. Refusing to push.
    echo         Fix it with: gh repo edit %REPO% --visibility private
    goto :abort
  )
  echo existing repo is PRIVATE
  "%GH%" repo sync %REPO% --source . --push > push-output.txt 2>&1
) else (
  echo creating a new PRIVATE repo ...
  "%GH%" repo create %REPO% --private --source=. --push --description "My AI Wardrobe - PWA wardrobe tracker with Supabase cloud sync" > push-output.txt 2>&1
)

if errorlevel 1 (
  echo [WARN] Push step reported an issue. See push-output.txt
  type push-output.txt
  goto :stopped
)
echo [OK] pushed

"%GH%" repo view %REPO% --json visibility,name,url
"%GH%" repo view %REPO% --json visibility > repo-check.txt 2>&1
findstr /C:"PRIVATE" repo-check.txt >nul
if errorlevel 1 (
  echo.
  echo [WARNING] Visibility is not PRIVATE. Fix with:
  echo            gh repo edit %REPO% --visibility private
) else (
  echo [OK] repository is PRIVATE
)

echo.
echo ============================================================
echo   STEP 5/5  Deploy to Vercel
echo ============================================================
echo This may ask you to log in the first time (browser window).
echo.
npx vercel --prod --yes > vercel-output.txt 2>&1
if errorlevel 1 (
  echo [WARN] Vercel deploy step reported an issue.
  echo        See vercel-output.txt
  type vercel-output.txt
  goto :stopped
)
echo [OK] deployed
findstr /R /C:"https://.*vercel.app" vercel-output.txt

echo.
echo ============================================================
echo   ALL DONE
echo ============================================================
echo.
pause
exit /b 0

:stopped
echo.
echo ============================================================
echo   STOPPED - see the output files above
echo ============================================================
echo.
pause
exit /b 1

:abort
echo.
echo ============================================================
echo   ABORTED - nothing was pushed or deployed
echo ============================================================
echo.
pause
exit /b 1
