!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Tailshare"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Tailshare"
!macroend
