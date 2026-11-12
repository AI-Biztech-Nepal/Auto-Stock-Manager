@echo off
rem TEMPORARY - double-click to run the move to Supabase. Delete this file when the move is finished.
cd /d "%~dp0"
title Move Auto Stock Manager to Supabase
echo.
echo  Move Auto Stock Manager's data to Supabase
echo  ------------------------------------------
echo   1  TEST      checks the connections only; copies and changes nothing
echo   2  COPY      BEFORE the switch only: copies photos and data and compares them (the app keeps using the old database)
echo   3  SWITCH    BEFORE the switch only: copies, compares, and ONLY IF everything matches makes the app use Supabase
echo   4  ROLLBACK  makes the app use the old database again
echo   5  SHOW LAST RESULT   shows what the server says happened in the last run; changes nothing
echo.
echo  NOTE: the app is now on Supabase. Do NOT use 2 or 3 again (they refuse). To save your data use backup-supabase.bat.
echo.
echo  Nothing is ever deleted from the old database.
echo.
set choice=
set /p choice=Type 1, 2, 3, 4 or 5 and press Enter: 
echo.
if "%choice%"=="1" python tools/run_migration.py test & goto done
if "%choice%"=="2" python tools/run_migration.py copy & goto done
if "%choice%"=="3" python tools/run_migration.py switch & goto done
if "%choice%"=="4" python tools/run_migration.py rollback & goto done
if "%choice%"=="5" python tools/run_migration.py log & goto done
echo That is not 1, 2, 3, 4 or 5 - nothing was done.
:done
echo.
echo  When it has finished, copy everything shown above and paste it to Claude (a copy is also saved in migration-last-run.txt). It contains no passwords.
echo.
pause
