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
# Modele lance depuis le depot (pas rempli par release.js) : depot lu dans tools.json.
if ($Repo -eq ('__' + 'REPO__')) {
    try {
        $json = Join-Path (Split-Path -Parent $env:SIMING_SELF) '..\..\extension\client\tools.json'
        $Repo = (Get-Content -LiteralPath $json -Raw -Encoding UTF8 | ConvertFrom-Json).repository
    } catch {
        Write-Host '  Installeur non prepare : prends celui de la page des versions sur GitHub.' -ForegroundColor Red
        return
    }
}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Le .zxp signe est extrait tel quel dans le dossier des extensions de l'utilisateur : After Effects
# le charge (signature verifiee), sans droits administrateur. Plus d'UPIA : il passe par l'application
# Creative Cloud, echoue si on n'y est pas connecte (status -631) et sort quand meme avec le code 0.
$UserDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$Target = Join-Path $UserDir 'com.siming'
# Ou UPIA installait SIMING jusqu'a la 1.3.1 : une copie la-bas ferait deux SIMING.
$SystemTargets = @(
    (Join-Path ${env:CommonProgramFiles(x86)} 'Adobe\CEP\extensions\com.siming'),
    (Join-Path $env:CommonProgramFiles 'Adobe\CEP\extensions\com.siming')
) | Select-Object -Unique

Write-Host ''
Write-Host '  SIMING - installation / mise a jour' -ForegroundColor Cyan
Write-Host ''

function Get-InstalledVersion {
    foreach ($d in @($Target) + $SystemTargets) {
        $m = Join-Path $d 'CSXS\manifest.xml'
        if (Test-Path -LiteralPath $m) {
            try {
                $x = [xml](Get-Content -LiteralPath $m -Raw)
                return $x.ExtensionManifest.ExtensionBundleVersion
            } catch { return '?' }
        }
    }
    return $null
}

# Jonction ou lien (installation de developpement) : on ne retire que le lien, jamais son contenu.
function Remove-SimingFolder([string]$path) {
    $item = Get-Item -LiteralPath $path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        cmd /c rmdir "$path" | Out-Null
        if (Test-Path -LiteralPath $path) { throw "lien de developpement impossible a retirer : $path" }
        Write-Host '  Lien de developpement retire (tools\dev-install.bat pour le remettre).'
    } else {
        Remove-Item -LiteralPath $path -Recurse -Force
    }
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

# Fichiers ouverts par After Effects : impossible de les remplacer tant qu'il tourne.
while (Get-Process -Name 'AfterFX' -ErrorAction SilentlyContinue) {
    $go = Read-Host '  After Effects est ouvert : ferme-le, puis appuie sur Entree (q = abandonner)'
    if ($go -eq 'q') { return }
}

Write-Host '  Installation...'
$new = Join-Path $UserDir ('com.siming.new-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
try {
    New-Item -ItemType Directory -Force -Path $UserDir | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($tmp, $new)
    if (-not (Test-Path -LiteralPath (Join-Path $new 'CSXS\manifest.xml'))) { throw 'fichier telecharge incomplet (pas de CSXS\manifest.xml)' }
    if (-not (Test-Path -LiteralPath (Join-Path $new 'META-INF\signatures.xml'))) { throw 'extension non signee' }
    if (Test-Path -LiteralPath $Target) { Remove-SimingFolder $Target }
    Rename-Item -LiteralPath $new -NewName 'com.siming'
} catch {
    if (Test-Path -LiteralPath $new) { Remove-Item -LiteralPath $new -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host "  Installation impossible : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '  Ferme After Effects s''il est ouvert, puis relance l''installeur.'
    return
}
Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue

# Ancienne installation par UPIA (dossier systeme) : retiree, sinon After Effects verrait deux SIMING.
$left = @($SystemTargets | Where-Object { Test-Path -LiteralPath $_ })
if ($left.Count -gt 0) {
    $upia = Join-Path $env:CommonProgramFiles 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
    if (Test-Path -LiteralPath $upia) { try { & $upia /remove SIMING | Out-Null } catch {} }
    $left = @($SystemTargets | Where-Object { Test-Path -LiteralPath $_ })
}
if ($left.Count -gt 0) {
    Write-Host '  Une ancienne installation reste dans Program Files : Windows va demander l''autorisation de la retirer.'
    $paths = ($left | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ','
    try {
        Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', "Remove-Item -LiteralPath $paths -Recurse -Force"
    } catch {}
    $left = @($SystemTargets | Where-Object { Test-Path -LiteralPath $_ })
    if ($left.Count -gt 0) {
        Write-Host '  Ancienne installation toujours la : supprime ce dossier a la main :' -ForegroundColor Yellow
        $left | ForEach-Object { Write-Host "    $_" }
    }
}

Write-Host ''
Write-Host "  SIMING $($choice.Tag) installe. Ouvre After Effects > Fenetre > Extensions > SIMING." -ForegroundColor Green
