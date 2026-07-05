@echo off
setlocal

cd /d "%~dp0"

echo Building CloudSave Agent...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-exe.ps1" -OutputName Cloudsave

if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Build completed successfully.
echo Output: %~dp0dist\Cloudsave.exe
pause
