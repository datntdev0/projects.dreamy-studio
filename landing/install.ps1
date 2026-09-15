$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repository = 'datntdev0/projects.dreamy-studio'
$ProductName = 'Dreamy Studio'
$FolderName = 'DreamyStudio'
$ExecutableName = 'DreamyStudio.exe'
$ConfigName = 'DreamyStudio.config'

function Write-Step([string] $Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Platform {
  if ($env:OS -ne 'Windows_NT') { throw "$ProductName only supports Windows." }
  if (-not [Environment]::Is64BitOperatingSystem) { throw "$ProductName requires 64-bit Windows." }
  foreach ($tool in @('curl.exe', 'tar.exe')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
      throw "$tool was not found. Windows 10 version 1803 or later is required."
    }
  }
}

function Get-LatestTag {
  $latest = "https://github.com/$Repository/releases/latest"
  $resolved = & curl.exe --fail --location --silent --show-error --head --output NUL --write-out '%{url_effective}' $latest
  if ($LASTEXITCODE -ne 0 -or $resolved -notmatch '/releases/tag/(?<tag>[^/?#]+)$') {
    throw "Could not find the latest release of $Repository."
  }
  return $Matches.tag
}

function Get-PortableAssetName([string] $Tag) {
  return "DreamyStudio-$($Tag.TrimStart('v'))-win-x64-portable.zip"
}

function Save-ReleaseFile([string] $Tag, [string] $Name, [string] $Destination) {
  $uri = "https://github.com/$Repository/releases/download/$Tag/$Name"
  & curl.exe --fail --location --silent --show-error --output $Destination $uri
  if ($LASTEXITCODE -ne 0) { throw "Download of $Name failed with curl exit code $LASTEXITCODE." }
}

function Assert-Checksum([string] $Path, [string] $ChecksumPath) {
  $expected = ((Get-Content -Path $ChecksumPath -Raw).Trim() -split '\s+')[0]
  $actual = (Get-FileHash -Path $Path -Algorithm SHA256).Hash
  if ($actual -ne $expected) { throw "SHA-256 mismatch: expected $expected, got $actual." }
  Write-Host '    SHA-256 verified.'
}

function Stop-RunningApp([string] $InstallDir) {
  $prefix = $InstallDir.TrimEnd('\') + '\'
  $running = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) }
  if (-not $running) { return }
  Write-Step "Closing running $ProductName"
  $running | Stop-Process -Force
  $running | Wait-Process -Timeout 30 -ErrorAction SilentlyContinue
}

function Expand-Package([string] $Archive, [string] $Parent, [string] $InstallDir) {
  $config = Join-Path $InstallDir $ConfigName
  $savedConfig = if (Test-Path $config) { Get-Content -Path $config -Raw } else { $null }
  New-Item -ItemType Directory -Path $Parent -Force | Out-Null
  & tar.exe -x -f $Archive -C $Parent
  if ($LASTEXITCODE -ne 0) { throw "Extraction failed with tar exit code $LASTEXITCODE." }
  if ($null -ne $savedConfig) { Set-Content -Path $config -Value $savedConfig -NoNewline }
}

function New-Shortcut([string] $Path, [string] $Target) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $Target
  $shortcut.WorkingDirectory = Split-Path $Target
  $shortcut.IconLocation = "$Target,0"
  $shortcut.Save()
}

function Install-Shortcuts([string] $Executable) {
  $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) "$ProductName.lnk"
  $desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) "$ProductName.lnk"
  New-Shortcut -Path $startMenu -Target $Executable
  New-Shortcut -Path $desktop -Target $Executable
}

function Install-DreamyStudio {
  Assert-Platform

  Write-Step 'Looking up the latest release'
  $tag = Get-LatestTag
  $assetName = Get-PortableAssetName $tag
  Write-Host "    ${tag}: $assetName"

  $parent = Join-Path $env:LOCALAPPDATA 'Programs'
  $installDir = Join-Path $parent $FolderName
  $workDir = Join-Path ([IO.Path]::GetTempPath()) ("dreamy-studio-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $workDir -Force | Out-Null

  try {
    $archive = Join-Path $workDir $assetName
    $checksum = "$archive.sha256"
    Write-Step "Downloading $assetName"
    Save-ReleaseFile -Tag $tag -Name $assetName -Destination $archive
    Save-ReleaseFile -Tag $tag -Name "$assetName.sha256" -Destination $checksum
    Assert-Checksum -Path $archive -ChecksumPath $checksum

    Stop-RunningApp -InstallDir $installDir
    Write-Step "Installing to $installDir"
    Expand-Package -Archive $archive -Parent $parent -InstallDir $installDir
  } finally {
    Remove-Item -Path $workDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  $executable = Join-Path $installDir $ExecutableName
  if (-not (Test-Path $executable)) { throw "$ExecutableName was not found after extraction." }

  Write-Step 'Creating shortcuts'
  Install-Shortcuts -Executable $executable

  Write-Host ''
  Write-Host "$ProductName $tag is installed." -ForegroundColor Green
  Write-Host 'Open it from the Start menu or the desktop shortcut.'
}

Install-DreamyStudio
