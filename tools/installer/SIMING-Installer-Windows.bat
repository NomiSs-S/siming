@echo off
rem SIMING - installation et mise a jour (Windows). Double-cliquer ce fichier.
rem Chemin passe par une variable : un dossier avec une apostrophe ne casse pas la commande.
set "SIMING_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-Content -LiteralPath $env:SIMING_SELF -Raw; $i = $s.IndexOf('#' + 'POWERSHELL#'); Invoke-Expression $s.Substring($i)"
echo.
pause
exit /b
#POWERSHELL#
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = '__REPO__'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ''
Write-Host '  SIMING - installation / mise a jour' -ForegroundColor Cyan
Write-Host ''

function Get-InstalledVersion {
    $dirs = @(
        (Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.siming'),
        (Join-Path ${env:CommonProgramFiles(x86)} 'Adobe\CEP\extensions\com.siming'),
        (Join-Path $env:CommonProgramFiles 'Adobe\CEP\extensions\com.siming')
    )
    foreach ($d in $dirs) {
        $m = Join-Path $d 'CSXS\manifest.xml'
        if (Test-Path -LiteralPath $m) {
            $x = [xml](Get-Content -LiteralPath $m -Raw)
            return $x.ExtensionManifest.ExtensionBundleVersion
        }
    }
    return $null
}

$installed = Get-InstalledVersion
if ($installed) { Write-Host "  Version installee : $installed" } else { Write-Host '  SIMING n''est pas encore installe.' }

try {
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases?per_page=100" -Headers @{ 'User-Agent' = 'SIMING-Installer'; 'Accept' = 'application/vnd.github+json' }
} catch {
    Write-Host "  Impossible de joindre GitHub : $($_.Exception.Message)" -ForegroundColor Red
    return
}

$list = @()
foreach ($r in $releases) {
    if ($r.draft) { continue }
    if ($r.prerelease) { continue }
    $asset = $r.assets | Where-Object { $_.name -like '*.zxp' } | Select-Object -First 1
    if (-not $asset) { continue }
    $note = ''
    if ($r.body) { $note = ($r.body -split "`n")[0].Trim() }
    $list += [pscustomobject]@{ Tag = $r.tag_name; Url = $asset.browser_download_url; Name = $asset.name; Note = $note }
}
if ($list.Count -eq 0) { Write-Host '  Aucune version publiee pour le moment.' -ForegroundColor Yellow; return }

Write-Host ''
Write-Host '  Versions disponibles :'
for ($i = 0; $i -lt $list.Count; $i++) {
    $label = $list[$i].Tag
    if ($i -eq 0) { $label += '  (derniere)' }
    Write-Host ('    {0}) {1}   {2}' -f ($i + 1), $label, $list[$i].Note)
}
Write-Host ''
$answer = Read-Host '  Entree = derniere version, ou tape un numero'
$index = 0
if ($answer -match '^\d+$') { $index = [int]$answer - 1 }
if ($index -lt 0 -or $index -ge $list.Count) { Write-Host '  Numero inconnu.' -ForegroundColor Red; return }
$choice = $list[$index]

$tmp = Join-Path $env:TEMP $choice.Name
Write-Host "  Telechargement de $($choice.Tag)..."
try {
    Invoke-WebRequest -Uri $choice.Url -OutFile $tmp -UseBasicParsing -Headers @{ 'User-Agent' = 'SIMING-Installer' }
} catch {
    Write-Host "  Telechargement impossible : $($_.Exception.Message)" -ForegroundColor Red
    return
}

while (Get-Process -Name 'AfterFX' -ErrorAction SilentlyContinue) {
    Read-Host '  After Effects est ouvert : ferme-le, puis appuie sur Entree' | Out-Null
}

$upia = Join-Path $env:CommonProgramFiles 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
if (-not (Test-Path -LiteralPath $upia)) {
    Write-Host '  Installeur Adobe (UPIA) introuvable : Creative Cloud est-il installe ?' -ForegroundColor Red
    Write-Host "  Solution de secours : installe $tmp avec ZXP Installer (gratuit) : https://aescripts.com/learn/zxp-installer/"
    return
}
Write-Host '  Installation...'
try {
    & $upia /install $tmp
} catch {
    Write-Host "  L'installeur Adobe n'a pas pu etre lance : $($_.Exception.Message)" -ForegroundColor Red
    return
}
if ($LASTEXITCODE -ne 0) { Write-Host "  L'installeur Adobe a renvoye le code $LASTEXITCODE." -ForegroundColor Red; return }
Write-Host ''
Write-Host "  SIMING $($choice.Tag) installe. Ouvre After Effects > Fenetre > Extensions > SIMING." -ForegroundColor Green
