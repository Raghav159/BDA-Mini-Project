#!/usr/bin/env bash
set -e

# Setup HDFS for BDA Mini Project

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONTAINER_NAME="bda-hadoop"

echo "=== Verifying HDFS Availability ==="

if command -v hdfs &> /dev/null; then
    echo "Using local hdfs CLI..."
    HDFS_CMD="hdfs dfs"
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
    HDFS_CMD="docker exec ${CONTAINER_NAME} hdfs dfs"
    RUN_PUT_FILE() {
        local src="$1"
        local dst="$2"
        cat "$src" | docker exec -i "${CONTAINER_NAME}" hdfs dfs -put -f - "$dst"
    }
fi

# Verify HDFS accessibility
if ! $HDFS_CMD -ls / > /dev/null 2>&1; then
    echo "Error: Unable to connect to HDFS. Is HDFS running?" >&2
    exit 1
fi
echo "HDFS is available."

echo "=== Creating HDFS Directories ==="
$HDFS_CMD -mkdir -p /bda-project/
$HDFS_CMD -mkdir -p /bda-project/windows/
$HDFS_CMD -mkdir -p /bda-project/output/
$HDFS_CMD -mkdir -p /bda-project/mapreduce/

echo "=== Uploading Mapper and Reducer ==="
RUN_PUT_FILE "${PROJECT_ROOT}/mapreduce/mapper.py" "/bda-project/mapreduce/mapper.py"
RUN_PUT_FILE "${PROJECT_ROOT}/mapreduce/reducer.py" "/bda-project/mapreduce/reducer.py"

echo "=== Uploading Synthetic Test Data ==="
RUN_PUT_FILE "${PROJECT_ROOT}/tests/test_data/synthetic_transactions.tsv" "/bda-project/synthetic_transactions.tsv"

echo "=== Verifying HDFS Uploads ==="
$HDFS_CMD -ls /bda-project/
$HDFS_CMD -ls /bda-project/mapreduce/

echo "HDFS setup completed successfully."
