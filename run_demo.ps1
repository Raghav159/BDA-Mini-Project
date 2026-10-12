# ==============================================================================
# BDA Mini Project — Complete System Demonstration Startup Script (Windows PowerShell)
# ==============================================================================
# Starts all required pipeline infrastructure and services in order:
#   1. Docker containers (Kafka + Hadoop)
#   2. HDFS Directory Setup & Mapper/Reducer Initialization
#   3. Kafka Producer (Instacart Streaming Simulation)
#   4. Kafka Consumer & Window Orchestrator (HDFS + MapReduce + Ranking)
#   5. FastAPI Serving Layer
#   6. React + Vite Frontend Dashboard
# ==============================================================================

$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }
$LogDir = Join-Path $ProjectRoot "logs"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " 🚀 BDA Mini Project — Intraday Sales Velocity Analytics Demo" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Environment Configuration
$EnvFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $EnvFile)) {
    $EnvDemo = Join-Path $ProjectRoot ".env.demo"
    $EnvExample = Join-Path $ProjectRoot ".env.example"
    if (Test-Path $EnvDemo) {
        Write-Host "[1/6] Initializing .env configuration from .env.demo..." -ForegroundColor Yellow
        Copy-Item $EnvDemo $EnvFile
    } elseif (Test-Path $EnvExample) {
        Write-Host "[1/6] Initializing .env configuration from .env.example..." -ForegroundColor Yellow
        Copy-Item $EnvExample $EnvFile
    }
} else {
    Write-Host "[1/6] Using existing .env configuration..." -ForegroundColor Green
}

# 2. Check and start Docker infrastructure
Write-Host "[2/6] Starting Docker containers (Kafka + Hadoop)..." -ForegroundColor Yellow
docker compose -f (Join-Path $ProjectRoot "docker-compose.yml") up -d

Write-Host "Waiting for Kafka and Hadoop DataNode to initialize..." -ForegroundColor Gray
$dockerReady = $false
for ($i = 1; $i -le 30; $i++) {
    $hadoopStatus = (docker inspect --format='{{.State.Health.Status}}' bda-hadoop 2>$null)
    $kafkaStatus = (docker inspect --format='{{.State.Health.Status}}' bda-kafka 2>$null)
    if ($hadoopStatus -eq "healthy" -and $kafkaStatus -eq "healthy") {
        Write-Host "Docker infrastructure is healthy and ready!" -ForegroundColor Green
        $dockerReady = $true
        break
    }

    $hadoopState = (docker inspect --format='{{.State.Status}}' bda-hadoop 2>$null)
    $kafkaState = (docker inspect --format='{{.State.Status}}' bda-kafka 2>$null)
    if ($hadoopState -eq "running" -and $kafkaState -eq "running" -and $i -gt 10) {
        Write-Host "Docker containers running, proceeding..." -ForegroundColor Green
        $dockerReady = $true
        break
    }
    Start-Sleep -Seconds 2
}

if (-not $dockerReady) {
    Write-Host "Warning: Containers still starting. Proceeding with setup..." -ForegroundColor Yellow
}

# Clear HDFS safemode
docker exec bda-hadoop hdfs dfsadmin -safemode leave 2>$null | Out-Null

# 3. Initialize HDFS
Write-Host "[3/6] Setting up HDFS directories and uploading scripts..." -ForegroundColor Yellow
docker exec bda-hadoop hdfs dfs -mkdir -p /bda-project/windows | Out-Null
docker exec bda-hadoop hdfs dfs -mkdir -p /bda-project/output | Out-Null
docker exec bda-hadoop hdfs dfs -mkdir -p /bda-project/mapreduce | Out-Null

# Put mapper & reducer from the mounted /opt/mapreduce directory
docker exec bda-hadoop hdfs dfs -put -f /opt/mapreduce/mapper.py /bda-project/mapreduce/mapper.py
docker exec bda-hadoop hdfs dfs -put -f /opt/mapreduce/reducer.py /bda-project/mapreduce/reducer.py

# Put synthetic transactions if present
$synthData = Join-Path $ProjectRoot "tests\test_data\synthetic_transactions.tsv"
if (Test-Path $synthData) {
    Get-Content -Raw $synthData | docker exec -i bda-hadoop hdfs dfs -put -f - /bda-project/synthetic_transactions.tsv
}
Write-Host "HDFS setup complete." -ForegroundColor Green

# 4. Detect Python
$PythonExe = $null
if (Test-Path (Join-Path $ProjectRoot "venv\Scripts\python.exe")) {
    $PythonExe = Join-Path $ProjectRoot "venv\Scripts\python.exe"
} elseif (Test-Path (Join-Path $ProjectRoot ".venv\Scripts\python.exe")) {
    $PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
} else {
    $PythonExe = "python"
}
Write-Host "[4/6] Using Python executable: $PythonExe" -ForegroundColor Cyan

# Prepare process tracking for clean shutdown
$processes = @()

