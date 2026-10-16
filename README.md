# BDA Mini Project — Real-Time Top-Selling Product & Intraday Momentum Ranking Engine

A distributed big data analytics pipeline that simulates real-time transaction streams from historical Instacart sales data, aggregates windowed product sales via Hadoop MapReduce, computes intraday momentum velocity metrics, and visualizes live product rankings on an interactive React dashboard.

---

## 🏗 Architecture Overview

```text
Instacart Dataset -> Kafka Producer -> Kafka (sales-events) -> Kafka Consumer (Window Orchestrator)
                                                                  -> HDFS Storage -> Hadoop Streaming MapReduce -> Ranking & Momentum Engine (Atomic JSON)
                                                                  -> FastAPI Serving Layer -> React + Vite Dashboard
```

1. **Kafka Producer (`producer/`):** Reads Instacart data incrementally, enriches sales events with metadata, and streams to Kafka topic `sales-events`. Supports rate-limiting and demo burst traffic injection.
2. **Kafka Consumer & Window Orchestrator (`consumer/`):** Groups incoming events into tumbling time windows, serialises window events to HDFS (`/bda-project/windows/`), and triggers MapReduce.
3. **Hadoop MapReduce (`mapreduce/`):** Python mappers & reducers running on Hadoop Streaming inside Docker (`bda-hadoop`) to count per-product units sold per window.
4. **Ranking & Momentum Engine (`engine/`):** Processes MapReduce reducer outputs, computes cumulative totals and intraday velocity change (\(((current - prev) / \max(prev, 1)) \times 100\)), and updates state files atomically (`state/ranking_output.json`).
5. **FastAPI Serving Layer (`api/`):** Serves `/api/health` and `/api/rankings`, and handles demo burst trigger requests at `POST /api/burst`.
6. **React Dashboard (`frontend/`):** Modern React + Vite dashboard displaying Top-10 cumulative products, Top-5 momentum movers, system health status, and live traffic burst trigger.

---

## 📥 Dataset Setup — Required Before Running

**The Instacart dataset is not included automatically with the project. You must download it separately and place the required CSV files in `datasets/instacart/` before running the system.**

The directory should contain the following files:

```text
datasets/
└── instacart/
    ├── aisles.csv
    ├── departments.csv
    ├── order_products__prior.csv
    ├── order_products__train.csv
    ├── orders.csv
    └── products.csv
```

1. Download the Instacart Market Basket Analysis dataset from its official Kaggle competition page: https://www.kaggle.com/competitions/instacart-market-basket-analysis/data
2. Extract the downloaded CSV files.
3. Create the `datasets/instacart/` directory in the project root if it does not already exist.
4. Place all six required CSV files in `datasets/instacart/`.
5. Verify that the filenames and directory structure match the layout above.

**Important:** The project cannot run correctly if the required datasets are missing. The raw CSV files should remain in `datasets/instacart/` and should not be renamed or modified.

---

## 🚀 Quick Start (One Command)

Before launching the system for the first time, complete the dataset setup described above and ensure all project prerequisites are installed.

To launch the complete system end-to-end with a single command:

### In Git Bash or Linux:

```bash
./run_demo.sh
```

### In Windows Command Prompt (or Double-Click):

```cmd
run_demo.bat
```

### In Windows PowerShell:

```powershell
.\run_demo.ps1
```

### Access Endpoints

| Component | URL | Description |
|---|---|---|
| **React Dashboard** | [http://localhost:5173](http://localhost:5173) | Interactive Real-Time Dashboard UI |
| **FastAPI REST API** | [http://localhost:8000](http://localhost:8000) | REST API Serving Layer |
| **API Health Check** | [http://localhost:8000/api/health](http://localhost:8000/api/health) | System Health & Current Window ID |
| **API Rankings JSON** | [http://localhost:8000/api/rankings](http://localhost:8000/api/rankings) | Live Top-10 and Momentum Movers Data |

To cleanly terminate all running services, press `Ctrl+C` in the terminal.

---

## ⚡ Demo Sales Burst Trigger

To simulate an intraday traffic surge for a specific product during a demo:

```bash
# Usage: bash scripts/demo_burst.sh [product_id] [multiplier] [duration_seconds]
bash scripts/demo_burst.sh 24852 10 60
```

*(You can also trigger sales bursts directly from the UI widget on the dashboard.)*

---

## 🧪 Running Tests

Run the full unit and integration test suite (157 tests):

```bash
pytest
```

To run only integration tests:

```bash
pytest tests/test_integration.py -v
```

---

## 📁 Directory Structure

```text
.
├── api/                 # FastAPI backend server (main.py)
├── config/              # Centralized configuration (settings.py)
├── consumer/            # Kafka consumer & window orchestrator (consumer.py)
├── datasets/            # Downloaded Instacart CSV datasets (required; not included)
│   └── instacart/
├── engine/              # Ranking & momentum engine (ranking.py)
├── frontend/            # React + Vite dashboard UI
├── mapreduce/           # Hadoop Streaming mapper and reducer scripts
├── producer/            # Kafka event streaming producer (producer.py)
├── scripts/             # Helper scripts (setup_hdfs.sh, run_mapreduce.sh, demo_burst.sh, start_all.sh)
├── state/               # Runtime state & JSON output files (gitignored)
├── tests/               # Unit and integration test suite (157 tests)
├── architecture_spec.md # Master project architecture & implementation spec
├── DEMO.md              # Lab internal demonstration runbook
├── docker-compose.yml   # Docker infrastructure setup (Kafka + Hadoop)
├── README.md            # Main project documentation
├── run_demo.sh          # One-command reliable startup script
└── requirements.txt     # Python dependencies
```

---
