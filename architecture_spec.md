# BDA Mini Project — Architecture & Implementation Specification

**Project:** Real-Time Top-Selling Product & Intraday Momentum Ranking Engine  
**Date:** 2026-09-27  
**Author:** Senior Architect Session  
**Consumer:** Gemini 3.6 Flash Medium (implementation agent)

---

## Table of Contents

1. [Dataset Inspection](#1-dataset-inspection)
2. [Dataset Comparison](#2-dataset-comparison)
3. [Selected Dataset](#3-selected-dataset)
4. [Dataset Limitations and Assumptions](#4-dataset-limitations-and-assumptions)
5. [Final Architecture](#5-final-architecture)
6. [Complete Data Flow](#6-complete-data-flow)
7. [Kafka Design](#7-kafka-design)
8. [HDFS Design](#8-hdfs-design)
9. [MapReduce Design](#9-mapreduce-design)
10. [Windowing Design](#10-windowing-design)
11. [Momentum Design](#11-momentum-design)
12. [Ranking Design](#12-ranking-design)
13. [FastAPI Design](#13-fastapi-design)
14. [React/Backend Contract](#14-reactbackend-contract)
15. [Project Directory Structure](#15-project-directory-structure)
16. [Docker Architecture](#16-docker-architecture)
17. [Implementation Roadmap](#17-implementation-roadmap)
18. [Testing Strategy](#18-testing-strategy)
19. [Demo Plan](#19-demo-plan)
20. [Risks and Fallbacks](#20-risks-and-fallbacks)
21. [Initial Scaffolding Changes](#21-initial-scaffolding-changes)
22. [Ready for Implementation Checklist](#22-ready-for-implementation-checklist)

---

## 1. Dataset Inspection

### 1.1 Amazon Sales Dataset

**File:** `datasets/Amazon/Amazon Sale Report.csv`  
**Size:** ~40 MB (124,654 rows after skipping malformed lines)

| Property | Finding |
|---|---|
| **Columns (21)** | `index`, `Order ID`, `Date`, `Status`, `Fulfilment`, `Sales Channel`, `ship-service-level`, `Category`, `Size`, `Courier Status`, `Qty`, `currency`, `Amount`, `ship-city`, `ship-state`, `ship-postal-code`, `ship-country`, `B2B`, `fulfilled-by`, `New`, `PendingS` |
| **Row count** | 124,654 |
| **Unique Order IDs** | 116,278 |
| **Duplicate Order IDs** | 8,376 (multi-item orders: 6,690 orders have >1 line item) |
| **Product identifier** | **NONE.** No product_id, SKU, or ASIN. The finest granularity is `Category` + `Size`. |
| **Unique categories** | **9**: T-shirt (48,655), Shirt (48,152), Blazzer (14,987), Trousers (10,255), Perfume (1,123), Wallet (895), Socks (425), Shoes (159), Watch (3) |
| **Category+Size combos** | **45** — this is the maximum "product" count possible |
| **Qty field** | Integer. Distribution: 0 (12,384), 1 (111,891), 2 (332), 3 (32), 4+ (14). Overwhelmingly Qty=1. |
| **Qty=0 meaning** | Strongly correlated with `Cancelled` status. 12,281 of 12,384 Qty=0 rows are Cancelled. |
| **Valid transactions** | 106,825 rows with Qty>0 and Status ≠ Cancelled |
| **Date field** | Date only, no time-of-day. Format: `MM-DD-YY` or `MM-DD-YYYY` (inconsistent). Range: 2022-03-31 to 2022-06-29 (91 unique dates, ~3 months). |
| **Time-of-day** | **Not available.** No hour/minute/second information. |
| **Null/empty columns** | `currency`/`Amount`: 6.1% null; `fulfilled-by`: 69.6% null; `New`/`PendingS`: 100% empty (garbage columns). |
| **Malformed rows** | Parser error at line 124 (22 fields instead of 21). Pandas `on_bad_lines='skip'` required. |
| **Order statuses** | 13 statuses including Cancelled (17,726), Shipped (75,213), Delivered (27,764), etc. |

### 1.2 Instacart Dataset

**Files:** 6 CSVs in `datasets/instacart/`

#### orders.csv
| Property | Finding |
|---|---|
| **Size** | ~109 MB (3,421,083 rows) |
| **Columns** | `order_id`, `user_id`, `eval_set`, `order_number`, `order_dow`, `order_hour_of_day`, `days_since_prior_order` |
| **Unique orders** | 3,421,083 |
| **Unique users** | 206,209 |
| **eval_set split** | prior: 3,214,874 / train: 131,209 / test: 75,000 |
| **order_dow** | 0-6 (day of week). Peak: days 0,1. |
| **order_hour_of_day** | **0-23 (hour of day).** Peak: 10am-4pm. This is genuine intraday time information. |
| **days_since_prior_order** | Float. 6.0% null (first orders). Mean=10.7, range 0-30. |
| **Nulls** | Only `days_since_prior_order`: 206,209 (6.0%) — expected, first orders have no prior. |

#### products.csv
| Property | Finding |
|---|---|
| **Size** | ~2.2 MB (49,688 rows) |
| **Columns** | `product_id`, `product_name`, `aisle_id`, `department_id` |
| **Unique products** | 49,688 |
| **Unique aisles** | 134 |
| **Unique departments** | 21 |
| **Nulls** | None |
| **Product names** | Human-readable: "Banana", "Organic Strawberries", "Organic Baby Spinach", etc. |

#### order_products__prior.csv
| Property | Finding |
|---|---|
| **Size** | ~578 MB (32,434,489 rows) |
| **Columns** | `order_id`, `product_id`, `add_to_cart_order`, `reordered` |
| **Unique orders** | 3,214,874 (matches prior eval_set exactly) |
| **Unique products** | 49,677 (nearly all products appear) |
| **Duplicate rows** | 0 exact duplicates |
| **Same product in same order** | 0 duplicates |
| **Products per order** | Mean: 10.1, Median: 8, Max: 145 |
| **Quantity field** | **No explicit quantity.** Each row = 1 unit. This is correct for Instacart: if you buy 2 bananas, there is 1 row (not 2). The count of rows per product across orders = purchase frequency (number of orders containing that product). |
| **Nulls** | None |

#### order_products__train.csv
| Property | Finding |
|---|---|
| **Size** | ~25 MB (1,384,617 rows) |
| **Columns** | Same as prior: `order_id`, `product_id`, `add_to_cart_order`, `reordered` |
| **Unique orders** | 131,209 (matches train eval_set) |
| **Unique products** | 39,123 |
| **Nulls** | None |

#### aisles.csv & departments.csv
| Property | Finding |
|---|---|
| **aisles.csv** | 134 rows. Columns: `aisle_id`, `aisle`. Lookup table for product aisles. |
| **departments.csv** | 21 rows. Columns: `department_id`, `department`. Lookup table for departments. |

#### Top 10 Products by Purchase Frequency (prior)
| Rank | Product | Purchases |
|---|---|---|
| 1 | Banana | 472,565 |
| 2 | Bag of Organic Bananas | 379,450 |
| 3 | Organic Strawberries | 264,683 |
| 4 | Organic Baby Spinach | 241,921 |
| 5 | Organic Hass Avocado | 213,584 |
| 6 | Organic Avocado | 176,815 |
| 7 | Large Lemon | 152,657 |
| 8 | Strawberries | 142,951 |
| 9 | Limes | 140,627 |
| 10 | Organic Whole Milk | 137,905 |

#### Product Frequency Distribution
| Metric | Value |
|---|---|
| Mean purchases/product | 652.9 |
| Median purchases/product | 60.0 |
| Products with 1 purchase | 131 |
| Products with >100 purchases | 19,979 |
| Products with >1,000 purchases | 5,053 |
| Products with >10,000 purchases | 492 |

---

## 2. Dataset Comparison

| Criterion | Amazon | Instacart |
|---|---|---|
| **1. Product granularity** | **FATAL FLAW.** No product_id, SKU, or ASIN. Only 9 categories and 45 Category+Size combos. "Top 10 products" would mean "Top 9 categories" — the project requirement is impossible to demonstrate meaningfully. | **Excellent.** 49,688 unique products with integer `product_id` and human-readable `product_name`. Perfect for "Top 10 products." |
| **2. Units/quantity availability** | `Qty` column exists. Overwhelmingly Qty=1 (99.7% of valid rows). Usable but low variance. | No explicit quantity column. Each row = 1 purchase event = 1 unit (the product was in the cart). This is a standard interpretation. The sheer volume (32M+ rows) produces meaningful variation. |
| **3. Time granularity** | Date only (MM-DD-YY). No time-of-day. Only 91 unique dates over 3 months. | `order_hour_of_day` (0-23) + `order_dow` (0-6). No absolute date, but hour-of-day is available. This is **directly relevant** to intraday momentum. |
| **4. Intraday momentum suitability** | **Cannot demonstrate intraday momentum** with date-only granularity. All transactions on the same date are indistinguishable by time. | `order_hour_of_day` allows natural simulation of intraday patterns. Orders can be replayed hour-by-hour to simulate intraday momentum. |
| **5. Number of transactions** | 124,654 rows (106,825 valid) | 32,434,489 (prior) + 1,384,617 (train) = **33,819,106** total product transactions |
| **6. Number of products** | 9 categories / 45 Category+Size combos | **49,688** unique products |
| **7. Data quality** | Malformed rows (parser errors), inconsistent date formats, 6.1% null amounts, 69.6% null `fulfilled-by`, 2 entirely empty columns. Requires significant cleaning. | Clean. Zero nulls in transaction tables. Zero duplicates. Only `days_since_prior_order` has expected nulls for first orders. |
| **8. Kafka streaming suitability** | Each row can be a Kafka message. Simple flat structure. But only 106K valid messages — stream would be very short. | Each row of `order_products__prior` becomes a Kafka message. 32M+ messages provides a long, sustained stream. Can be joined with orders for hour-of-day. |
| **9. HDFS suitability** | 40 MB total is trivially small for HDFS. Does not demonstrate HDFS's purpose. | 578 MB for `order_products__prior` alone. Combined with orders (~109 MB), this is a meaningful size for HDFS. |
| **10. MapReduce suitability** | Counting by 9 categories is trivial — a simple Python dict would suffice, making MapReduce feel artificial. | 49,688 products across 32M rows is a genuine use case for distributed aggregation. MapReduce has a clear purpose. |
| **11. Processing requirements** | Minimal. Could be processed in memory trivially. | Meaningful. 32M rows across 49K products requires actual batch processing, giving MapReduce a legitimate role. |
| **12. Demo suitability** | "Top 10 out of 9 categories" is embarrassing in a demo. No intraday change is visible. | Top 10 out of 49,688 products is compelling. Hour-of-day allows convincing intraday simulation. Product names (Banana, Organic Strawberries) are intuitive and memorable. |
| **13. Implementation complexity** | Lower data volume but higher data cleaning effort. Product granularity problem requires inventing synthetic product IDs, which is dishonest. | Higher data volume but cleaner data. Requires a join between `orders` and `order_products__prior` to get time information, but this is straightforward. |
| **14. Limitations** | No product-level granularity. No time-of-day. Data quality issues. Too few products for meaningful top-10. | No absolute date (only relative time). No explicit quantity (1 row = 1 unit). Large file size requires sampling or batched reading for the producer. |
| **15. Assumptions required** | Would need to fabricate product IDs from Category+Size, invent time-of-day values, and explain why "top 10 out of 45" is meaningful. | Need to assume each row = 1 unit sold. Need to simulate absolute timestamps from `order_hour_of_day`. Both assumptions are standard and defensible. |

---

## 3. Selected Dataset

### **Decision: Instacart**

**Rationale:**

The Amazon dataset has a **fatal flaw for this project**: it contains no product-level identifiers. With only 9 categories (or 45 Category+Size combinations), the core requirement — "Top 10 Products by Units Sold" — cannot be demonstrated meaningfully. Ranking 9 categories is not ranking products. Fabricating product IDs would be dishonest and would not survive a viva question like "Show me the actual product identifier in the raw data."

The Instacart dataset provides:
1. **49,688 real products** with integer IDs and human-readable names — making "Top 10" genuinely selective
2. **`order_hour_of_day` (0-23)** — natural intraday time information that directly supports momentum analysis
3. **32.4 million transactions** — providing meaningful volume for Kafka streaming, HDFS storage, and MapReduce processing
4. **Clean data** — zero duplicates, zero nulls in transaction tables, well-defined relational structure
5. **Intuitive products** — "Banana", "Organic Strawberries" — immediately understandable in a demo

> [!IMPORTANT]
> **Data files used from Instacart:**
> - `order_products__prior.csv` — primary transaction data (32.4M rows)
> - `orders.csv` — for `order_hour_of_day` time information
> - `products.csv` — product names lookup
> - `aisles.csv` and `departments.csv` — optional enrichment
> - `order_products__train.csv` — **NOT used** (reserved for ML evaluation, not relevant to this project)

---

## 4. Dataset Limitations and Assumptions

### Limitations

| Limitation | Detail |
|---|---|
| **No absolute dates** | `orders.csv` has `order_dow` and `order_hour_of_day` but no calendar date. We cannot reconstruct the actual date of any order. |
| **No explicit quantity** | Each row in `order_products__prior` = 1 purchase event. If a customer bought 3 bananas, there is still only 1 row. We count purchase frequency, not literal unit quantity. |
| **No real-time API** | This is historical data. The "live stream" is a simulation. |
| **32M rows is large** | The producer cannot load all 32M rows into memory at once. Must use chunked/streaming reads. |
| **`order_products__prior` has no time info** | Must JOIN with `orders.csv` to get `order_hour_of_day`. |

### Assumptions (Documented and Defensible)

| Assumption | Justification |
|---|---|
| **1 row = 1 unit sold** | Standard interpretation for Instacart data. Each row represents one product being added to a cart and purchased. This is the "units sold" metric. |
| **`order_hour_of_day` represents intraday time** | This is a real field from the Instacart dataset. We use it to simulate the hour at which a transaction occurred. |
| **Simulated wall-clock timestamps** | The producer assigns `event_time` = current wall-clock time when producing to Kafka. The `order_hour_of_day` from the dataset is preserved as metadata but the windowing system uses `event_time` (production time). This is the honest approach: we acknowledge the simulation. |
| **We stream a sample, not all 32M rows** | For practical demos, the producer reads rows in order and streams them at a configurable rate. The first N rows are sufficient for demonstration. |

---

## 5. Final Architecture

The proposed architecture is **accepted with one structural refinement**: the Ranking + Momentum Engine is a Python module invoked by the orchestrator after MapReduce completes, not a separate service.

```
┌──────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURE                              │
│                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐   │
│  │  Instacart   │────▶│   Python    │────▶│   Kafka Topic    │   │
│  │  Dataset     │     │  Producer   │     │ (sales-events)   │   │
│  │  (CSV files) │     │             │     │                  │   │
│  └─────────────┘     └─────────────┘     └────────┬─────────┘   │
│                                                    │             │
│                                          ┌─────────▼──────────┐  │
│                                          │   Python Consumer  │  │
│                                          │   + Orchestrator   │  │
│                                          └─────────┬──────────┘  │
│                                                    │             │
│                              ┌─────────────────────▼───────┐     │
│                              │          HDFS               │     │
│                              │  /bda-project/              │     │
│                              │    raw/        (all data)   │     │
│                              │    windows/    (per window) │     │
│                              │    output/     (MR results) │     │
│                              └─────────────────────┬───────┘     │
│                                                    │             │
│                              ┌─────────────────────▼───────┐     │
│                              │    Hadoop Streaming          │     │
│                              │    MapReduce                 │     │
│                              │    Python Mapper + Reducer   │     │
│                              └─────────────────────┬───────┘     │
│                                                    │             │
│                              ┌─────────────────────▼───────┐     │
│                              │   Python Ranking +          │     │
│                              │   Momentum Engine           │     │
│                              │   (reads MR output,         │     │
│                              │    computes momentum,        │     │
│                              │    writes JSON)              │     │
│                              └─────────────────────┬───────┘     │
│                                                    │             │
│                              ┌─────────────────────▼───────┐     │
│                              │        FastAPI              │     │
│                              │   (reads ranking JSON,      │     │
│                              │    serves REST API)         │     │
│                              └─────────────────────┬───────┘     │
│                                                    │             │
│                              ┌─────────────────────▼───────┐     │
│                              │     React Dashboard         │     │
│                              │   (polls API, displays      │     │
│                              │    top-10 + momentum)       │     │
│                              └─────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### Component Specifications

| Component | Purpose | Input | Output | Technology | Lifecycle | Dependencies |
|---|---|---|---|---|---|---|
| **Instacart Dataset** | Historical source data | Raw CSV files | Read by Producer | CSV files on disk | Static, never modified | None |
| **Python Producer** | Simulate live transaction stream from historical data | `order_products__prior.csv` + `orders.csv` + `products.csv` | Kafka messages to `sales-events` topic | Python + `kafka-python` | Long-running process. Reads CSV in chunks, produces at configurable rate. | Kafka broker |
| **Kafka Broker** | Message queue for transaction events | Producer messages | Consumer reads | Apache Kafka (Docker) | Always running (Docker container) | Zookeeper or KRaft |
| **Python Consumer + Orchestrator** | Consume messages, write to HDFS, trigger MapReduce per window | Kafka messages | Files on HDFS + triggers MapReduce | Python + `kafka-python` + `subprocess` (for HDFS/MR commands) | Long-running process. Accumulates messages per window, writes to HDFS, launches MapReduce. | Kafka, HDFS, Hadoop |
| **HDFS** | Distributed storage for streaming data and MapReduce I/O | Consumer writes CSV files | MapReduce reads, ranking engine reads output | Hadoop HDFS (Docker) | Always running (Docker container) | Hadoop container |
| **Hadoop Streaming MapReduce** | Aggregate units sold per product per window | HDFS window files (CSV/TSV) | HDFS output files (product_id, units count) | Hadoop Streaming + Python mapper/reducer | Batch job triggered per window | HDFS, mapper.py, reducer.py |
| **Python Ranking + Momentum Engine** | Compute top-10 ranking and momentum metrics | MapReduce output (read from HDFS) + previous window state | JSON file with ranking data | Python script | Runs after each MapReduce job completes | MapReduce output |
| **FastAPI** | REST API serving ranking data to frontend | Ranking JSON file | HTTP JSON responses | FastAPI + Uvicorn | Always running | Ranking JSON file |
| **React Dashboard** | Visualization of top-10 products and momentum | FastAPI REST endpoints | Browser UI | React (Vite) | Always running (dev server) | FastAPI |

---

## 6. Complete Data Flow

### Per-Window Cycle (repeats every REFRESH_INTERVAL seconds)

```
Step 1: PRODUCE
  Producer reads next batch of rows from CSV
  → Enriches with product_name (from products.csv lookup)
  → Enriches with order_hour_of_day (from orders.csv lookup)
  → Assigns event_time = current wall-clock timestamp
  → Produces JSON messages to Kafka topic "sales-events"

Step 2: CONSUME
  Consumer reads messages from Kafka
  → Accumulates messages in a buffer for the current window
  → When WINDOW_SIZE seconds elapse:
    → Writes accumulated messages as a TSV file to HDFS:
      /bda-project/windows/window_<timestamp>.tsv
    → Also appends to cumulative raw:
      /bda-project/raw/all_transactions.tsv

Step 3: MAPREDUCE (current window)
  Consumer/Orchestrator triggers Hadoop Streaming job:
    Input:  /bda-project/windows/window_<timestamp>.tsv
    Output: /bda-project/output/window_<timestamp>/
    Mapper:  reads TSV lines → emits (product_id, 1)
    Reducer: sums counts per product_id → emits (product_id, total_units)

Step 4: RANKING + MOMENTUM
  Python script reads:
    → Current window MR output: /bda-project/output/window_<current>/part-00000
    → Previous window MR output: /bda-project/output/window_<previous>/part-00000
    → Cumulative state (maintained in a local JSON file)
  Computes:
    → Updates cumulative totals per product
    → Calculates momentum = ((current - previous) / max(previous, 1)) * 100
    → Sorts by total_units descending → Top 10
    → Writes ranking to local JSON file: ranking_output.json

Step 5: SERVE
  FastAPI reads ranking_output.json on each API request
  → Returns JSON response with top-10 ranking + momentum

Step 6: DISPLAY
  React dashboard polls GET /api/rankings every 5 seconds
  → Renders top-10 table with momentum indicators
  → Shows last-updated timestamp and current window info
```

### Data Format at Each Stage

| Stage | Format | Example |
|---|---|---|
| CSV source | CSV | `2,33120,1,1` |
| Kafka message | JSON | `{"product_id": 33120, "product_name": "Organic Egg Whites", "units": 1, "event_time": "2026-09-27T17:15:00Z", "order_hour": 10, "source": "historical_simulation"}` |
| HDFS window file | TSV | `33120\tOrganic Egg Whites\t1\t2026-09-27T17:15:00Z` |
| MapReduce mapper output | TSV (stdout) | `33120\t1` |
| MapReduce reducer output | TSV | `33120\t45` |
| Ranking JSON | JSON | See FastAPI section |

---

## 7. Kafka Design

### Broker Architecture

| Property | Value | Rationale |
|---|---|---|
| **Mode** | KRaft (no Zookeeper) | Simpler. One fewer container. KRaft is stable in Kafka 3.x+. For a college project, reducing moving parts is critical. |
| **Brokers** | 1 | Single-node is sufficient. This is a lab project, not production. |
| **Docker image** | `apache/kafka:3.7.0` (official) | Includes KRaft support out of the box. |

### Topic Design

| Property | Value | Rationale |
|---|---|---|
| **Topic name** | `sales-events` | Descriptive, simple. |
| **Partitions** | 3 | Enough to demonstrate partitioning. More than 1 to show distributed concepts. Not so many as to be wasteful. |
| **Replication factor** | 1 | Single broker, so replication factor must be 1. |
| **Retention** | 24 hours (`retention.ms=86400000`) | Sufficient for demo/testing. Prevents unbounded growth. |

### Message Design

**Key:** `product_id` (string) — ensures all messages for the same product go to the same partition.

**Value:** JSON

```json
{
    "product_id": 24852,
    "product_name": "Banana",
    "category": "fresh fruits",
    "department": "produce",
    "units": 1,
    "event_time": "2026-09-27T17:15:32.456Z",
    "order_hour": 14,
    "order_dow": 2,
    "source": "historical_simulation"
}
```

**Serialization:** JSON (UTF-8 encoded strings). Simple, human-readable, debuggable with `kafka-console-consumer`.

**Partitioning strategy:** Key = `str(product_id)`. Kafka's default partitioner hashes the key, so the same product always lands in the same partition. This ensures per-product ordering within a partition, which is useful but not strictly required for this project.

### Producer Behavior

| Property | Value |
|---|---|
| **Library** | `kafka-python` |
| **Batch size** | Default (16KB) |
| **Linger** | 10ms |
| **Acks** | 1 (leader only — sufficient for single-broker) |
| **Rate control** | Configurable `PRODUCER_RATE` env var. Default: 50 messages/second for dev, 200/sec for demo. |
| **Burst mode** | Configurable via `BURST_PRODUCT_ID` and `BURST_MULTIPLIER` env vars. When set, the producer generates extra synthetic transactions for the specified product. |

### Consumer Behavior

| Property | Value |
|---|---|
| **Library** | `kafka-python` |
| **Consumer group** | `ranking-engine-group` |
| **Auto offset reset** | `earliest` |
| **Auto commit** | `True` (with 5s interval) |
| **Processing** | Accumulates messages in memory per window. On window boundary, writes to HDFS and triggers MapReduce. |

---

## 8. HDFS Design

### Directory Structure

```
/bda-project/
├── windows/
│   ├── window_20260927_171500.tsv
│   ├── window_20260927_171600.tsv
│   └── ...
├── output/
│   ├── window_20260927_171500/
│   │   └── part-00000
│   ├── window_20260927_171600/
│   │   └── part-00000
│   └── ...
└── mapreduce/
    ├── mapper.py
    └── reducer.py
```

### Storage Details

| Directory | Purpose | Written by | Read by | Format | Lifecycle |
|---|---|---|---|---|---|
| `/bda-project/windows/` | Per-window transaction data | Consumer | MapReduce | TSV: `product_id\tproduct_name\tunits\tevent_time` | Append-only. One file per window. Retained for at least 1 hour. Older windows can be cleaned up by a script. |
| `/bda-project/output/` | MapReduce results per window | MapReduce | Ranking engine | TSV: `product_id\ttotal_units` | One subdirectory per window. Previous window's output is needed for momentum. Keep at least 2 most recent. |
| `/bda-project/mapreduce/` | Python mapper and reducer scripts | Uploaded once at startup | Hadoop Streaming | Python scripts | Static. Uploaded by setup script. |

### File Naming Convention

- Window files: `window_YYYYMMDD_HHmmss.tsv` using the wall-clock timestamp of the window's start time.
- Output directories: same naming convention under `/bda-project/output/`.

### Data Retention

- Keep the **last 10 windows** of data. A simple cleanup runs after each window.
- This prevents HDFS from growing indefinitely during long demo sessions.
- Implementation: after ranking computation, delete windows older than `10 * WINDOW_SIZE` seconds.

---

## 9. MapReduce Design

### Job Count: **1 MapReduce job per window**

A single MapReduce job is sufficient because:
1. The mapper extracts `(product_id, units)` from each line
2. The reducer sums units per product_id
3. This gives per-product unit counts for the current window
4. Cumulative totals and momentum are computed **outside** MapReduce (in the ranking engine) because they require state from previous windows, which MapReduce jobs cannot maintain across invocations

### Mapper (`mapper.py`)

```
INPUT:  Lines from the window TSV file on HDFS
        Format: product_id\tproduct_name\tunits\tevent_time

PROCESSING:
  For each line:
    1. Split by tab
    2. Extract product_id and units
    3. Validate: skip lines with invalid product_id or non-integer units
    4. Emit to stdout: product_id\tunits

OUTPUT: Tab-separated key-value pairs to stdout
        product_id\tunits
        (one pair per input line)

EXAMPLE:
  Input line:   24852\tBanana\t1\t2026-09-27T17:15:32Z
  Output line:  24852\t1
```

### Reducer (`reducer.py`)

```
INPUT:  Sorted, grouped key-value pairs from mapper(s)
        Format: product_id\tunits (sorted by product_id)

PROCESSING:
  For each group of lines with the same product_id:
    1. Sum all units values
    2. Emit: product_id\ttotal_units

OUTPUT: Tab-separated results to stdout
        product_id\ttotal_units
        (one line per unique product_id)

EXAMPLE:
  Input:   24852\t1
           24852\t1
           24852\t1
  Output:  24852\t3
```

### Hadoop Streaming Command

```bash
hadoop jar $HADOOP_HOME/share/hadoop/tools/lib/hadoop-streaming-*.jar \
  -files /bda-project/mapreduce/mapper.py,/bda-project/mapreduce/reducer.py \
  -mapper "python3 mapper.py" \
  -reducer "python3 reducer.py" \
  -input /bda-project/windows/window_<timestamp>.tsv \
  -output /bda-project/output/window_<timestamp>
```

> [!NOTE]
> The `-files` flag distributes the Python scripts to all nodes. On our single-node setup, this still works correctly and demonstrates the pattern.

### Why Momentum/Ranking is Outside MapReduce

MapReduce is stateless across jobs. Computing momentum requires:
- Current window's per-product counts (from current MR job)
- Previous window's per-product counts (from previous MR job's output)
- Cumulative totals across all windows

This cross-window state is naturally managed by a Python script that:
1. Reads the current MR output from HDFS
2. Reads the previous MR output from HDFS (or from its local state file)
3. Updates cumulative totals
4. Computes momentum
5. Writes the ranking JSON

This is cleaner and more explainable than attempting multi-job MapReduce chains.

---

## 10. Windowing Design

### Configuration

| Variable | Unit | Dev/Test Value | Demo Value | Description |
|---|---|---|---|---|
| `WINDOW_SIZE` | seconds | `60` | `600` | Duration of each processing window |
| `REFRESH_INTERVAL` | seconds | `60` | `600` | How often ranking refreshes (should equal WINDOW_SIZE) |

> [!IMPORTANT]
> `WINDOW_SIZE` and `REFRESH_INTERVAL` are kept equal for simplicity. Both are in **seconds**. This is clearly documented in `.env.example`.

### Window Lifecycle

```
Time ─────────────────────────────────────────────────▶

│◄── Window N-1 ──▶│◄── Window N ──▶│◄── Window N+1 ─▶│
                    │                │
                    │  Consumer      │  Consumer
                    │  accumulates   │  writes Window N
                    │  messages      │  to HDFS,
                    │                │  triggers MR
```

### Tumbling Windows (Non-Overlapping)

Each window is a fixed-length, non-overlapping time bucket:
- Window boundaries are aligned to `WINDOW_SIZE` intervals from the consumer's start time.
- When the window timer expires, the consumer:
  1. Flushes the accumulated message buffer to an HDFS file
  2. Triggers a MapReduce job on that file
  3. Starts accumulating for the next window
  4. The ranking engine processes the MR output

### Empty Windows

If no messages arrive during a window:
- No HDFS file is written
- No MapReduce job is triggered
- The previous ranking remains current
- The dashboard shows "No data in current window" with the last-updated timestamp

---

## 11. Momentum Design

### Formula

```python
def compute_momentum(current_units: int, previous_units: int) -> float:
    """
    Compute momentum percentage.
    
    Positive = product is gaining sales velocity
    Negative = product is losing sales velocity
    Zero = no change
    
    Uses max(previous_units, 1) to handle division-by-zero.
    """
    if current_units == 0 and previous_units == 0:
        return 0.0
    
    denominator = max(previous_units, 1)
    momentum = ((current_units - previous_units) / denominator) * 100.0
    return round(momentum, 1)
```

### Why `max(previous_units, 1)` Instead of Special Cases

| Scenario | previous | current | Formula result | Interpretation |
|---|---|---|---|---|
| Normal growth | 20 | 45 | +125.0% | Strong momentum |
| Normal decline | 45 | 20 | -55.6% | Declining |
| Steady | 30 | 30 | 0.0% | No change |
| New product (first appearance) | 0 | 5 | +500.0% | New product burst (using max(0,1)=1 as denominator) |
| Both zero | 0 | 0 | 0.0% | Special-cased to 0 |
| Disappeared | 10 | 0 | -100.0% | Product stopped selling |

### Why This Formula

1. **Simple**: One line of arithmetic plus one edge-case check.
2. **Explainable**: "Momentum is the percentage change in units sold between the previous window and the current window."
3. **Defensible**: `max(prev, 1)` is the standard approach to avoid division-by-zero while keeping the formula continuous. When `previous=0`, the denominator becomes 1, so momentum equals `current_units * 100%`. This correctly flags new products as having high momentum.
4. **Testable**: Easy to write unit tests with known inputs and outputs.

### Capping (Optional)

For display purposes, momentum can be capped at ±999.9% to prevent visual distortion from products with `previous=0` and `current=large_number`. This is a **display** concern, not a computation concern.

---

## 12. Ranking Design

### Primary Ranking: Top 10 by Cumulative Units Sold

The cumulative total is maintained by the ranking engine across all windows:

```python
# cumulative_totals is a dict: product_id → total_units
# After each MapReduce window:
for product_id, window_units in current_window_results.items():
    cumulative_totals[product_id] = cumulative_totals.get(product_id, 0) + window_units

# Sort and take top 10
top_10 = sorted(cumulative_totals.items(), key=lambda x: x[1], reverse=True)[:10]
```

### Secondary Metrics (Computed for Top-10 Products)

For each product in the top 10:

| Metric | Source |
|---|---|
| `total_units` | Cumulative total across all windows |
| `current_window_units` | Current window's MapReduce output for this product |
| `previous_window_units` | Previous window's MapReduce output for this product |
| `momentum_pct` | `compute_momentum(current_window_units, previous_window_units)` |

### Momentum Movers (Supplementary)

In addition to the primary top-10, the ranking engine also produces a "Top 5 Momentum Movers" list:
- All products with `current_window_units > 0`
- Sorted by `momentum_pct` descending
- Top 5

This allows the dashboard to show products that are *surging* even if they aren't in the overall top 10 yet.

### State Management

The ranking engine maintains state in a local JSON file (`state/ranking_state.json`):

```json
{
    "cumulative_totals": {"24852": 1250, "13176": 980, ...},
    "previous_window": {"24852": 20, "13176": 15, ...},
    "current_window": {"24852": 45, "13176": 30, ...},
    "window_id": "window_20260927_171600",
    "last_updated": "2026-09-27T17:16:05Z"
}
```

This file is read on startup (for recovery) and written after each window.

---

## 13. FastAPI Design

### Endpoints

| Endpoint | Method | Purpose | Response |
|---|---|---|---|
| `GET /api/health` | GET | Health check + system status | `{"status": "ok", "last_updated": "...", "current_window": "..."}` |
| `GET /api/rankings` | GET | Top-10 ranking with momentum data | Full ranking response (see below) |
| `POST /api/burst` | POST | Trigger a sales burst for demo | `{"status": "burst_started", "product_id": ..., "multiplier": ...}` |

Three endpoints is sufficient. The `/api/burst` endpoint is for demo convenience — it tells the producer to start generating extra transactions for a specific product.

### Response Schema: `GET /api/rankings`

```json
{
    "last_updated": "2026-09-27T17:16:05Z",
    "window_id": "window_20260927_171600",
    "window_size_seconds": 60,
    "total_windows_processed": 5,
    "top_10": [
        {
            "rank": 1,
            "product_id": 24852,
            "product_name": "Banana",
            "category": "fresh fruits",
            "department": "produce",
            "total_units": 1250,
            "current_window_units": 45,
            "previous_window_units": 20,
            "momentum_pct": 125.0,
            "momentum_direction": "up"
        },
        {
            "rank": 2,
            "product_id": 13176,
            "product_name": "Bag of Organic Bananas",
            "category": "fresh fruits",
            "department": "produce",
            "total_units": 980,
            "current_window_units": 30,
            "previous_window_units": 35,
            "momentum_pct": -14.3,
            "momentum_direction": "down"
        }
    ],
    "momentum_movers": [
        {
            "product_id": 47209,
            "product_name": "Organic Hass Avocado",
            "total_units": 120,
            "current_window_units": 25,
            "previous_window_units": 3,
            "momentum_pct": 733.3,
            "momentum_direction": "up"
        }
    ]
}
```

### How FastAPI Reads Data

FastAPI reads `state/ranking_output.json` from disk on each request. This file is written by the ranking engine after each window.

**Why file-based, not database:**
- Eliminates PostgreSQL/database dependency
- The ranking output is small (< 1KB)
- File I/O is sufficient for single-user demo
- Simple to debug (just `cat ranking_output.json`)

### CORS

FastAPI must enable CORS for the React dev server (`http://localhost:5173`).

### Burst Endpoint

`POST /api/burst` writes a signal file (`state/burst_signal.json`) that the producer watches:

```json
{
    "product_id": 47209,
    "multiplier": 10,
    "duration_seconds": 120
}
```

The producer checks for this file periodically and generates extra transactions accordingly. When the burst duration expires, the producer deletes the signal file.

---

## 14. React/Backend Contract

### Frontend: React with Vite

**Choice: React (Vite)** over Next.js. Rationale: this is a pure client-side dashboard that polls an API. No SSR, no routing complexity, no SEO requirements. Vite + React is the simplest setup.

### Polling Contract

```javascript
// Poll every 5 seconds
const POLL_INTERVAL = 5000;

// Endpoint
const API_URL = "http://localhost:8000/api/rankings";

// Fetch and update state
useEffect(() => {
    const interval = setInterval(async () => {
        const res = await fetch(API_URL);
        const data = await res.json();
        setRankings(data);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
}, []);
```

### Dashboard Components

| Component | Data Source | Display |
|---|---|---|
| **Top-10 Table** | `top_10` array | Rank, product name, total units, current/previous window units, momentum %, up/down arrow |
| **Momentum Movers** | `momentum_movers` array | Product name, momentum %, current vs previous units |
| **Status Bar** | `last_updated`, `window_id`, `total_windows_processed` | Last update time, current window, windows processed count |
| **Burst Button** | `POST /api/burst` | Dropdown to select a product, button to trigger burst |

### Visual Design Requirements

- Dark theme (professional, data-dashboard aesthetic)
- Green for positive momentum, red for negative
- Up/down arrows (▲/▼) for momentum direction
- Progress bar or sparkline for momentum visualization (optional)
- Refresh countdown timer
- Clean sans-serif font (Inter or system default)

---

## 15. Project Directory Structure

```
BDA Mini Project/
│
├── datasets/                          # EXISTING — DO NOT MODIFY
│   ├── Amazon/
│   │   └── Amazon Sale Report.csv
│   └── instacart/
│       ├── aisles.csv
│       ├── departments.csv
│       ├── order_products__prior.csv
│       ├── order_products__train.csv
│       ├── orders.csv
│       └── products.csv
│
├── producer/
│   ├── __init__.py
│   ├── producer.py                    # Kafka producer (reads dataset, streams to Kafka)
│   └── burst.py                       # Burst signal watcher (optional, can be in producer.py)
│
├── consumer/
│   ├── __init__.py
│   └── consumer.py                    # Kafka consumer + orchestrator (HDFS write + MR trigger)
│
├── mapreduce/
│   ├── mapper.py                      # Hadoop Streaming mapper
│   └── reducer.py                     # Hadoop Streaming reducer
│
├── engine/
│   ├── __init__.py
│   └── ranking.py                     # Ranking + momentum computation
│
├── api/
│   ├── __init__.py
│   └── main.py                        # FastAPI application
│
├── frontend/
│   ├── package.json                   # React + Vite
│   ├── vite.config.js
│   ├── index.html
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── components/
│   │       ├── RankingTable.jsx
│   │       ├── MomentumMovers.jsx
│   │       ├── StatusBar.jsx
│   │       └── BurstControl.jsx
│   └── public/
│
├── scripts/
│   ├── setup_hdfs.sh                  # Initialize HDFS directories, upload mapper/reducer
│   ├── run_mapreduce.sh               # Wrapper to invoke Hadoop Streaming
│   ├── start_all.sh                   # Start all components in order
│   └── cleanup.sh                     # Clean HDFS old windows
│
├── config/
│   └── settings.py                    # Centralized config (reads env vars)
│
├── state/                             # Runtime state files (gitignored)
│   ├── ranking_state.json
│   ├── ranking_output.json
│   └── burst_signal.json
│
├── tests/
│   ├── test_data/
│   │   └── synthetic_transactions.tsv # Small synthetic dataset for unit tests
│   ├── test_momentum.py
│   ├── test_ranking.py
│   ├── test_mapper.py
│   ├── test_reducer.py
│   └── test_api.py
│
├── docker-compose.yml                 # Kafka + Hadoop containers
├── .env                               # Active configuration (dev defaults)
├── .env.example                       # Documented configuration template
├── .env.demo                          # Demo configuration (WINDOW_SIZE=600)
├── .gitignore
├── requirements.txt                   # Python dependencies
└── README.md                          # Project documentation
```

### Purpose of Key Files

| File/Directory | Purpose |
|---|---|
| `config/settings.py` | Single source of truth for all configuration. Reads from environment variables with defaults. Every other module imports from here. |
| `state/` | Runtime state. Not committed to git. Contains the ranking engine's state and the current ranking output that FastAPI serves. |
| `scripts/setup_hdfs.sh` | Run once to create HDFS directories and upload mapper/reducer scripts. |
| `scripts/run_mapreduce.sh` | Called by the consumer/orchestrator to invoke Hadoop Streaming. Parameterized with input/output paths. |

---

## 16. Docker Architecture

### Containers

| Container | Image | Purpose | Ports | Volumes |
|---|---|---|---|---|
| `kafka` | `apache/kafka:3.7.0` | Kafka broker in KRaft mode | `9092:9092` | `kafka-data:/var/lib/kafka/data` |
| `hadoop` | `apache/hadoop:3.3.6` | HDFS NameNode + DataNode + YARN (single-node) | `9870:9870` (HDFS Web UI), `8088:8088` (YARN), `9000:9000` (HDFS RPC) | `hadoop-data:/opt/hadoop/data`, `./mapreduce:/opt/mapreduce` |

### What Runs Locally (Not in Docker)

| Component | Reason |
|---|---|
| Python Producer | Needs access to `datasets/` directory. Simpler to run locally with `kafka-python`. |
| Python Consumer/Orchestrator | Needs to invoke `hdfs dfs` and `hadoop jar` commands against the Docker containers. Runs locally, connects to Kafka and HDFS via exposed ports. |
| Ranking Engine | Runs locally, reads from HDFS via CLI. |
| FastAPI | Runs locally, reads local `state/` files. |
| React | Runs locally via Vite dev server. |

> [!TIP]
> Running Python components locally avoids the complexity of building custom Docker images and mounting volumes. The producer/consumer connect to Kafka on `localhost:9092` and HDFS on `localhost:9000`.

### Docker Compose

```yaml
version: '3.8'

services:
  kafka:
    image: apache/kafka:3.7.0
    container_name: bda-kafka
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_LOG_RETENTION_HOURS: 24
      CLUSTER_ID: "BDA-Mini-Project-Cluster-01"
    volumes:
      - kafka-data:/var/lib/kafka/data
    healthcheck:
      test: /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list || exit 1
      interval: 10s
      timeout: 5s
      retries: 5

  hadoop:
    image: apache/hadoop:3.3.6
    container_name: bda-hadoop
    ports:
      - "9870:9870"   # HDFS NameNode Web UI
      - "8088:8088"   # YARN ResourceManager Web UI
      - "9000:9000"   # HDFS RPC
    volumes:
      - hadoop-data:/opt/hadoop/data
      - ./mapreduce:/opt/mapreduce
    environment:
      HADOOP_CONF_DIR: /opt/hadoop/etc/hadoop
    command: >
      bash -c "
        hdfs namenode -format -force &&
        hdfs namenode &
        hdfs datanode &
        yarn resourcemanager &
        yarn nodemanager &
        sleep infinity
      "
    healthcheck:
      test: hdfs dfs -ls / || exit 1
      interval: 15s
      timeout: 10s
      retries: 5

volumes:
  kafka-data:
  hadoop-data:
```

> [!WARNING]
> The Hadoop container's startup command is simplified. The actual `apache/hadoop:3.3.6` image may need specific configuration. During implementation, verify the exact entrypoint and adjust. The implementer should check the image's documentation and may need to set `core-site.xml` and `hdfs-site.xml` properly.

### Networking

- All containers share the default Docker bridge network.
- Local Python processes connect via `localhost:<port>`.
- Kafka advertises `localhost:9092` so local producers/consumers can connect.
- HDFS is accessible at `hdfs://localhost:9000` from local processes.

### Startup Order

1. `docker compose up -d` (starts Kafka + Hadoop)
2. Wait for health checks to pass (~30 seconds)
3. Run `scripts/setup_hdfs.sh` (create HDFS dirs, upload mapper/reducer)
4. Create Kafka topic: `kafka-topics.sh --create --topic sales-events --partitions 3 --replication-factor 1 --bootstrap-server localhost:9092`
5. Start FastAPI: `uvicorn api.main:app --host 0.0.0.0 --port 8000`
6. Start React: `cd frontend && npm run dev`
7. Start Consumer: `python -m consumer.consumer`
8. Start Producer: `python -m producer.producer`

---

## 17. Implementation Roadmap

### Stage 1: Environment Verification

| Property | Detail |
|---|---|
| **Objective** | Verify all required tools are installed and accessible |
| **Files** | None created |
| **Tasks** | 1. Verify Python 3.11+ (`python3 --version`) 2. Verify Docker (`docker --version`, `docker compose version`) 3. Verify Node.js/npm (`node --version`, `npm --version`) 4. Verify `apache/hadoop:3.3.6` image exists (`docker images`) 5. Pull Kafka image (`docker pull apache/kafka:3.7.0`) 6. Verify dataset files exist and are readable |
| **Expected output** | All version checks pass. Both Docker images available. |
| **Verification** | `python3 --version && docker images | grep -E "kafka|hadoop" && node --version` |
| **Working afterward** | Development environment is confirmed ready |
| **Common failures** | Docker not running, images not pulled, Python version too old |

### Stage 2: Project Scaffolding & Configuration

| Property | Detail |
|---|---|
| **Objective** | Create directory structure, config files, and install dependencies |
| **Files to create** | `.env`, `.env.example`, `.env.demo`, `config/settings.py`, `requirements.txt`, `.gitignore`, directory stubs (`producer/`, `consumer/`, `mapreduce/`, `engine/`, `api/`, `scripts/`, `state/`, `tests/`) |
| **Tasks** | 1. Create all directories 2. Create `.env` with dev defaults 3. Create `config/settings.py` reading env vars 4. Create `requirements.txt` 5. `pip install -r requirements.txt` 6. Create `.gitignore` |
| **Expected output** | All directories exist. `config/settings.py` imports cleanly. Dependencies installed. |
| **Verification** | `python3 -c "from config.settings import Settings; s = Settings(); print(s.WINDOW_SIZE)"` should print `60` |
| **Working afterward** | Project structure exists. Configuration module works. |
| **Common failures** | Missing `__init__.py` files, import path issues |

### Stage 3: Docker Compose + Infrastructure

| Property | Detail |
|---|---|
| **Objective** | Get Kafka and Hadoop running in Docker |
| **Files to create** | `docker-compose.yml` |
| **Tasks** | 1. Create `docker-compose.yml` with Kafka (KRaft) and Hadoop services 2. `docker compose up -d` 3. Wait for health checks 4. Verify Kafka: `docker exec bda-kafka /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092` 5. Verify HDFS: `docker exec bda-hadoop hdfs dfs -ls /` 6. Create Kafka topic 7. Create HDFS directories |
| **Expected output** | Both containers running. Kafka topic exists. HDFS directories exist. |
| **Verification** | `docker compose ps` shows both healthy. `kafka-topics.sh --describe --topic sales-events` returns topic info. `hdfs dfs -ls /bda-project/` shows directories. |
| **Working afterward** | Kafka and HDFS infrastructure is operational |
| **Common failures** | Port conflicts (9092, 9870, 9000). Hadoop format issues. KRaft cluster ID. Kafka image entrypoint differences. |

> [!IMPORTANT]
> **This is the most likely stage to have issues.** The Hadoop Docker image may require specific configuration. The implementer should be prepared to debug container startup. Check logs with `docker logs bda-hadoop` and `docker logs bda-kafka`.

### Stage 4: MapReduce Mapper & Reducer

| Property | Detail |
|---|---|
| **Objective** | Create and test mapper.py and reducer.py locally before involving Hadoop |
| **Files to create** | `mapreduce/mapper.py`, `mapreduce/reducer.py` |
| **Tasks** | 1. Write `mapper.py`: reads TSV from stdin, emits `product_id\tunits` 2. Write `reducer.py`: reads sorted key-value pairs from stdin, sums units per product_id 3. Test locally using Unix pipes: `cat test_data.tsv \| python3 mapper.py \| sort \| python3 reducer.py` 4. Create `tests/test_data/synthetic_transactions.tsv` |
| **Expected output** | Mapper and reducer produce correct output on synthetic data |
| **Verification** | `echo -e "24852\tBanana\t1\t2026-09-27T17:00:00Z\n24852\tBanana\t1\t2026-09-27T17:00:01Z\n13176\tBag of Organic Bananas\t1\t2026-09-27T17:00:02Z" \| python3 mapreduce/mapper.py \| sort \| python3 mapreduce/reducer.py` should output `13176\t1\n24852\t2` |
| **Working afterward** | MapReduce logic is verified locally |
| **Common failures** | Tab vs space issues. Python shebang. Encoding. Missing `#!/usr/bin/env python3`. |

### Stage 5: HDFS Integration + MapReduce on Hadoop

| Property | Detail |
|---|---|
| **Objective** | Upload test data and mapper/reducer to HDFS, run MapReduce on Hadoop |
| **Files to create** | `scripts/setup_hdfs.sh`, `scripts/run_mapreduce.sh` |
| **Tasks** | 1. Create `setup_hdfs.sh`: creates HDFS dirs, uploads mapper/reducer 2. Upload synthetic test data to HDFS 3. Run Hadoop Streaming job 4. Read output from HDFS 5. Verify output matches local test |
| **Expected output** | MapReduce job completes on Hadoop. Output in HDFS matches expected. |
| **Verification** | `docker exec bda-hadoop hdfs dfs -cat /bda-project/output/test/part-00000` shows correct counts |
| **Working afterward** | End-to-end MapReduce pipeline works on Hadoop |
| **Common failures** | Hadoop Streaming JAR path. Python not available in Hadoop container (may need to install). HDFS permissions. Output directory already exists (MR fails if output dir exists). |

> [!WARNING]
> The `apache/hadoop:3.3.6` Docker image may not have Python installed. If so, the Hadoop Streaming job cannot run Python mappers/reducers. **Mitigation:** Either install Python in the container via a Dockerfile, or use the `docker exec` approach where the consumer runs the MapReduce command from outside the container. **The implementer must verify this early.**

### Stage 6: Kafka Producer

| Property | Detail |
|---|---|
| **Objective** | Create the Python producer that reads Instacart data and streams to Kafka |
| **Files to create** | `producer/producer.py`, `producer/__init__.py` |
| **Tasks** | 1. Load `products.csv` into memory (lookup dict) 2. Load `orders.csv` into memory or use chunked read for `order_hour_of_day` lookup 3. Read `order_products__prior.csv` in chunks 4. For each row: join with orders (get hour) and products (get name), create JSON message 5. Produce to Kafka with `product_id` as key 6. Rate-limit with configurable `PRODUCER_RATE` 7. Implement burst mode (watch for `state/burst_signal.json`) |
| **Expected output** | Messages appearing in Kafka topic |
| **Verification** | `docker exec bda-kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic sales-events --from-beginning --max-messages 5` shows JSON messages |
| **Working afterward** | Producer streams data to Kafka |
| **Common failures** | Memory issues loading 32M rows. Must use chunked CSV reading. Kafka connection refused (container not ready). |

> [!IMPORTANT]
> **Memory management:** `order_products__prior.csv` is 578 MB. Do NOT load it entirely into memory. Use `pandas.read_csv(..., chunksize=10000)` or Python's `csv.reader` line-by-line. `orders.csv` (109 MB / 3.4M rows) and `products.csv` (2.2 MB / 50K rows) CAN be loaded into memory as lookup dicts.

### Stage 7: Kafka Consumer + Orchestrator

| Property | Detail |
|---|---|
| **Objective** | Create the consumer that reads from Kafka, writes to HDFS, and triggers MapReduce |
| **Files to create** | `consumer/consumer.py`, `consumer/__init__.py` |
| **Tasks** | 1. Connect to Kafka, subscribe to `sales-events` 2. Accumulate messages in a list for the current window 3. On window boundary (WINDOW_SIZE elapsed): a. Write accumulated messages as TSV to HDFS b. Trigger MapReduce via `scripts/run_mapreduce.sh` c. Wait for MapReduce to complete d. Invoke ranking engine e. Reset buffer for next window 4. Handle empty windows gracefully |
| **Expected output** | HDFS files appearing per window. MapReduce jobs completing. |
| **Verification** | `docker exec bda-hadoop hdfs dfs -ls /bda-project/windows/` shows window files. `docker exec bda-hadoop hdfs dfs -ls /bda-project/output/` shows MR output dirs. |
| **Working afterward** | Consumer → HDFS → MapReduce pipeline runs automatically per window |
| **Common failures** | HDFS command execution from local machine (need `docker exec`). MapReduce job timeout. Window timing issues. |

### Stage 8: Ranking + Momentum Engine

| Property | Detail |
|---|---|
| **Objective** | Create the ranking engine that processes MapReduce output into ranking JSON |
| **Files to create** | `engine/ranking.py`, `engine/__init__.py` |
| **Tasks** | 1. Read current window's MR output from HDFS 2. Read previous window's MR output (from state file) 3. Update cumulative totals 4. Compute momentum for each product 5. Generate top-10 by total units 6. Generate top-5 momentum movers 7. Write `state/ranking_output.json` 8. Write `state/ranking_state.json` (for persistence) |
| **Expected output** | `ranking_output.json` with correct top-10 and momentum data |
| **Verification** | `cat state/ranking_output.json \| python3 -m json.tool` shows valid ranking data |
| **Working afterward** | Full data pipeline: Kafka → HDFS → MapReduce → Ranking JSON |
| **Common failures** | State file corruption. Product name lookup failures. Division by zero (should be handled). |

### Stage 9: FastAPI Backend

| Property | Detail |
|---|---|
| **Objective** | Create FastAPI server that serves ranking data |
| **Files to create** | `api/main.py`, `api/__init__.py` |
| **Tasks** | 1. `GET /api/health` endpoint 2. `GET /api/rankings` reads and returns `ranking_output.json` 3. `POST /api/burst` writes `burst_signal.json` 4. CORS middleware for React dev server 5. Error handling for missing ranking file |
| **Expected output** | API responds with ranking data |
| **Verification** | `curl http://localhost:8000/api/health` returns OK. `curl http://localhost:8000/api/rankings` returns ranking JSON. |
| **Working afterward** | REST API serves ranking data |
| **Common failures** | CORS issues. File not found on first run (no ranking yet). JSON parsing errors. |

### Stage 10: React Dashboard

| Property | Detail |
|---|---|
| **Objective** | Create React dashboard that displays rankings |
| **Files to create** | `frontend/` (Vite + React project) |
| **Tasks** | 1. `cd frontend && npx -y create-vite@latest ./ --template react` 2. Create `RankingTable` component 3. Create `MomentumMovers` component 4. Create `StatusBar` component 5. Create `BurstControl` component 6. Implement polling logic 7. Implement dark theme styling 8. Add momentum indicators (▲/▼, color coding) |
| **Expected output** | Dashboard displays top-10 and updates automatically |
| **Verification** | Open `http://localhost:5173` in browser. Rankings update when pipeline runs. |
| **Working afterward** | Complete end-to-end: Dataset → Kafka → HDFS → MapReduce → Ranking → API → Dashboard |
| **Common failures** | CORS errors. API URL configuration. CSS layout issues. |

### Stage 11: Integration Testing

| Property | Detail |
|---|---|
| **Objective** | Verify end-to-end pipeline works correctly |
| **Files to create** | `tests/test_integration.py`, `scripts/start_all.sh` |
| **Tasks** | 1. Start all infrastructure (Docker) 2. Start all services 3. Verify messages flow through Kafka 4. Verify HDFS files are created 5. Verify MapReduce produces correct output 6. Verify ranking JSON is correct 7. Verify API returns data 8. Verify dashboard displays data 9. Test burst mode 10. Test window transitions |
| **Expected output** | All integration tests pass |
| **Verification** | `python3 -m pytest tests/test_integration.py -v` |
| **Working afterward** | Complete pipeline is verified end-to-end |
| **Common failures** | Timing issues between components. Stale state from previous runs. |

### Stage 12: Demo Preparation

| Property | Detail |
|---|---|
| **Objective** | Prepare for college demonstration |
| **Files to create** | `scripts/start_all.sh`, `scripts/demo_burst.sh`, `.env.demo` |
| **Tasks** | 1. Create startup script that launches everything in order 2. Create `.env.demo` with production window sizes 3. Test burst mode end-to-end 4. Prepare terminal layout 5. Rehearse demo flow 6. Document demo steps in README |
| **Expected output** | Demo runs smoothly from start to finish |
| **Verification** | Complete demo run-through with `.env.demo` configuration |
| **Working afterward** | Project is demo-ready |
| **Common failures** | Docker containers not starting. Stale state from previous runs. HDFS output directory already exists. |

---

## 18. Testing Strategy

### Synthetic Test Data

Create `tests/test_data/synthetic_transactions.tsv`:

```tsv
100	Apple	1	2026-09-27T17:00:00Z
100	Apple	1	2026-09-27T17:00:01Z
100	Apple	1	2026-09-27T17:00:02Z
200	Banana	1	2026-09-27T17:00:03Z
200	Banana	1	2026-09-27T17:00:04Z
300	Cherry	1	2026-09-27T17:00:05Z
```

Window 1 (previous): Apple=3, Banana=2, Cherry=1
Window 2 (current): Apple=1, Banana=4, Cherry=0

Expected results after Window 2:
- Cumulative: Apple=4, Banana=6, Cherry=1
- Momentum: Apple=(1-3)/3*100=-66.7%, Banana=(4-2)/2*100=100%, Cherry=(0-1)/1*100=-100%
- Top 3 by total: Banana(6), Apple(4), Cherry(1)
- Top momentum: Banana(+100%)

### Unit Tests

| Test | File | What it verifies |
|---|---|---|
| Mapper | `tests/test_mapper.py` | Reads TSV input, emits correct `product_id\tunits` output. Handles malformed lines. |
| Reducer | `tests/test_reducer.py` | Sums units per product_id correctly. Handles single-product and multi-product input. |
| Momentum | `tests/test_momentum.py` | `compute_momentum(20, 10)` = +100%. `compute_momentum(0, 0)` = 0%. `compute_momentum(5, 0)` = +500%. `compute_momentum(0, 10)` = -100%. |
| Ranking | `tests/test_ranking.py` | Top-10 selection. Correct sorting. Momentum computation for each product. State persistence. |
| FastAPI | `tests/test_api.py` | `/api/health` returns 200. `/api/rankings` returns valid schema. CORS headers present. |

### Testing the Mapper/Reducer Locally

```bash
# mapper test
echo -e "24852\tBanana\t1\t2026-09-27T17:00:00Z" | python3 mapreduce/mapper.py
# Expected: 24852	1

# reducer test  
echo -e "24852\t1\n24852\t1\n24852\t1" | python3 mapreduce/reducer.py
# Expected: 24852	3

# pipeline test
cat tests/test_data/synthetic_transactions.tsv | python3 mapreduce/mapper.py | sort | python3 mapreduce/reducer.py
# Expected:
# 100	3
# 200	2
# 300	1
```

### Edge Cases to Test

| Case | Input | Expected |
|---|---|---|
| Empty window | No messages in window | No MR job. Previous ranking maintained. |
| Single product | Only product_id=100 in window | Top-10 has 1 entry. |
| Burst effect | Product 300 goes from 1 to 50 units | Momentum = +4900% (capped at display) |
| Division by zero | Previous=0, Current=5 | Momentum = +500% (denominator = max(0,1) = 1) |
| All zeros | Previous=0, Current=0 | Momentum = 0% |
| Malformed input | Non-numeric units | Mapper skips the line |

---

## 19. Demo Plan

### 5–10 Minute College Demonstration

#### Setup (Before Demo)

```bash
# Terminal 0: Start infrastructure
docker compose up -d
# Wait 30 seconds
bash scripts/setup_hdfs.sh
```

#### Terminal Layout (4 terminals)

| Terminal | Purpose | Command |
|---|---|---|
| **T1** (top-left) | Kafka Producer | `python -m producer.producer` |
| **T2** (top-right) | Kafka Consumer + Pipeline | `python -m consumer.consumer` |
| **T3** (bottom-left) | FastAPI | `uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload` |
| **T4** (bottom-right) | Monitoring / HDFS checks | (manual commands) |
| **Browser** | React Dashboard | `http://localhost:5173` |

#### Demo Script

| Time | Action | What audience sees | What to explain |
|---|---|---|---|
| 0:00 | Show Docker containers running | `docker compose ps` — Kafka + Hadoop healthy | "We have Kafka for message streaming and Hadoop for distributed storage and processing." |
| 0:30 | Start FastAPI (T3) | Server starts on port 8000 | "FastAPI serves our ranking data as a REST API." |
| 1:00 | Open React dashboard in browser | Empty dashboard, waiting for data | "React polls the API every 5 seconds." |
| 1:30 | Start Consumer (T2) | Consumer connects to Kafka, waiting for messages | "The consumer reads from Kafka, writes to HDFS, and triggers MapReduce." |
| 2:00 | Start Producer (T1) | Messages flowing, producer logs showing rate | "The producer simulates a live transaction stream from the Instacart dataset." |
| 2:30 | Show Kafka messages (T4) | `kafka-console-consumer` shows JSON messages | "Real Kafka messages. Each is a product purchase event." |
| 3:00 | Wait for first window to complete | Consumer logs: "Window complete. Writing to HDFS..." | "After 60 seconds (dev mode), the consumer flushes to HDFS." |
| 3:30 | Show HDFS files (T4) | `hdfs dfs -ls /bda-project/windows/` shows file | "Data is stored in HDFS, Hadoop's distributed filesystem." |
| 4:00 | MapReduce job runs | Consumer logs: "MapReduce job started..." then "completed" | "Hadoop MapReduce aggregates units sold per product." |
| 4:30 | Show MapReduce output (T4) | `hdfs dfs -cat /bda-project/output/window_.../part-00000` | "MapReduce output: each product and its unit count." |
| 5:00 | Dashboard updates | Top-10 products appear with Banana at #1 | "The ranking refreshes automatically. Banana is #1 — consistent with Instacart data." |
| 5:30 | Wait for second window | Dashboard updates again. Momentum column shows values. | "Now we have two windows, so momentum is calculated." |
| 6:00 | **Trigger sales burst** | Click "Burst" button in dashboard for product "Organic Hass Avocado" | "Let's simulate a sudden surge in avocado purchases." |
| 7:00 | Next window completes | Avocado's current_window_units spike. Momentum shows +500% or similar. | "Notice the momentum column — avocado is surging." |
| 7:30 | Show momentum movers | Avocado appears in momentum movers section | "The system detects rapidly changing products even if they're not #1 overall." |
| 8:00 | Show HDFS data growth (T4) | `hdfs dfs -ls /bda-project/windows/` shows multiple files | "HDFS retains windowed data for analysis." |
| 8:30 | Show API directly | `curl localhost:8000/api/rankings \| python3 -m json.tool` | "The FastAPI endpoint returns structured JSON." |
| 9:00 | Wrap up | Stop producer. Show final ranking. | "This system gives merchandising teams real-time visibility into product momentum." |

#### Key Points to Emphasize During Demo

1. **"Kafka is real"** — show messages with `kafka-console-consumer`
2. **"HDFS is real"** — show files with `hdfs dfs -ls`
3. **"MapReduce is real"** — show job execution and output
4. **"The stream is simulated"** — acknowledge honestly that the data source is historical
5. **"Momentum detects change"** — the burst demonstrates intraday momentum detection

---

## 20. Risks and Fallbacks

| # | Risk | Impact | Mitigation | Fallback |
|---|---|---|---|---|
| 1 | **Hadoop container has no Python** | MapReduce cannot run Python mapper/reducer | Check image on Day 1. If missing, create a Dockerfile that extends `apache/hadoop:3.3.6` and installs Python. | Use a custom Dockerfile: `FROM apache/hadoop:3.3.6` + `RUN apt-get install -y python3` |
| 2 | **Hadoop container startup fails** | HDFS/YARN not available | The `apache/hadoop:3.3.6` image may need specific env vars. Check official docs. Try the image's default entrypoint first. | Use a known-working Hadoop Docker setup (e.g., `sequenceiq/hadoop-docker` or `bde2020/hadoop-namenode`). |
| 3 | **32M rows too large for producer** | Out-of-memory error | Use chunked CSV reading (`chunksize=10000`). Never load full file into memory. | Use only the first 500K rows. This is still 10x larger than Amazon and sufficient for demo. |
| 4 | **HDFS commands from host** | `hdfs dfs` not installed on host machine | Use `docker exec bda-hadoop hdfs dfs ...` from the consumer. | All HDFS operations go through `docker exec`. |
| 5 | **MapReduce output dir exists** | Hadoop fails if output directory already exists | Delete output directory before each MR job: `hdfs dfs -rm -r /bda-project/output/window_<ts>` | Always clean output dir in `run_mapreduce.sh` before launching job. |
| 6 | **Kafka connection refused** | Producer/consumer can't connect | Wait for Kafka health check. Implement retry logic with backoff. | Add 30-second sleep and retry in producer/consumer startup. |
| 7 | **Port conflicts** | Services can't bind | Document required ports. Check with `lsof -i :9092` before starting. | Use alternate ports in docker-compose.yml. |
| 8 | **Window timing issues** | Windows are inconsistent size | Use wall-clock time, not message count. | Timer-based windows are more reliable than count-based. |
| 9 | **No data in first window** | Empty ranking on startup | Rank shows "No data yet" instead of empty table. | Default state with empty arrays. Dashboard handles gracefully. |
| 10 | **Historical data ≠ real-time** | Viva question: "Is this real-time?" | Honest answer: "The Kafka/HDFS/MapReduce infrastructure is real. The data source is a historical simulation." | Always have `"source": "historical_simulation"` in Kafka messages. |
| 11 | **Laptop resource limits** | Docker + Kafka + Hadoop + Python processes | Kafka: ~256MB. Hadoop: ~512MB. Total Docker ~1GB. Acceptable for 8GB+ laptop. | Reduce Kafka heap, reduce YARN memory. |
| 12 | **orders.csv join performance** | 3.4M rows × 32M rows join is expensive | Pre-build an `order_id → order_hour_of_day` lookup dict from orders.csv (~3.4M entries, ~150MB in memory). This is feasible. | Sample orders.csv if memory is an issue. |
| 13 | **Stale state between runs** | Old ranking_state.json causes wrong results | Clear `state/` directory on fresh start. Add `--fresh` flag to consumer. | `scripts/cleanup.sh` clears all state. |

---

## 21. Initial Scaffolding Changes

The following files should be created in this architecture session as they define the contract for all subsequent implementation:

### Files to Create Now

1. **`.env`** — Development configuration
2. **`.env.example`** — Documented template
3. **`.env.demo`** — Demo configuration
4. **`config/settings.py`** — Centralized configuration module
5. **`requirements.txt`** — Python dependencies
6. **`.gitignore`** — Standard ignores
7. **Directory stubs** — `__init__.py` files for packages

---

## 22. Ready for Implementation Checklist

The implementing model (Gemini 3.6 Flash Medium) should verify each of these before starting each stage:

- [x] **Dataset:** Use Instacart. Primary files: `order_products__prior.csv`, `orders.csv`, `products.csv`
- [x] **Docker images:** `apache/kafka:3.7.0` pulled, `apache/hadoop:3.3.6` available
- [x] **Python packages:** `kafka-python`, `fastapi`, `uvicorn`, `pandas` installed
- [x] **Node.js:** Available for React frontend
- [x] **Configuration:** All env vars read from `config/settings.py`, never hard-coded
- [x] **MapReduce:** Python mapper + reducer via Hadoop Streaming. Tested locally first with Unix pipes.
- [x] **HDFS operations:** Via `docker exec bda-hadoop hdfs dfs ...`
- [ ] **Kafka messages:** JSON, key=product_id string, value=JSON object
- [x] **Window size:** Configurable. Dev=60s, Demo=600s.
- [ ] **Ranking output:** JSON file read by FastAPI. Not a database.
- [ ] **State management:** Local JSON files in `state/` directory.
- [ ] **Frontend:** React + Vite. Polls `GET /api/rankings` every 5 seconds.
- [ ] **Burst mode:** Signal file mechanism. Producer watches `state/burst_signal.json`.
- [ ] **Honesty:** All Kafka messages include `"source": "historical_simulation"`.
- [ ] **No Java app code:** All custom code is Python (backend) or JavaScript (frontend).
- [x] **Test first:** MapReduce mapper/reducer tested with Unix pipes before running on Hadoop.
- [ ] **Stage order:** Follow the 12-stage roadmap sequentially. Do not skip stages.
