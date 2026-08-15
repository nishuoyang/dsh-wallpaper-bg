' WE API silent launcher - starts node server.js with no visible window
' Usage: double-click this file. Logs go to we-api.log in this folder.
Option Explicit
Dim fso, sh, dir
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("Wscript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "cmd /c node server.js >> we-api.log 2>&1", 0, False
