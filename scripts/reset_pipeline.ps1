# BDA Mini Project — Pipeline State & Cluster Reset Script (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$StateDir = Join-Path $ProjectRoot "state"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " 🧹 Resetting BDA Mini Project State & Batches..." -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Clear state files
Write-Host "[1/3] Clearing local state files in $StateDir..." -ForegroundColor Yellow
Get-ChildItem -Path $StateDir -File | Where-Object { $_.Name -ne ".gitkeep" } | Remove-Item -Force
Write-Host "  -> Local ranking state reset to window 0." -ForegroundColor Green

# 2. Clear HDFS storage if container is running
Write-Host "[2/3] Checking HDFS storage..." -ForegroundColor Yellow
$hadoopRunning = docker ps --format '{{.Names}}' | Select-String -Pattern "^bda-hadoop$"
if ($hadoopRunning) {
    Write-Host "  -> Cleaning HDFS /bda-project/windows/ and /bda-project/output/..." -ForegroundColor Yellow
    docker exec bda-hadoop hdfs dfs -rm -r -f /bda-project/windows/* 2>$null
    docker exec bda-hadoop hdfs dfs -rm -r -f /bda-project/output/* 2>$null
    Write-Host "  -> HDFS window data cleared." -ForegroundColor Green
} else {
    Write-Host "  -> bda-hadoop container not running, skipping HDFS cleanup." -ForegroundColor Gray
}

# 3. Clean logs
Write-Host "[3/3] Truncating old logs..." -ForegroundColor Yellow
$LogsDir = Join-Path $ProjectRoot "logs"
if (Test-Path $LogsDir) {
    Get-ChildItem -Path $LogsDir -File | Remove-Item -Force -ErrorAction SilentlyContinue
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " ✅ Reset complete! Next run of ./run_demo.sh will start from Batch #1." -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
