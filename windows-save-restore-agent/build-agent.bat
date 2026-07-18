@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

set "VERSION=%~1"
if not defined VERSION (
  for /f "tokens=2 delims== " %%V in ('findstr /r /c:"^AGENT_VERSION = " "%~dp0agent_version.py"') do set "VERSION=%%~V"
  set "VERSION=!VERSION:"=!"
)
if not defined VERSION set "VERSION=1.1.0"

echo.
echo === CloudSave Agent Builder ===
echo Current version: %VERSION%
set /p "INPUT_VERSION=Enter version, or press Enter to use %VERSION%: "
if defined INPUT_VERSION set "VERSION=%INPUT_VERSION%"

powershell.exe -NoProfile -Command "if ('%VERSION%' -notmatch '^\d+\.\d+\.\d+$') { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo.
  echo Invalid version. Use x.y.z, for example 1.2.3.
  pause
  exit /b 2
)

echo.
echo Building CloudSave Agent version %VERSION%...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-exe.ps1" -OutputName Cloudsave -Version "%VERSION%"

if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Build completed successfully.
echo Output: %~dp0dist\Cloudsave.exe
echo Manifest: %~dp0dist\Cloudsave.manifest.json
pause
