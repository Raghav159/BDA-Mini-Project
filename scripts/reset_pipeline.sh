#!/usr/bin/env bash
# ==============================================================================
# BDA Mini Project — Pipeline State & Cluster Reset Script
# ==============================================================================
# Resets the pipeline to batch #1 by:
#   1. Clearing state files (ranking_state.json, ranking_output.json, etc.)
#   2. Clearing HDFS window and output directories (if Hadoop is running)
#   3. Optionally resetting Kafka topic
# ==============================================================================

set -e
export MSYS_NO_PATHCONV=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${PROJECT_ROOT}/state"

echo "======================================================================"
echo " 🧹 Resetting BDA Mini Project State & Batches..."
echo "======================================================================"

# 1. Clear local state directory (preserving .gitkeep)
echo "[1/3] Clearing local state files in ${STATE_DIR}..."
find "${STATE_DIR}" -type f ! -name ".gitkeep" -delete 2>/dev/null || true
echo "  -> Local ranking state reset to window 0."

# 2. Clear HDFS windows and outputs if container is running
echo "[2/3] Checking HDFS storage..."
if docker ps --format '{{.Names}}' | grep -q "^bda-hadoop$"; then
    echo "  -> Cleaning HDFS /bda-project/windows/ and /bda-project/output/..."
    docker exec bda-hadoop hdfs dfs -rm -r -f /bda-project/windows/* 2>/dev/null || true
    docker exec bda-hadoop hdfs dfs -rm -r -f /bda-project/output/* 2>/dev/null || true
    echo "  -> HDFS window data cleared."
else
    echo "  -> bda-hadoop container not running, skipping HDFS cleanup."
fi

# 3. Clean logs
echo "[3/3] Truncating old logs..."
rm -f "${PROJECT_ROOT}/logs"/*.log 2>/dev/null || true

echo "======================================================================"
echo " ✅ Reset complete! Next run of ./run_demo.sh will start from Batch #1."
echo "======================================================================"
