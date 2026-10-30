# Release helper: tag, push, and publish a GitHub Release whose notes come from
# CHANGELOG.md. All output text lives in CHANGELOG.md, so this file stays ASCII
# only -- Windows PowerShell 5.1 decodes BOM-less files with the system codepage
# and breaks on non-ASCII source.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 2.1.0
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 2.1.0 -DryRun
#
# Prerequisites: clean working tree, package.json already at -Version, a
# "## [<version>]" section in CHANGELOG.md, and `gh` logged in.

param(
  [Parameter(Mandatory = $true)][string]$Version,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
# Keep Chinese preview readable on a legacy console. The notes file itself is
# always written as UTF-8 without BOM, so this only affects the terminal.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($message) {
  Write-Output "FAIL  $message"
  exit 1
}

# 1. Version must match package.json.
$pkg = Get-Content 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
if ($pkg.version -ne $Version) {
  Fail "package.json is $($pkg.version), expected $Version. Bump it first."
}

# 2. CHANGELOG must carry a section for this version.
$changelogPath = Join-Path $root 'CHANGELOG.md'
if (-not (Test-Path $changelogPath)) { Fail 'CHANGELOG.md is missing.' }
$changelog = Get-Content $changelogPath -Raw -Encoding UTF8
$pattern = '(?m)^## \[' + [regex]::Escape($Version) + '\][^\r\n]*\r?\n'
$match = [regex]::Match($changelog, $pattern)
if (-not $match.Success) { Fail "CHANGELOG.md has no '## [$Version]' section." }

$startIndex = $match.Index + $match.Length
$rest = $changelog.Substring($startIndex)
$next = [regex]::Match($rest, '(?m)^## \[')
$section = if ($next.Success) { $rest.Substring(0, $next.Index) } else { $rest }
$section = $section.Trim()

if ([string]::IsNullOrWhiteSpace($section)) { Fail "The [$Version] section is empty." }

$notes = $section

# 4. Working tree must be clean (skipped for a dry run).
if (-not $DryRun) {
  $status = (& git status --porcelain) | Out-String
  if ($status.Trim() -ne '') { Fail 'Working tree is not clean. Commit first.' }
}

# 5. Structural check and package build.
& node scripts/check-composition.cjs
if ($LASTEXITCODE -ne 0) { Fail 'check-composition.cjs reported findings.' }
& powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
if ($LASTEXITCODE -ne 0) { Fail 'build-package.ps1 failed.' }

$tag = "v$Version"

# 6. Tag.
if ($DryRun) {
  Write-Output ''
  Write-Output "DRY RUN: would push main and $tag, then create the GitHub release."
  Write-Output "DRY RUN: no tag, commit or release was touched."
  Write-Output '--- release notes preview ---'
  Write-Output $notes
  exit 0
}

$existing = (& git tag -l $tag) | Out-String
if ($existing.Trim() -ne '') {
  Write-Output "Tag $tag already exists locally; reusing it."
} else {
  & git tag -a $tag -m "v$Version"
  if ($LASTEXITCODE -ne 0) { Fail "Could not create tag $tag." }
}

# 7. Push commit and tag.
& git push origin main
if ($LASTEXITCODE -ne 0) { Fail 'git push main failed.' }
& git push origin $tag
if ($LASTEXITCODE -ne 0) { Fail "git push $tag failed." }

# 8. GitHub Release.
$notesFile = [System.IO.Path]::GetTempFileName()
try {
  [System.IO.File]::WriteAllText($notesFile, $notes, (New-Object System.Text.UTF8Encoding($false)))
  # Windows PowerShell 5.1 turns a native command's stderr into a terminating
  # error while ErrorActionPreference is Stop, so probe with Continue and read
  # the exit code instead.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & gh release view $tag 2>$null | Out-Null
  $exists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $previous
  if ($exists) {
    & gh release edit $tag --title $tag --notes-file $notesFile
    if ($LASTEXITCODE -ne 0) { Fail "gh release edit $tag failed." }
    Write-Output "Updated existing GitHub release $tag."
  } else {
    & gh release create $tag --title $tag --notes-file $notesFile
    if ($LASTEXITCODE -ne 0) { Fail "gh release create $tag failed." }
    Write-Output "Created GitHub release $tag."
  }
} finally {
  Remove-Item $notesFile -ErrorAction SilentlyContinue
}

Write-Output ''
Write-Output "Released $tag."
