param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("status", "start", "stop", "restart", "logs")]
  [string]$Action = "status",

  [Parameter(Mandatory = $false)]
  [string]$TaskName = "CloudSaveRestoreAgent",

  [Parameter(Mandatory = $false)]
  [string]$ServiceName = "CloudSaveRestoreAgent"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutLog = Join-Path $ScriptRoot "logs\agent.out.log"
$ErrLog = Join-Path $ScriptRoot "logs\agent.err.log"

function Try-GetTask {
  try {
    return Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  } catch {
    return $null
  }
}

function Try-GetService {
  try {
    return Get-Service -Name $ServiceName -ErrorAction Stop
  } catch {
    return $null
  }
}

$task = Try-GetTask
$service = Try-GetService

switch ($Action) {
  "status" {
    if ($service) {
      Write-Host "Service: $($service.Name) => $($service.Status)"
    } else {
      Write-Host "Service: not found"
    }

    if ($task) {
      $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
      Write-Host "Task:    $TaskName => State=$($taskInfo.State), LastRun=$($taskInfo.LastRunTime), LastResult=$($taskInfo.LastTaskResult)"
    } else {
      Write-Host "Task:    not found"
    }
  }

  "start" {
    if ($service) {
      Start-Service -Name $ServiceName
      Write-Host "Started service $ServiceName"
    } elseif ($task) {
      Start-ScheduledTask -TaskName $TaskName
      Write-Host "Started task $TaskName"
    } else {
      Write-Host "Không tìm thấy service/task để start"
      exit 1
    }
  }

  "stop" {
    if ($service) {
      Stop-Service -Name $ServiceName -Force
      Write-Host "Stopped service $ServiceName"
    } elseif ($task) {
      Stop-ScheduledTask -TaskName $TaskName
      Write-Host "Stopped task $TaskName"
    } else {
      Write-Host "Không tìm thấy service/task để stop"
      exit 1
    }
  }

  "restart" {
    if ($service) {
      Restart-Service -Name $ServiceName -Force
      Write-Host "Restarted service $ServiceName"
    } elseif ($task) {
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Start-ScheduledTask -TaskName $TaskName
      Write-Host "Restarted task $TaskName"
    } else {
      Write-Host "Không tìm thấy service/task để restart"
      exit 1
    }
  }

  "logs" {
    if (Test-Path $OutLog) {
      Write-Host "--- agent.out.log ---"
      Get-Content $OutLog -Tail 100
    } else {
      Write-Host "Không thấy $OutLog"
    }

    if (Test-Path $ErrLog) {
      Write-Host "--- agent.err.log ---"
      Get-Content $ErrLog -Tail 100
    } else {
      Write-Host "Không thấy $ErrLog"
    }
  }
}
