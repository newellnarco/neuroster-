@echo off
REM install-task.cmd — register a hidden Scheduled Task that keeps this clone
REM synced with GitHub by running update-neuroster.vbs every 15 minutes.
REM Double-click to install (or run from a terminal). Re-run to change the interval.
setlocal
set "TASK=Neuroster Auto-Update"
set "VBS=%~dp0update-neuroster.vbs"
set "INTERVAL=15"

schtasks /Create /TN "%TASK%" /TR "wscript.exe \"%VBS%\"" /SC MINUTE /MO %INTERVAL% /F
if errorlevel 1 (
  echo.
  echo Could not create the task. Try again from an Administrator terminal.
  goto :eof
)
echo.
echo Installed "%TASK%" - runs hidden every %INTERVAL% minutes, while you are logged on.
echo   Run it now : schtasks /Run /TN "%TASK%"
echo   See log    : type "%~dp0..\..\update-log.txt"
echo   Uninstall  : schtasks /Delete /TN "%TASK%" /F
endlocal