function Cleanup-All {
    Write-Host "`n======================================================================" -ForegroundColor Yellow
    Write-Host " 🛑 Shutting down BDA Mini Project background services..." -ForegroundColor Yellow
    Write-Host "======================================================================" -ForegroundColor Yellow
    foreach ($p in $processes) {
        if ($p -and -not $p.HasExited) {
            Write-Host "Stopping $($p.ProcessName) (PID: $($p.Id))..." -ForegroundColor Gray
            try {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    }
    Write-Host "All demo processes stopped cleanly." -ForegroundColor Green
}

try {
    # 4a. Start Kafka Producer
    Write-Host "  -> Launching Kafka Producer..." -ForegroundColor Yellow
    $prodLog = Join-Path $LogDir "producer.log"
    $pProducer = Start-Process -FilePath $PythonExe -ArgumentList "-m producer.producer" `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $prodLog -RedirectStandardError $prodLog `
        -PassThru -NoNewWindow
    $processes += $pProducer

    # 4b. Start Kafka Consumer & Window Orchestrator
    Write-Host "  -> Launching Kafka Consumer & Window Orchestrator..." -ForegroundColor Yellow
    $consLog = Join-Path $LogDir "consumer.log"
    $pConsumer = Start-Process -FilePath $PythonExe -ArgumentList "-m consumer.consumer" `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $consLog -RedirectStandardError $consLog `
        -PassThru -NoNewWindow
    $processes += $pConsumer

    # 4c. Start FastAPI Backend
    Write-Host "  -> Launching FastAPI Backend (http://localhost:8000)..." -ForegroundColor Yellow
    $apiLog = Join-Path $LogDir "api.log"
    $pApi = Start-Process -FilePath $PythonExe -ArgumentList "-m uvicorn api.main:app --host 0.0.0.0 --port 8000" `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $apiLog -RedirectStandardError $apiLog `
        -PassThru -NoNewWindow
    $processes += $pApi

    # Wait for FastAPI
    Write-Host "Waiting for FastAPI backend to respond..." -ForegroundColor Gray
    for ($i = 1; $i -le 15; $i++) {
        try {
            $resp = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -TimeoutSec 2 -ErrorAction Stop
            if ($resp.status -eq "ok") {
                Write-Host "FastAPI backend is live!" -ForegroundColor Green
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    # 5. Start Frontend
    Write-Host "[5/6] Launching React Frontend Dashboard (http://localhost:5173)..." -ForegroundColor Yellow
    $frontendDir = Join-Path $ProjectRoot "frontend"
    if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
        Write-Host "  -> Installing frontend dependencies (npm install)..." -ForegroundColor Gray
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm install" -WorkingDirectory $frontendDir -Wait -NoNewWindow
    }

    $frontLog = Join-Path $LogDir "frontend.log"
    $pFrontend = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev -- --host 0.0.0.0 --port 5173" `
        -WorkingDirectory $frontendDir `
        -RedirectStandardOutput $frontLog -RedirectStandardError $frontLog `
        -PassThru -NoNewWindow
    $processes += $pFrontend

    Write-Host "Waiting for Frontend to respond..." -ForegroundColor Gray
    for ($i = 1; $i -le 15; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:5173" -TimeoutSec 2 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                Write-Host "Frontend Dashboard is live!" -ForegroundColor Green
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    # 6. Display Operational Summary
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host " 🎉 BDA MINI PROJECT DEMO IS LIVE AND RUNNING!" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host " 🌐 Dashboard UI  : http://localhost:5173" -ForegroundColor White
    Write-Host " ⚡ FastAPI API    : http://localhost:8000" -ForegroundColor White
    Write-Host " 🩺 Health Check  : http://localhost:8000/api/health" -ForegroundColor White
    Write-Host " 📊 Live Rankings : http://localhost:8000/api/rankings" -ForegroundColor White
    Write-Host ""
    Write-Host " 📂 Logs Directory: $LogDir" -ForegroundColor Cyan
    Write-Host "    - Producer   : Get-Content $LogDir\producer.log -Wait" -ForegroundColor Gray
    Write-Host "    - Consumer   : Get-Content $LogDir\consumer.log -Wait" -ForegroundColor Gray
    Write-Host "    - API        : Get-Content $LogDir\api.log -Wait" -ForegroundColor Gray
    Write-Host "    - Frontend   : Get-Content $LogDir\frontend.log -Wait" -ForegroundColor Gray
    Write-Host ""
    Write-Host " Press Ctrl+C at any time to cleanly terminate all services." -ForegroundColor Magenta
    Write-Host "======================================================================" -ForegroundColor Green

    # Keep script open while background processes are running
    while ($true) {
        # Check if consumer or producer crashed
        if ($pConsumer.HasExited) {
            Write-Host "Warning: Consumer process exited. Check logs at $consLog" -ForegroundColor Red
            break
        }
        Start-Sleep -Seconds 2
    }
}
finally {
    Cleanup-All
}
