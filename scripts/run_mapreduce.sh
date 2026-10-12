#!/usr/bin/env bash
set -e

# Disable MSYS/MinGW path conversion on Windows so Docker paths like /bda-project aren't mangled
export MSYS_NO_PATHCONV=1

# Run MapReduce on Hadoop Streaming for BDA Mini Project

INPUT_PATH="${1:-/bda-project/synthetic_transactions.tsv}"
OUTPUT_PATH="${2:-/bda-project/output/test}"

CONTAINER_NAME="bda-hadoop"

echo "=== Running MapReduce Job ==="
echo "Input HDFS Path : ${INPUT_PATH}"
echo "Output HDFS Path: ${OUTPUT_PATH}"

if command -v hadoop &> /dev/null && command -v hdfs &> /dev/null; then
    HDFS_CMD="hdfs dfs"
    HADOOP_CMD="hadoop"
else
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "Error: Docker container '${CONTAINER_NAME}' is not running." >&2
        exit 1
    fi
    HDFS_CMD="docker exec ${CONTAINER_NAME} hdfs dfs"
    HADOOP_CMD="docker exec ${CONTAINER_NAME} hadoop"
fi

# Locate Streaming JAR reliably inside container/environment
if command -v hadoop &> /dev/null; then
    STREAMING_JAR=$(find ${HADOOP_HOME:-/opt/hadoop}/share/hadoop/tools/lib -name "hadoop-streaming-*.jar" 2>/dev/null | head -n 1 | tr -d '\r')
else
    STREAMING_JAR=$(docker exec ${CONTAINER_NAME} find /opt/hadoop/share/hadoop/tools/lib -name "hadoop-streaming-*.jar" | head -n 1 | tr -d '\r')
fi

if [ -z "$STREAMING_JAR" ]; then
    echo "Error: Could not locate hadoop-streaming JAR file." >&2
    exit 1
fi
echo "Streaming JAR  : ${STREAMING_JAR}"

# Remove output directory if it already exists in HDFS
echo "Checking existing output directory..."
if $HDFS_CMD -test -d "$OUTPUT_PATH"; then
    echo "Removing existing HDFS output directory: ${OUTPUT_PATH}"
    $HDFS_CMD -rm -r -f "$OUTPUT_PATH"
fi

# Use full HDFS URIs so Hadoop Streaming distributes mapper and reducer from HDFS
HDFS_MAPPER_URI="hdfs://localhost:9000/bda-project/mapreduce/mapper.py"
HDFS_REDUCER_URI="hdfs://localhost:9000/bda-project/mapreduce/reducer.py"

echo "Submitting Hadoop Streaming Job..."
$HADOOP_CMD jar "${STREAMING_JAR}" \
  -files "${HDFS_MAPPER_URI},${HDFS_REDUCER_URI}" \
  -mapper "python3 mapper.py" \
  -reducer "python3 reducer.py" \
  -input "${INPUT_PATH}" \
  -output "${OUTPUT_PATH}"

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo "Error: MapReduce job failed with exit code $EXIT_CODE" >&2
    exit $EXIT_CODE
fi

echo "MapReduce job completed successfully."
