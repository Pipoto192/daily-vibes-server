@echo off
echo.
echo ========================================
echo   Daily Vibes Flutter Server
echo ========================================
echo.

REM Node.js prüfen
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [FEHLER] Node.js ist nicht installiert!
    echo Bitte installiere Node.js von https://nodejs.org/
    pause
    exit /b 1
)

REM Dependencies prüfen
if not exist "node_modules\" (
    echo [INFO] Installiere Dependencies...
    call npm install
    echo.
)

REM Server starten
echo [START] Starte Server...
echo.
node server.js

pause
