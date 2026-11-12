@echo off
rem Double-click to back up Auto Stock Manager's Supabase data to this PC. Reads from Supabase only; deletes nothing anywhere.
cd /d "%~dp0"
title Back up Auto Stock Manager
echo.
echo  Back up Auto Stock Manager's Supabase data
echo  -------------------------------------------
echo   1  BACKUP     all the data, plus any photos and documents not saved yet (the first time is about 1 GB)
echo   2  DATA ONLY  just the data (fast, about a minute)
echo   3  CHECK      checks that your newest backup is complete and not damaged
echo.
echo  Saved in your user folder, in AutoStockBackups. Nothing is ever deleted there or in Supabase.
echo  The data holds customers' details and password hashes: keep that folder private.
echo.
set choice=
set /p choice=Type 1, 2 or 3 and press Enter: 
echo.
if "%choice%"=="1" call :ensure & python tools/backup_supabase.py & goto done
if "%choice%"=="2" call :ensure & python tools/backup_supabase.py --no-files & goto done
if "%choice%"=="3" python tools/backup_supabase.py verify & goto done
echo That is not 1, 2 or 3 - nothing was done.
:done
echo.
pause
goto :eof
:ensure
python -c "import psycopg" 2>nul
if errorlevel 1 (
  echo Installing a small database add-on, one time only...
  python -m pip install --user "psycopg[binary]"
)
goto :eof
