@echo off
title Vani-Setu - ASL Translator
cd /d "%~dp0backend"

echo ============================================
echo   Vani-Setu - starting server...
echo ============================================
echo.

REM Pick python or py, whichever exists
where python >nul 2>nul && (set PY=python) || (set PY=py)

REM Open the app in the default browser once the server is up.
REM The ?t=%RANDOM% forces the browser to load a fresh copy (no old cache).
start "" "http://localhost:8000/?t=%RANDOM%"

echo Opening http://localhost:8000 in your browser...
echo Keep this window OPEN while using the app. Press Ctrl+C to stop.
echo.

%PY% app.py
pause
