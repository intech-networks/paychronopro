#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$installPath = Join-Path $env:ProgramData 'PayTimePro Sync Agent'
$taskName = 'PayTimePro Sync Agent'
$sourcePath = $PSScriptRoot
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$apiUrl = Read-Host 'PayTimePro cloud URL (for example https://paytimepro.example.com)'
$agentId = Read-Host 'Agent ID [office-main]'; if ([string]::IsNullOrWhiteSpace($agentId)) { $agentId = 'office-main' }
$secret = Read-Host 'Agent secret (must match SYNC_AGENT_SECRET on the cloud server)'
if ([string]::IsNullOrWhiteSpace($apiUrl) -or [string]::IsNullOrWhiteSpace($secret)) { throw 'Cloud URL and agent secret are required.' }
New-Item -ItemType Directory -Path $installPath -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourcePath 'package.json') -Destination $installPath -Force
Copy-Item -LiteralPath (Join-Path $sourcePath 'package-lock.json') -Destination $installPath -Force
Copy-Item -LiteralPath (Join-Path $sourcePath 'src') -Destination $installPath -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sourcePath 'scripts') -Destination $installPath -Recurse -Force
Push-Location $installPath
try { & npm.cmd ci --omit=dev; if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' } } finally { Pop-Location }
@("PAYTIMEPRO_API_URL=$($apiUrl.TrimEnd('/'))","AGENT_ID=$agentId","AGENT_SECRET=$secret","POLL_INTERVAL_SECONDS=15") | Set-Content -LiteralPath (Join-Path $installPath '.env') -Encoding UTF8
$action = New-ScheduledTaskAction -Execute $nodePath -Argument 'src/index.js' -WorkingDirectory $installPath
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "PayTimePro Sync Agent installed and started at $installPath" -ForegroundColor Green
