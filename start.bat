@echo off
title Pannello di Controllo CosaFare
echo ========================================================
echo   Avvio Pannello di Controllo Amministratore CosaFare
echo ========================================================
echo.

cd /d "%~dp0"

REM Se Vite e' gia' installato, usalo
if exist "node_modules\vite" (
    echo [INFO] Avvio server di sviluppo Vite...
    start http://localhost:3000
    call npm run dev
    goto fine
)

REM Altrimenti avvia subito con Python HTTP Server (Zero attese, modulo CDN integrato)
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Avvio server locale con Python...
    echo [INFO] Apertura pannello su: http://localhost:3000
    echo [IMPORTANTE] Tieni aperta questa finestra per mantenere attivo il sito!
    echo.
    start http://localhost:3000
    python -m http.server 3000
    goto fine
)

REM Fallback Node/npm
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    if not exist "node_modules" (
        echo [INFO] Installazione pacchetti locali in corso...
        call npm install
    )
    start http://localhost:3000
    call npm run dev
    goto fine
)

REM Fallback browser
echo [INFO] Apertura diretta nel browser...
start index.html

:fine
pause
