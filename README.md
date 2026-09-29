# BDA Mini Project — Real-Time Top-Selling Product & Intraday Momentum Ranking Engine

A distributed big data pipeline that simulates real-time transaction streams from historical Instacart sales data, aggregates windowed product sales via Hadoop MapReduce, computes intraday momentum metrics, and visualizes live product rankings.

---

## 🏗 Architecture Overview

```
Instacart Dataset -> Kafka Producer -> Kafka (sales-events) -> Consumer
  -> HDFS Storage -> Hadoop Streaming MapReduce -> Ranking & Momentum Engine
  -> FastAPI REST Server -> React Dashboard
```

1. **Kafka Producer (`producer/`):** Reads Instacart data in memory-safe chunks, enriches sales events, and streams to Kafka topic `sales-events`.
2. **Hadoop MapReduce (`mapreduce/`):** Python mapper & reducer running on Hadoop Streaming to count per-product units sold per window.
3. **Configuration (`config/`):** Centralized `settings.py` reading environment variables from `.env`.

---

## 🚀 Quickstart

### 1. Requirements & Setup

- **Python:** 3.11+
- **Docker:** Engine & Compose
- **Dependencies:** Install Python requirements:
  ```bash
  pip install -r requirements.txt
  ```

### 2. Start Kafka Infrastructure

Start the Kafka broker container:

```bash
docker compose up -d kafka
```

Create the target topic:

```bash
docker exec bda-kafka /opt/kafka/bin/kafka-topics.sh --create --topic sales-events --partitions 3 --replication-factor 1 --bootstrap-server localhost:9092 --if-not-exists
```

### 3. Run the Kafka Producer

To test the producer in bounded mode (e.g. produce 100 messages):

```bash
python -m producer.producer --max-messages 100 --rate 50
```

To run dry-run mode without sending to Kafka:

```bash
python -m producer.producer --dry-run --max-messages 50
```

---

## 🧪 Running Tests

Run unit tests via `pytest`:

```bash
python -m pytest tests/ -v
```

---

## 📁 Directory Structure

```
.
├── config/              # Centralized configuration (settings.py)
├── datasets/            # Instacart raw CSV datasets
├── mapreduce/           # Hadoop Streaming mapper and reducer scripts
├── producer/            # Kafka event streaming producer
├── state/               # Runtime state files (gitignored)
├── tests/               # Unit and integration tests
├── architecture_spec.md # Master project specification & checklist
├── docker-compose.yml   # Infrastructure services configuration
├── README.md            # Project overview and instructions
└── requirements.txt     # Python dependencies
```
