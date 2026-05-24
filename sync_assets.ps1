# TravelSafe Static Web Assets Synchronizer Tool for Native Android Application
# Run this script whenever you update your HTML, CSS, or JS in public/

$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "public"
$dest = Join-Path $PSScriptRoot "android\app\src\main\assets\public"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  TRAVELSAFE WEB ASSETS SYNCHRONIZER TOOL" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Source directory: $src" -ForegroundColor DarkGray
Write-Host "Target directory: $dest" -ForegroundColor DarkGray

# 1. Clean out the target directory if it exists
if (Test-Path $dest) {
    Write-Host "Cleaning target directory..." -ForegroundColor DarkGray
    Remove-Item -Path "$dest\*" -Recurse -Force
} else {
    Write-Host "Creating target assets directory..." -ForegroundColor DarkGray
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
}

# 2. Copy all files recursively from public to android assets
Write-Host "Copying assets..." -ForegroundColor DarkGray
Copy-Item -Path "$src\*" -Destination $dest -Recurse -Force

Write-Host "SUCCESS: Web assets synchronized with Android project!" -ForegroundColor Green
Write-Host "You are now ready to compile or run the Android app." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
