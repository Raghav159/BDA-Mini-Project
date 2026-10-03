#!/usr/bin/env bash
# ==============================================================================
# BDA Mini Project — CLI Sales Burst Trigger Script
# ==============================================================================
# Triggers intraday sales burst for a given product via FastAPI POST /api/burst.
#
# Usage:
#   bash scripts/demo_burst.sh [product_id] [multiplier] [duration_seconds]
#
# Example:
#   bash scripts/demo_burst.sh 24852 10 60
# ==============================================================================

PRODUCT_ID="${1:-24852}"
MULTIPLIER="${2:-10}"
DURATION_SECONDS="${3:-60}"
API_URL="${API_URL:-http://localhost:8000/api/burst}"

echo "=== Triggering Demo Sales Burst ==="
echo "Product ID       : ${PRODUCT_ID}"
echo "Multiplier       : ${MULTIPLIER}x"
echo "Duration (sec)   : ${DURATION_SECONDS}s"
echo "Target Endpoint  : ${API_URL}"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -d "{\"product_id\": ${PRODUCT_ID}, \"multiplier\": ${MULTIPLIER}, \"duration_seconds\": ${DURATION_SECONDS}}")

BODY=$(echo "${RESPONSE}" | sed -e 's/HTTP_STATUS:.*//g')
STATUS=$(echo "${RESPONSE}" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

if [ "${STATUS}" -eq 200 ]; then
    echo "✅ Sales burst signal successfully sent!"
    echo "Response: ${BODY}"
else
    echo "❌ Failed to send sales burst signal (HTTP status: ${STATUS})"
    echo "Response: ${BODY}"
    exit 1
fi
