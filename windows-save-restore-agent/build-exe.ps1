#Requires -Version 5.1
param(
  [string]$OutputName = "Cloudsave"
)

$ErrorActionPreference = "Stop"

$ScriptRoot  = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentScript = Join-Path $ScriptRoot "restore_agent.py"
$VenvDir     = Join-Path $ScriptRoot ".venv"
$PythonExe   = Join-Path $VenvDir "Scripts\python.exe"
$DistDir     = Join-Path $ScriptRoot "dist"

function Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# 1. Find system Python
Step "Finding Python"
$pyCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pyCmd) { $pyCmd = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $pyCmd) { throw "Python not found. Install Python 3.10+ from https://python.org" }
Write-Host "  Using: $(& $pyCmd.Source --version) at $($pyCmd.Source)"

# 2. Create venv if missing
Step "Setting up virtual environment"
if (-not (Test-Path $PythonExe)) {
    Write-Host "  Creating .venv ..."
    & $pyCmd.Source -m venv $VenvDir
}
Write-Host "  .venv OK"

# 3. Install deps + PyInstaller (use python -m pip to avoid permission issue)
Step "Installing dependencies"
& $PythonExe -m pip install --quiet --upgrade pip 2>$null
& $PythonExe -m pip install --quiet -r (Join-Path $ScriptRoot "requirements.txt")
Write-Host "  Done"

# 4. Build
Step "Building exe with PyInstaller"
$iconPath = Join-Path $ScriptRoot "icon.ico"
$buildArgs = @(
    "-m", "PyInstaller"
    $AgentScript
    "--onefile"
  "--windowed"
    "--name",     $OutputName
    "--distpath", $DistDir
    "--workpath", (Join-Path $ScriptRoot "build\_work")
    "--specpath", (Join-Path $ScriptRoot "build")
    "--clean"
    "--noconfirm"
)
if (Test-Path $iconPath) {
    $iconAbsPath = (Resolve-Path $iconPath).Path
    Write-Host "  Using icon: $iconAbsPath"
    $buildArgs += "--icon"
    $buildArgs += $iconAbsPath
}
& $PythonExe @buildArgs

# 5. Verify
$exePath = Join-Path $DistDir "$OutputName.exe"
if (-not (Test-Path $exePath)) { throw "Build failed - exe not found: $exePath" }

# 6. Copy .env.example
Copy-Item (Join-Path $ScriptRoot ".env.example") (Join-Path $DistDir ".env.example") -Force

# 7. README
$guide = @"
=== CloudSave Restore Agent ===
No Python required on target machine.

SETUP:
  1. Copy this folder to target machine (e.g. C:\CloudSaveAgent\)
  2. Create .env file next to the exe with one line if you need to override the default API:
         API_BASE_URL=https://thzi-luugame.hf.space
  3. Run restore_agent.exe once - a desktop window will show DEVICE NAME and API KEY
  4. Finish the browser login/link flow
  5. After successful login, the app auto-hides to tray and shows toast notifications on sync success

RUN ON STARTUP (no extra software):
  Right-click exe > Create shortcut
  Win+R > shell:startup > move shortcut there

LOGS:
  restore_agent.exe >> agent.log 2>&1
"@
Set-Content (Join-Path $DistDir "README.txt") -Value $guide -Encoding ASCII

$sizeMB = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
Write-Host ""
Write-Host "BUILD SUCCESSFUL" -ForegroundColor Green
Write-Host "  exe  : $exePath  ($sizeMB MB)"
Write-Host "  dist : $DistDir"
