@echo off
setlocal EnableExtensions
echo Stopping Paashupatastra listeners on ports 3000-3007...

powershell -NoProfile -Command ^
  "$ports = 3000,3001,3002,3003,3004,3005,3006,3007;" ^
  "foreach ($p in $ports) {" ^
  "  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |" ^
  "    Select-Object -ExpandProperty OwningProcess -Unique |" ^
  "    ForEach-Object {" ^
  "      Write-Host ('Killing PID {0} on port {1}' -f $_, $p);" ^
  "      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue" ^
  "    }" ^
  "}"

echo Done.
endlocal
