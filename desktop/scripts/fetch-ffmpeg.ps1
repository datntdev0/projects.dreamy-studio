param(
    [string]$Archive = "",
    [string]$Url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$triple = "x86_64-pc-windows-msvc"
$binaries = Join-Path $PSScriptRoot "..\binaries"
$target = Join-Path $binaries "ffmpeg-$triple.exe"
New-Item -ItemType Directory -Force -Path $binaries | Out-Null

if (Test-Path $target) {
    Write-Output "ffmpeg sidecar already present: $target"
    exit 0
}

$downloaded = $false
if ($Archive -eq "") {
    $Archive = Join-Path ([System.IO.Path]::GetTempPath()) "dreamy-ffmpeg-$([guid]::NewGuid()).zip"
    Invoke-WebRequest -Uri $Url -OutFile $Archive
    $downloaded = $true
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
    $entry = $zip.Entries | Where-Object { $_.FullName -match "/bin/ffmpeg\.exe$" } | Select-Object -First 1
    if ($null -eq $entry) { throw "bin/ffmpeg.exe was not found in $Archive" }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
} finally {
    $zip.Dispose()
    if ($downloaded) { Remove-Item -Force $Archive }
}

Write-Output "ffmpeg sidecar installed: $target"
