@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" python -m venv --system-site-packages .venv
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 goto failed
".venv\Scripts\python.exe" backend\setup_speech.py
if errorlevel 1 goto failed
".venv\Scripts\python.exe" backend\setup_asl.py
if errorlevel 1 goto failed
echo Setup complete. Close the old server and start run.bat.
pause
exit /b 0
:failed
echo Setup failed. Check the error above and your internet connection.
pause
exit /b 1
