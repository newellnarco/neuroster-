' update-neuroster.vbs — silently sync the local clone with GitHub.
' Runs completely hidden (no console window flashes). Designed to be launched by
' Windows Task Scheduler on an interval. Place this under <repo>\scripts\windows\ ;
' it figures out the repo root as two folders above itself, so there is no path to
' hard-code. All git output is appended (with a timestamp) to <repo>\update-log.txt.
Option Explicit
Dim fso, sh, here, repo, logFile, q, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

here    = fso.GetParentFolderName(WScript.ScriptFullName)         ' ...\scripts\windows
repo    = fso.GetParentFolderName(fso.GetParentFolderName(here))  ' repo root
logFile = repo & "\update-log.txt"
q = Chr(34)                                                       ' a literal double-quote

' Fetch, force onto main, and hard-reset to the published tip. reset --hard only
' touches TRACKED files, so an untracked .env / update-log.txt is preserved.
cmd = "cmd /c ( echo. & echo === %DATE% %TIME% === & " & _
      "git -C " & q & repo & q & " fetch --prune origin & " & _
      "git -C " & q & repo & q & " checkout -f main & " & _
      "git -C " & q & repo & q & " reset --hard origin/main ) >> " & q & logFile & q & " 2>&1"

' 0 = hidden window; True = wait for completion.
sh.Run cmd, 0, True
