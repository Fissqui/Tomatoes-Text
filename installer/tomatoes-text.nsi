; Programme d'installation de Tomatoes Text pour Windows 10 et 11 (un seul fichier .exe).
; Fabriqué par scripts/build-windows.js : makensis -DVERSION=… -DSOURCE=<dossier du logiciel> -DSORTIE=<.exe> -DICONE=<.ico>
; Installation pour l'utilisateur actuel, sans droits d'administrateur, dans %LOCALAPPDATA%\Programs\Tomatoes Text.
; La désinstallation (Paramètres > Applications) garde les documents et les réglages.

Unicode true
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!define NOM "Tomatoes Text"
!define EXE "Tomatoes Text.exe"
!define DESINSTALLEUR "Desinstaller Tomatoes Text.exe"
!define CLE "Software\Microsoft\Windows\CurrentVersion\Uninstall\TomatoesText"

Name "${NOM}"
OutFile "${SORTIE}"
InstallDir "$LOCALAPPDATA\Programs\${NOM}"
RequestExecutionLevel user
ShowInstDetails nevershow
ShowUninstDetails nevershow
BrandingText "${NOM} ${VERSION}"

!define MUI_ICON "${ICONE}"
!define MUI_UNICON "${ICONE}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "Ce programme installe ${NOM} ${VERSION} sur cet ordinateur.$\r$\n$\r$\nAucun droit d'administrateur n'est nécessaire.$\r$\n$\r$\nCliquez sur Suivant pour l'installer."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer ${NOM}"
!define MUI_UNCONFIRMPAGE_TEXT_TOP "${NOM} va être retiré de cet ordinateur. Vos documents et vos réglages sont conservés."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_FRENCH} "ProductName" "${NOM}"
VIAddVersionKey /LANG=${LANG_FRENCH} "FileDescription" "Installation de ${NOM}"
VIAddVersionKey /LANG=${LANG_FRENCH} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_FRENCH} "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_FRENCH} "CompanyName" "${NOM}"
VIAddVersionKey /LANG=${LANG_FRENCH} "LegalCopyright" ""

; Tomatoes Text doit être fermé pour remplacer ses fichiers.
!macro AttendreFermeture un
Function ${un}AttendreFermeture
  boucle:
    nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq ${EXE}" /NH | find /I "${EXE}"'
    Pop $0
    Pop $1
    ${If} $0 == 0
      ${If} ${Silent}
        nsExec::Exec 'taskkill /IM "${EXE}" /F'
        Sleep 1500
        Return
      ${EndIf}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${NOM} est ouvert. Enregistrez votre travail, fermez ${NOM}, puis cliquez sur Réessayer." IDRETRY boucle
      Abort
    ${EndIf}
FunctionEnd
!macroend
!insertmacro AttendreFermeture ""
!insertmacro AttendreFermeture "un."

Section "Installation"
  SetShellVarContext current
  Call AttendreFermeture
  ; Dossier propre au logiciel : l'ancienne version est retirée avant la copie.
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  SetOutPath "$INSTDIR"
  File /r "${SOURCE}\*.*"
  WriteUninstaller "$INSTDIR\${DESINSTALLEUR}"

  CreateShortcut "$DESKTOP\${NOM}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$SMPROGRAMS\${NOM}.lnk" "$INSTDIR\${EXE}"

  ; Paramètres > Applications.
  WriteRegStr HKCU "${CLE}" "DisplayName" "${NOM}"
  WriteRegStr HKCU "${CLE}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${CLE}" "Publisher" "${NOM}"
  WriteRegStr HKCU "${CLE}" "DisplayIcon" "$INSTDIR\${EXE},0"
  WriteRegStr HKCU "${CLE}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CLE}" "UninstallString" '"$INSTDIR\${DESINSTALLEUR}"'
  WriteRegStr HKCU "${CLE}" "QuietUninstallString" '"$INSTDIR\${DESINSTALLEUR}" /S'
  WriteRegDWORD HKCU "${CLE}" "NoModify" 1
  WriteRegDWORD HKCU "${CLE}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${CLE}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Call un.AttendreFermeture
  Delete "$DESKTOP\${NOM}.lnk"
  Delete "$SMPROGRAMS\${NOM}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${CLE}"
  ; LanguageTool téléchargé depuis le menu Édition (src/languagetool.js).
  RMDir /r "$LOCALAPPDATA\${NOM}\LanguageTool"
  RMDir "$LOCALAPPDATA\${NOM}"

  ; Documents .tmtx : association et menu Nouveau posés par le logiciel (src/main.js, registerFileType).
  ReadRegStr $0 HKCU "Software\Classes\.tmtx" ""
  ${If} $0 == "TomatoesText.Document"
    DeleteRegKey HKCU "Software\Classes\.tmtx"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.ftxt" ""
  ${If} $0 == "TomatoesText.Document"
    DeleteRegKey HKCU "Software\Classes\.ftxt"
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\TomatoesText.Document"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\Discardable\PostSetup\ShellNew"
  ; Une réinstallation refera l'association.
  Delete "$APPDATA\${NOM}\association.json"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
