#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$taskName = 'PayTimePro Sync Agent'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
Write-Host 'Scheduled task removed. Agent files remain under ProgramData for recovery.' -ForegroundColor Yellow
