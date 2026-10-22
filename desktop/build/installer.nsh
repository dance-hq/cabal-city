; Windows installer additions (electron-builder runs customInstall after the app
; files and shortcuts are in place, before it relaunches Cabal).
;
; Until 0.1.x the app was Cabal.exe. Discord's game list registers cabal.exe as
; the MMORPG "CABAL Online", so Discord drew its game overlay over Cabal and told
; friends you were playing it. The app is now cabal-desktop.exe. An update keeps
; the existing Start menu, desktop and taskbar shortcuts, which still point at the
; deleted Cabal.exe (and the relaunch after an update goes through the Start menu
; shortcut), so point any that exist at the new file.

!macro cabalRepointShortcut link
  ${if} ${FileExists} "${link}"
    CreateShortCut "${link}" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "${link}" "${APP_ID}"
  ${endIf}
!macroend

!macro customInstall
  !insertmacro cabalRepointShortcut "$newStartMenuLink"
  !insertmacro cabalRepointShortcut "$newDesktopLink"
  !insertmacro cabalRepointShortcut "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk"
  ; Normally gone already (the old version's uninstaller removes it).
  Delete "$INSTDIR\Cabal.exe"
  Delete "$INSTDIR\Uninstall Cabal.exe"
  ClearErrors
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
