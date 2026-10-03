# BDA Mini Project — Internal Lab Demo Runbook

**Real-Time Top-Selling Product & Intraday Momentum Ranking Engine**  
*Instacart Dataset Stream Processing Pipeline (Kafka → HDFS → MapReduce → FastAPI → React)*

---

## ⚡ Quick Start (One Command)

To launch the complete pipeline, backend services, and interactive dashboard with a single command:

```bash
./run_demo.sh
```

*(Alternatively: `bash scripts/start_all.sh`)*

### Access URLs

| Component | URL | Description |
|---|---|---|
| **Frontend Dashboard** | [http://localhost:5173](http://localhost:5173) | Interactive React + Vite Analytics UI |
| **FastAPI Backend** | [http://localhost:8000](http://localhost:8000) | REST API serving layer |
| **API Health Check** | [http://localhost:8000/api/health](http://localhost:8000/api/health) | System health & window status |
| **API Rankings JSON** | [http://localhost:8000/api/rankings](http://localhost:8000/api/rankings) | Raw ranking & momentum JSON payload |
| **HDFS NameNode UI** | [http://localhost:9870](http://localhost:9870) | Hadoop NameNode web interface |
| **YARN Manager UI** | [http://localhost:8088](http://localhost:8088) | YARN Resource Manager web interface |

To cleanly terminate all running services, press `Ctrl+C` in the terminal running `./run_demo.sh`.

---

## 📊 What the Dashboard Demonstrates

1. **Top-10 Products Ranking**:
   - Ranked continuously by total cumulative sales volume across all processed tumbling windows.
   - Shows product ID, product name, cumulative units, current window units, previous window units, and momentum %.

2. **Top-5 Intraday Momentum Movers**:
   - Identifies fast-accelerating products based on intraday velocity change between consecutive windows.
   - Formula:  
     $$\text{Momentum \%} = \frac{\text{current} - \text{previous}}{\max(\text{previous}, 1)} \times 100$$
   - Displays rank, growth percentage badge (`+X%` / `-X%`), and directional indicators (`UP` 🟢 / `DOWN` 🔴).

3. **Live Pipeline Health & Status**:
   - Displays backend connection state, current tumbling window ID, total windows processed, and polling countdown timer (auto-refreshes every 5 seconds).

4. **Demo Sales Burst Injection**:
   - Interactive UI widget and CLI script to inject traffic spikes into the Kafka producer, demonstrating real-time rank updates and momentum shifts during a live demo.

---

## 🎬 3–5 Minute Demonstration Sequence

### Step 1: Launch System (0:00 - 0:30)
1. Run `./run_demo.sh` in your terminal.
2. Wait for the green confirmation banner printing `http://localhost:5173`.
3. Open [http://localhost:5173](http://localhost:5173) in your browser.

### Step 2: Explain Baseline Dashboard (0:30 - 1:30)
1. Point out the **System Status Bar**: show connection status `ONLINE`, current window timestamp, and auto-refresh countdown.
2. Show the **Top-10 Ranking Table**: explain how Instacart transactions stream into Kafka, group into tumbling windows, run through Hadoop Streaming MapReduce, and calculate cumulative sales.
3. Show the **Top-5 Momentum Movers**: explain how intraday momentum detects sudden velocity changes even if a product isn't #1 overall yet.

### Step 3: Inject Simulated Traffic Burst (1:30 - 2:30)
1. In the **Demo Sales Burst Trigger** box on the right:
   - Select a product (e.g. `#24852 - Banana` or `#47209 - Organic Hass Avocado`).
   - Set multiplier to `10` (10x volume) and duration to `60` seconds.
   - Click **⚡ Trigger Sales Burst** (or run `bash scripts/demo_burst.sh 24852 10 60` in a terminal).
2. Observe the success feedback badge indicating Kafka traffic injection.

### Step 4: Verify Live Momentum Shift (2:30 - 4:00)
1. As the current tumbling window boundary crosses, the Window Orchestrator writes the window TSV to HDFS and triggers Hadoop MapReduce.
2. Within 5–10 seconds, the dashboard auto-refreshes:
   - Watch the targeted product surge in **Current Window Units**.
   - Notice the product jump to the top of **Top-5 Momentum Movers** with a large positive momentum percentage (e.g., `+900%`).

### Step 5: Architecture Wrap-Up (4:00 - 5:00)
- Highlight the end-to-end decoupling:
  - **Dataset Simulation**: Python Producer → Apache Kafka topic `sales-events`.
  - **Storage & Compute**: Kafka Consumer → HDFS `/bda-project/windows/` → Hadoop Streaming MapReduce (`mapper.py` / `reducer.py`).
  - **State & Serving**: Ranking Engine (`state/ranking_output.json`) → FastAPI (`/api/rankings`) → React UI.

---

## 🛠️ Manual Troubleshooting & Commands

If manual inspection or troubleshooting is needed during the lab demo:

| Task | Command |
|---|---|
| **Check API Health** | `curl http://localhost:8000/api/health` |
| **Check Rankings JSON** | `curl http://localhost:8000/api/rankings` |
| **Trigger CLI Burst** | `bash scripts/demo_burst.sh 24852 10 60` |
| **List HDFS Output Dirs** | `docker exec bda-hadoop hdfs dfs -ls /bda-project/output/` |
| **View HDFS Reducer Output** | `docker exec bda-hadoop hdfs dfs -cat /bda-project/output/window_<id>/part-00000` |
| **Consume Kafka Events** | `docker exec bda-kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic sales-events --from-beginning --max-messages 5` |
| **Tail Producer Log** | `tail -f logs/producer.log` |
| **Tail Consumer Log** | `tail -f logs/consumer.log` |
| **Tail API Log** | `tail -f logs/api.log` |
| **Run Complete Test Suite** | `pytest -v` |

---

## 🎯 Expected Results Summary

- **Single command execution**: `./run_demo.sh` cleanly orchestrates Docker infrastructure, HDFS initialization, Producer, Consumer, FastAPI server, and React frontend.
- **Zero data loss & safe recovery**: State files (`state/ranking_state.json` and `state/ranking_output.json`) are updated atomically via temp-file replacement.
- **Clean shutdown**: Ctrl+C cleanly terminates background processes without leaving zombie Python or Vite processes.
