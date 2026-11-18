@echo off
rem Installe Tomatoes Text pour l'utilisateur actuel (pas besoin des droits administrateur).
setlocal
cd /d "%~dp0"
set "DEST=%LOCALAPPDATA%\Programs"
set "ZIP=%TEMP%\TomatoesText-installation.zip"

echo.
echo  Installation de Tomatoes Text... (cela peut prendre une minute)
echo.

taskkill /im "Tomatoes Text.exe" /f >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$parts = Get-ChildItem -Filter 'TomatoesText.part*' | Sort-Object { [int]($_.Name -replace '\D','') };" ^
  "if (-not $parts) { throw 'Morceaux introuvables' };" ^
  "$out = [IO.File]::Create('%ZIP%'); foreach ($p in $parts) { $b = [IO.File]::ReadAllBytes($p.FullName); $out.Write($b, 0, $b.Length) }; $out.Close();" ^
  "New-Item -ItemType Directory -Force -Path '%DEST%' | Out-Null;" ^
  "if (Test-Path '%DEST%\Tomatoes Text') { Remove-Item -Recurse -Force '%DEST%\Tomatoes Text' };" ^
  "Expand-Archive -Force -Path '%ZIP%' -DestinationPath '%DEST%';" ^
  "$exe = Join-Path '%DEST%' 'Tomatoes Text\Tomatoes Text.exe';" ^
  "$sh = New-Object -ComObject WScript.Shell;" ^
  "foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {" ^
  "  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $dir 'Frame Text.lnk');" ^
  "  $lnk = $sh.CreateShortcut((Join-Path $dir 'Tomatoes Text.lnk'));" ^
  "  $lnk.TargetPath = $exe; $lnk.WorkingDirectory = Split-Path $exe; $lnk.IconLocation = $exe; $lnk.Save() }"
if errorlevel 1 goto :erreur

del "%ZIP%" >nul 2>&1
echo  C'est fait ! Tomatoes Text est installe.
echo  Un raccourci "Tomatoes Text" a ete ajoute sur le Bureau et dans le menu Demarrer.
echo.
start "" "%DEST%\Tomatoes Text\Tomatoes Text.exe"
pause
exit /b 0

:erreur
echo.
echo  Oups, l'installation n'a pas abouti. Verifiez que tous les fichiers TomatoesText.part...
echo  sont bien dans le meme dossier que ce fichier, et que Tomatoes Text est ferme, puis relancez-le.
echo.
pause
exit /b 1
