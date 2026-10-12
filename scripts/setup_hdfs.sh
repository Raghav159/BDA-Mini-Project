#!/usr/bin/env bash
set -e

# Disable MSYS/MinGW path conversion on Windows so Docker paths like /bda-project aren't mangled
export MSYS_NO_PATHCONV=1

# Setup HDFS for BDA Mini Project

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONTAINER_NAME="bda-hadoop"

echo "=== Verifying HDFS Availability ==="

if command -v hdfs &> /dev/null; then
    echo "Using local hdfs CLI..."
    USE_DOCKER_HDFS=0
    RUN_PUT_FILE() {
        local src="$1"
        local dst="$2"
        hdfs dfs -put -f "$src" "$dst"
    }
else
    echo "Using docker exec with container '${CONTAINER_NAME}'..."
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "Error: Docker container '${CONTAINER_NAME}' is not running." >&2
        exit 1
    fi
    USE_DOCKER_HDFS=1
    RUN_PUT_FILE() {
        local src="$1"
        local dst="$2"
        cat "$src" | docker exec -i "${CONTAINER_NAME}" hdfs dfs -put -f - "$dst"
    }
fi

# Wrapper: calls hdfs dfs directly (never via variable) to avoid MINGW path-conversion hang
run_hdfs() {
    if [ "${USE_DOCKER_HDFS}" = "1" ]; then
        docker exec "${CONTAINER_NAME}" hdfs dfs "$@"
    else
        hdfs dfs "$@"
    fi
}

# Verify HDFS accessibility with retry loop
HDFS_READY=0
for attempt in {1..15}; do
    if [ "${USE_DOCKER_HDFS}" = "1" ]; then
        if docker exec "${CONTAINER_NAME}" hdfs dfs -ls / > /dev/null 2>&1; then
            HDFS_READY=1
            break
        fi
    else
        if hdfs dfs -ls / > /dev/null 2>&1; then
            HDFS_READY=1
            break
        fi
    fi
    sleep 2
done

if [ "$HDFS_READY" -ne 1 ]; then
    echo "Error: Unable to connect to HDFS after 30s. Is HDFS running?" >&2
    exit 1
fi
echo "HDFS is available."

echo "=== Creating HDFS Directories ==="
run_hdfs -mkdir -p /bda-project/
run_hdfs -mkdir -p /bda-project/windows/
run_hdfs -mkdir -p /bda-project/output/
run_hdfs -mkdir -p /bda-project/mapreduce/

echo "=== Uploading Mapper and Reducer ==="
RUN_PUT_FILE "${PROJECT_ROOT}/mapreduce/mapper.py" "/bda-project/mapreduce/mapper.py"
RUN_PUT_FILE "${PROJECT_ROOT}/mapreduce/reducer.py" "/bda-project/mapreduce/reducer.py"

echo "=== Uploading Synthetic Test Data ==="
RUN_PUT_FILE "${PROJECT_ROOT}/tests/test_data/synthetic_transactions.tsv" "/bda-project/synthetic_transactions.tsv"

echo "=== Verifying HDFS Uploads ==="
run_hdfs -ls /bda-project/
run_hdfs -ls /bda-project/mapreduce/

echo "HDFS setup completed successfully."
