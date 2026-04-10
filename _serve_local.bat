@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0_serve_local.ps1"
pause
