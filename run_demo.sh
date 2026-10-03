#!/usr/bin/env bash
# ==============================================================================
# BDA Mini Project — Complete System Demonstration Startup Script
# ==============================================================================
# Starts all required pipeline infrastructure and services in order:
#   1. Docker containers (Kafka + Hadoop)
#   2. HDFS Directory Setup & Mapper/Reducer Uploads
#   3. Kafka Producer (Instacart Streaming Simulation)
#   4. Kafka Consumer & Window Orchestrator (HDFS + MapReduce + Ranking)
#   5. FastAPI Serving Layer
#   6. React + Vite Frontend Dashboard
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}"
LOG_DIR="${PROJECT_ROOT}/logs"

mkdir -p "${LOG_DIR}"

echo "======================================================================"
echo " 🚀 BDA Mini Project — Intraday Sales Velocity Analytics Demo"
echo "======================================================================"

# 1. Environment Setup
if [ ! -f "${PROJECT_ROOT}/.env" ]; then
    if [ -f "${PROJECT_ROOT}/.env.demo" ]; then
        echo "[1/6] Initializing .env configuration from .env.demo..."
        cp "${PROJECT_ROOT}/.env.demo" "${PROJECT_ROOT}/.env"
    elif [ -f "${PROJECT_ROOT}/.env.example" ]; then
        echo "[1/6] Initializing .env configuration from .env.example..."
        cp "${PROJECT_ROOT}/.env.example" "${PROJECT_ROOT}/.env"
    fi
else
    echo "[1/6] Using existing .env configuration..."
fi

# Function to kill existing background PIDs on exit
PIDS=()
cleanup() {
    echo ""
    echo "======================================================================"
    echo " 🛑 Shutting down BDA Mini Project Demo services..."
    echo "======================================================================"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "Stopping PID $pid..."
            kill -15 "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
        fi
    done
    echo "Shutdown complete. Goodbye!"
}
trap cleanup SIGINT SIGTERM EXIT

# 2. Check and start Docker infrastructure
echo "[2/6] Starting Docker containers (Kafka + Hadoop)..."
docker compose -f "${PROJECT_ROOT}/docker-compose.yml" up -d

echo "Waiting for Kafka and Hadoop DataNode to initialize..."
for i in {1..30}; do
    if docker exec bda-hadoop hdfs dfs -ls / >/dev/null 2>&1 && \
       docker exec bda-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list >/dev/null 2>&1; then
        echo "Docker infrastructure is ready!"
        break
    fi
    sleep 1
    if [ "$i" -eq 30 ]; then
        echo "Error: Docker containers failed to become ready in 30s." >&2
        exit 1
    fi
done

# Ensure HDFS DataNode safe mode is cleared
docker exec bda-hadoop hdfs dfsadmin -safemode leave || true

# 3. Initialize HDFS
echo "[3/6] Setting up HDFS directories and uploading scripts..."
bash "${PROJECT_ROOT}/scripts/setup_hdfs.sh" > "${LOG_DIR}/hdfs_setup.log" 2>&1

# 4. Start Pipeline Backend Services
echo "[4/6] Launching Python pipeline services..."

# Start Kafka Producer
echo "  -> Starting Kafka Producer..."
python3 -m producer.producer > "${LOG_DIR}/producer.log" 2>&1 &
PIDS+=($!)

# Start Kafka Consumer / Window Orchestrator
echo "  -> Starting Kafka Consumer & Window Orchestrator..."
python3 -m consumer.consumer > "${LOG_DIR}/consumer.log" 2>&1 &
PIDS+=($!)

# Start FastAPI Server
echo "  -> Starting FastAPI Backend (http://localhost:8000)..."
python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8000 > "${LOG_DIR}/api.log" 2>&1 &
PIDS+=($!)

# Wait for FastAPI health check
echo "Waiting for FastAPI backend to respond..."
for i in {1..15}; do
    if curl -s http://localhost:8000/api/health | grep -q '"status":"ok"'; then
        echo "FastAPI backend is live!"
        break
    fi
    sleep 1
    if [ "$i" -eq 15 ]; then
        echo "Warning: FastAPI health check timed out. Check logs at ${LOG_DIR}/api.log"
    fi
done

# 5. Start Frontend
echo "[5/6] Starting React Frontend Dashboard (http://localhost:5173)..."
(cd "${PROJECT_ROOT}/frontend" && npm run dev -- --host 0.0.0.0 --port 5173) > "${LOG_DIR}/frontend.log" 2>&1 &
PIDS+=($!)

echo "Waiting for Frontend to start..."
for i in {1..15}; do
    if curl -s http://localhost:5173 >/dev/null 2>&1; then
        echo "Frontend Dashboard is live!"
        break
    fi
    sleep 1
done

# 6. Display Operational Summary & Live Logs
echo "======================================================================"
echo " 🎉 BDA MINI PROJECT DEMO IS LIVE AND RUNNING!"
echo "======================================================================"
echo ""
echo " 🌐 Dashboard UI  : http://localhost:5173"
echo " ⚡ FastAPI API    : http://localhost:8000"
echo " 🩺 Health Check  : http://localhost:8000/api/health"
echo " 📊 Live Rankings : http://localhost:8000/api/rankings"
echo ""
echo " 📂 Logs Directory: ${LOG_DIR}"
echo "    - Producer   : tail -f ${LOG_DIR}/producer.log"
echo "    - Consumer   : tail -f ${LOG_DIR}/consumer.log"
echo "    - API        : tail -f ${LOG_DIR}/api.log"
echo "    - Frontend   : tail -f ${LOG_DIR}/frontend.log"
echo ""
echo " ⚡ Trigger Demo Burst Command:"
echo "    bash scripts/demo_burst.sh 24852 10 60"
echo ""
echo " Press Ctrl+C at any time to cleanly terminate all services."
echo "======================================================================"

# Keep script running to maintain child processes
wait
