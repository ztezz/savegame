param(
  [Parameter(Mandatory = $false)]
  [string]$ApiBaseUrl = "https://thzi-luugame.hf.space",

  [Parameter(Mandatory = $false)]
  [int]$PollIntervalSeconds = 5,

  [Parameter(Mandatory = $false)]
  [int]$RequestTimeoutSeconds = 30,

  [Parameter(Mandatory = $false)]
  [string]$ServiceName = "CloudSaveRestoreAgent",

  [Parameter(Mandatory = $false)]
  [string]$NssmPath = "nssm"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
  Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Ensure-Path([string]$PathValue) {
  if (-not (Test-Path $PathValue)) {
    New-Item -ItemType Directory -Path $PathValue -Force | Out-Null
  }
}

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = Join-Path $ScriptRoot ".venv\Scripts\python.exe"
$AgentScript = Join-Path $ScriptRoot "restore_agent.py"
$LogDir = Join-Path $ScriptRoot "logs"
$StdOutLog = Join-Path $LogDir "agent.out.log"
$StdErrLog = Join-Path $LogDir "agent.err.log"

if (-not (Test-Path $PythonExe)) {
  throw "Không tìm thấy Python virtual environment tại: $PythonExe. Hãy tạo .venv và cài dependencies trước."
}
if (-not (Test-Path $AgentScript)) {
  throw "Không tìm thấy file agent: $AgentScript"
}

Ensure-Path $LogDir

& $NssmPath install $ServiceName $PythonExe $AgentScript --headless
& $NssmPath set $ServiceName AppDirectory $ScriptRoot
& $NssmPath set $ServiceName AppStdout $StdOutLog
& $NssmPath set $ServiceName AppStderr $StdErrLog
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName Start SERVICE_AUTO_START

& $NssmPath set $ServiceName AppEnvironmentExtra "API_BASE_URL=$ApiBaseUrl" "POLL_INTERVAL_SECONDS=$PollIntervalSeconds" "REQUEST_TIMEOUT_SECONDS=$RequestTimeoutSeconds"

Write-Info "Đã cấu hình service $ServiceName"
Start-Service -Name $ServiceName
Write-Host "\n=== Hoàn tất ===" -ForegroundColor Green
Write-Host "Service:  $ServiceName"
Write-Host "Stdout:   $StdOutLog"
Write-Host "Stderr:   $StdErrLog"
