# Met en ligne la salle de jeux sur GitHub Pages.
# 1. Nouvelle version du cache hors connexion (pour que les téléphones récupèrent la mise à jour).
# 2. Commit de tous les changements, puis envoi sur GitHub (branche main) : GitHub Pages republie tout seul.
param([string]$Message = 'Mise à jour des jeux')

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$sw = Join-Path $root 'sw.js'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$swText = [IO.File]::ReadAllText($sw) -replace "const VERSION = '[^']*';", "const VERSION = 'salle-de-jeux-$stamp';"
[IO.File]::WriteAllText($sw, $swText, (New-Object Text.UTF8Encoding $false))

git add -A
git commit -m $Message --quiet
if ($LASTEXITCODE -ne 0) { throw 'Le commit a échoué.' }
git push origin main --quiet
if ($LASTEXITCODE -ne 0) { throw "L'envoi sur GitHub a échoué." }

$url = git remote get-url origin
if ($url -match 'github\.com[:/]([^/]+)/([^/.]+)') {
  $site = "https://$($Matches[1].ToLower()).github.io/$($Matches[2])/"
  Write-Host "Envoyé. En ligne dans environ 1 minute : $site"
} else { Write-Host 'Envoyé.' }
