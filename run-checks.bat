@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo   MY AI WARDROBE - FULL CHECK
echo   (all output is saved to files, read them for details)
echo ============================================================
echo.

echo [1/6] Verify backup zip
call node scripts\verify-backup.mjs > backup-output.txt 2>&1
echo      done - see backup-output.txt

echo [2/6] Unit tests
call npm run test > test-output.txt 2>&1
echo      done - see test-output.txt

echo [3/6] TypeScript type check
call npx tsc --noEmit > typecheck-output.txt 2>&1
echo      done - see typecheck-output.txt

echo [4/6] Production build
call npm run build > build-output.txt 2>&1
echo      done - see build-output.txt

echo [5/6] Git status
call git status --short > git-status.txt 2>&1
echo      done - see git-status.txt

echo [6/6] Sensitive files check
call node scripts\check-sensitive.mjs > sensitive-output.txt 2>&1
echo      done - see sensitive-output.txt

echo.
echo ============================================================
echo   ALL CHECKS FINISHED
echo   Files: backup-output / test-output / typecheck-output
echo          build-output / git-status / sensitive-output  (.txt)
echo ============================================================
echo.
