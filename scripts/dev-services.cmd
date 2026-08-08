@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

echo.
echo === Paashupatastra: free ports 3000-3007 ===
call "%~dp0\stop-services.cmd"
timeout /t 1 >nul

echo.
echo === Starting microservices ===
start "paashupatastra-auth" cmd /k "cd /d ""%~dp0\.."" && npm run dev:auth"
start "paashupatastra-users" cmd /k "cd /d ""%~dp0\.."" && npm run dev:users"
start "paashupatastra-communities" cmd /k "cd /d ""%~dp0\.."" && npm run dev:communities"
start "paashupatastra-parking" cmd /k "cd /d ""%~dp0\.."" && npm run dev:parking"
start "paashupatastra-payments" cmd /k "cd /d ""%~dp0\.."" && npm run dev:payments"
start "paashupatastra-notifications" cmd /k "cd /d ""%~dp0\.."" && npm run dev:notifications"
start "paashupatastra-tanker" cmd /k "cd /d ""%~dp0\.."" && npm run dev:tanker"

echo Waiting for services before gateway...
timeout /t 3 >nul

start "paashupatastra-gateway" cmd /k "cd /d ""%~dp0\.."" && npm run dev:gateway"

echo.
echo Services launching in separate windows.
echo Gateway: http://localhost:3000
echo To stop all: scripts\stop-services.cmd
echo.
endlocal
