@echo off
cd /d "%~dp0backend"
start http://localhost:8000
python app.py