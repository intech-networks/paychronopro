@echo off
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Requesting Administrator access...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo Starting PayTimePro Sync Agent...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-ScheduledTask -TaskName 'PayTimePro Sync Agent' -ErrorAction Stop"
if not "%errorlevel%"=="0" (
  echo.
  echo Failed to start PayTimePro Sync Agent.
  echo Confirm that the agent has been installed and the scheduled task exists.
  pause
  exit /b 1
)

echo.
echo PayTimePro Sync Agent started successfully.
echo It should appear Online in PayTimePro within approximately 15 seconds.
pause

