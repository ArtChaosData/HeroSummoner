@echo off
echo === HeroSummoner: Local Server ===
echo.
cd /d "%~dp0"

:: Try Python first
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Starting server on http://localhost:8765
    echo Press Ctrl+C to stop.
    echo.
    start "" "http://localhost:8765"
    python -m http.server 8765
    goto :end
)

python3 --version >nul 2>&1
if %errorlevel% == 0 (
    echo Starting server on http://localhost:8765
    echo Press Ctrl+C to stop.
    echo.
    start "" "http://localhost:8765"
    python3 -m http.server 8765
    goto :end
)

:: Try Node/npx
npx --version >nul 2>&1
if %errorlevel% == 0 (
    echo Starting server on http://localhost:8765
    echo Press Ctrl+C to stop.
    echo.
    start "" "http://localhost:8765"
    npx serve . -p 8765 --no-clipboard
    goto :end
)

echo ERROR: Python or Node.js not found.
echo Install Python from https://python.org or Node.js from https://nodejs.org
pause

:end
