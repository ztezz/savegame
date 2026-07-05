param(
  [Parameter(Mandatory = $false)]
  [int]$PollIntervalSeconds = 5,

  [Parameter(Mandatory = $false)]
  [int]$RequestTimeoutSeconds = 30,

  [Parameter(Mandatory = $false)]
  [string]$TaskName = "CloudSaveRestoreAgent"
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
$RunnerScript = Join-Path $ScriptRoot "run-agent.ps1"
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

$runnerContent = @"
`$ErrorActionPreference = 'Stop'
`$env:POLL_INTERVAL_SECONDS = '$PollIntervalSeconds'
`$env:REQUEST_TIMEOUT_SECONDS = '$RequestTimeoutSeconds'

Set-Location '$ScriptRoot'
& '$PythonExe' '$AgentScript' '--headless' 1>> '$StdOutLog' 2>> '$StdErrLog'
"@

Set-Content -Path $RunnerScript -Value $runnerContent -Encoding UTF8
Write-Info "Đã tạo runner script: $RunnerScript"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File \"$RunnerScript\""
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType InteractiveToken -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {
  # Ignore if task does not exist
}

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings | Out-Null
Write-Info "Đã đăng ký Task Scheduler: $TaskName"

Start-ScheduledTask -TaskName $TaskName
Write-Info "Đã start task nền."
Write-Host "\n=== Hoàn tất ===" -ForegroundColor Green
Write-Host "TaskName: $TaskName"
Write-Host "Stdout:   $StdOutLog"
Write-Host "Stderr:   $StdErrLog"
