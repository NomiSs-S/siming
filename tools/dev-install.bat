@echo off
setlocal
rem SIMING - installation de developpement (machine de l'auteur uniquement).
rem Active les extensions non signees (PlayerDebugMode), genere le manifeste
rem et relie le dossier extension\ au dossier des extensions CEP.
cd /d "%~dp0.."
for %%V in (11 12) do reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
node tools\manifest.js || goto :error
set "DEST=%APPDATA%\Adobe\CEP\extensions"
if not exist "%DEST%" mkdir "%DEST%"
rem Copie signee posee par l'installeur (META-INF absent du depot, donc jamais vu a travers
rem la jonction) : supprimee. Sinon une jonction : rmdir sans /s ne retire que le lien.
if exist "%DEST%\com.siming\META-INF\signatures.xml" rmdir /s /q "%DEST%\com.siming"
if exist "%DEST%\com.siming" rmdir "%DEST%\com.siming"
mklink /J "%DEST%\com.siming" "%CD%\extension" || goto :error
echo.
echo SIMING relie : %DEST%\com.siming
echo Relance After Effects, puis Fenetre ^> Extensions ^> SIMING.
pause
exit /b 0
:error
echo.
echo Echec de l'installation de developpement.
pause
exit /b 1
