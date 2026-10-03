#!/usr/bin/env bash
# ==============================================================================
# BDA Mini Project — start_all.sh wrapper
# Calls the primary run_demo.sh script in the project root.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

exec bash "${PROJECT_ROOT}/run_demo.sh" "$@"
