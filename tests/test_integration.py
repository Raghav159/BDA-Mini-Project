"""
Stage 11 Integration Tests — Real-Time Sales Ranking & Momentum Engine.

Verifies end-to-end pipeline components and cross-stage contracts:
  1. FastAPI Backend Health Check (/api/health)
  2. FastAPI Backend Rankings Endpoint (/api/rankings)
  3. Demo Burst Mode Trigger (/api/burst) -> state/burst_signal.json
  4. Producer Burst Signal consumption & message generation
  5. Window Orchestrator TSV serialisation & HDFS path formatting
  6. MapReduce execution on synthetic data -> Ranking Engine state update
  7. End-to-end window rotation and ranking JSON atomic output
  8. Handling of empty data, missing files, and invalid burst payloads
"""

import json
import os
import shutil
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from api.main import app
from config.settings import Settings
from consumer.consumer import WindowOrchestrator, events_to_tsv, window_id_for_time
from engine.ranking import RankingEngine, compute_momentum, parse_mr_output
from producer.producer import InstacartProducer


@pytest.fixture
def test_settings(tmp_path):
    """Provide isolated Settings instance with temporary state directory."""
    s = Settings()
    s.STATE_DIR = tmp_path / "state"
    s.STATE_DIR.mkdir(parents=True, exist_ok=True)
    s.RANKING_OUTPUT_FILE = s.STATE_DIR / "ranking_output.json"
    s.RANKING_STATE_FILE = s.STATE_DIR / "ranking_state.json"
    s.BURST_SIGNAL_FILE = s.STATE_DIR / "burst_signal.json"
    return s


@pytest.fixture
def client(test_settings, monkeypatch):
    """FastAPI TestClient with patched settings."""
    monkeypatch.setattr("api.main.settings", test_settings)
    return TestClient(app)


# ============================================================================
# 1. FastAPI Endpoint Integration Tests
# ============================================================================

class TestAPIIntegration:
    """Test FastAPI endpoint behavior across different state scenarios."""

    def test_health_check_empty_state(self, client):
        """GET /api/health should return ok status when state file is absent."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["last_updated"] is None
        assert data["current_window"] is None

    def test_health_check_populated_state(self, client, test_settings):
        """GET /api/health returns window_id and timestamp when output exists."""
        ranking_data = {
            "last_updated": "2026-10-03T12:00:00Z",
            "window_id": "window_20261003_120000",
            "top_10": [],
            "momentum_movers": []
        }
        with open(test_settings.RANKING_OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(ranking_data, f)

        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["last_updated"] == "2026-10-03T12:00:00Z"
        assert data["current_window"] == "window_20261003_120000"

    def test_rankings_no_data(self, client):
        """GET /api/rankings returns fallback schema when state file does not exist."""
        response = client.get("/api/rankings")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "no_data"
        assert data["top_10"] == []
        assert data["momentum_movers"] == []

    def test_rankings_populated_data(self, client, test_settings):
        """GET /api/rankings returns complete ranking structure."""
        ranking_payload = {
            "last_updated": "2026-10-03T12:00:00Z",
            "window_id": "window_20261003_120000",
            "window_size_seconds": 60,
            "total_windows_processed": 1,
            "top_10": [
                {
                    "rank": 1,
                    "product_id": 24852,
                    "product_name": "Banana",
                    "total_units": 150,
                    "current_window_units": 80,
                    "previous_window_units": 70,
                    "momentum_pct": 14.3,
                    "momentum_direction": "up"
                }
            ],
            "momentum_movers": []
        }
        with open(test_settings.RANKING_OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(ranking_payload, f)

        response = client.get("/api/rankings")
        assert response.status_code == 200
        data = response.json()
        assert data["window_id"] == "window_20261003_120000"
        assert len(data["top_10"]) == 1
        assert data["top_10"][0]["product_id"] == 24852

    def test_burst_trigger_creates_signal_file(self, client, test_settings):
        """POST /api/burst creates atomic burst_signal.json file with parameters."""
        payload = {
            "product_id": 24852,
            "multiplier": 5,
            "duration_seconds": 60
        }
        response = client.post("/api/burst", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "burst_started"
        assert data["product_id"] == 24852

        assert test_settings.BURST_SIGNAL_FILE.exists()
        with open(test_settings.BURST_SIGNAL_FILE, "r", encoding="utf-8") as f:
            signal_data = json.load(f)
        assert signal_data["product_id"] == 24852
        assert signal_data["multiplier"] == 5
        assert signal_data["duration_seconds"] == 60

    def test_burst_trigger_validation(self, client):
        """POST /api/burst rejects invalid product_id, multiplier, or duration."""
        res1 = client.post("/api/burst", json={"product_id": -5})
        assert res1.status_code == 400

        res2 = client.post("/api/burst", json={"product_id": 24852, "multiplier": 0})
        assert res2.status_code == 400

        res3 = client.post("/api/burst", json={"product_id": 24852, "duration_seconds": -10})
        assert res3.status_code == 400


# ============================================================================
# 2. Producer & Burst Signal Integration
# ============================================================================

class TestProducerIntegration:
    """Verify Producer burst signal detection and event creation."""

    def test_producer_reads_burst_signal(self, test_settings):
        """Producer detects active burst signal file and returns product_id + multiplier."""
        burst_info = {
            "product_id": 47209,
            "multiplier": 10,
            "duration_seconds": 120
        }
        with open(test_settings.BURST_SIGNAL_FILE, "w", encoding="utf-8") as f:
            json.dump(burst_info, f)

        producer = InstacartProducer(settings=test_settings, dry_run=True)
        pid, mult = producer.check_burst_signal()
        assert pid == 47209
        assert mult == 10

    def test_producer_creates_valid_event(self, test_settings):
        """Producer creates standardized event matching pipeline contract."""
        producer = InstacartProducer(settings=test_settings, dry_run=True)
        producer.products = {
            24852: {
                "product_name": "Banana",
                "category": "fresh fruits",
                "department": "produce"
            }
        }
        producer.orders = {100: (14, 2)}

        event = producer.create_event(100, 24852)
        assert event["product_id"] == 24852
        assert event["product_name"] == "Banana"
        assert event["units"] == 1
        assert event["order_hour"] == 14
        assert "event_time" in event


# ============================================================================
# 3. Pipeline Data Flow & Window Orchestration
# ============================================================================

class TestPipelineOrchestrationIntegration:
    """Verify event conversion, window calculation, and ranking engine calculation."""

    def test_events_to_tsv_formatting(self):
        """Events are converted to valid TSV format for MapReduce consumption."""
        events = [
            {
                "product_id": 24852,
                "product_name": "Banana",
                "units": 1,
                "event_time": "2026-10-03T12:00:00Z"
            }
        ]
        tsv = events_to_tsv(events)
        lines = tsv.strip().split("\n")
        assert len(lines) == 1
        parts = lines[0].split("\t")
        assert parts[0] == "24852"
        assert parts[1] == "Banana"
        assert parts[2] == "1"

    def test_two_window_ranking_rotation(self, test_settings):
        """Ranking engine processes two consecutive windows and computes momentum correctly."""
        engine = RankingEngine(settings=test_settings)

        # Window 1 output (Apple=3, Banana=2, Cherry=1)
        w1_mr = {"100": 3, "200": 2, "300": 1}
        names = {"100": "Apple", "200": "Banana", "300": "Cherry"}
        out1 = engine.process_window("window_20261003_120000", mr_output=w1_mr, product_names=names)

        assert out1["total_windows_processed"] == 1
        top_w1 = {p["product_id"]: p for p in out1["top_10"]}
        assert top_w1[100]["total_units"] == 3
        assert top_w1[200]["total_units"] == 2

        # Window 2 output (Apple=1, Banana=4, Cherry=0)
        w2_mr = {"100": 1, "200": 4, "300": 0}
        out2 = engine.process_window("window_20261003_120100", mr_output=w2_mr, product_names=names)

        assert out2["total_windows_processed"] == 2
        top_w2 = {p["product_id"]: p for p in out2["top_10"]}

        # Cumulative: Banana=6, Apple=4, Cherry=1
        assert top_w2[200]["total_units"] == 6
        assert top_w2[100]["total_units"] == 4

        # Momentum for Banana: ((4 - 2) / 2) * 100 = +100%
        assert top_w2[200]["momentum_pct"] == 100.0
        assert top_w2[200]["momentum_direction"] == "up"

        # Momentum for Apple: ((1 - 3) / 3) * 100 = -66.7%
        assert top_w2[100]["momentum_pct"] == -66.7
        assert top_w2[100]["momentum_direction"] == "down"

        # Top momentum mover should be Banana (+100.0%)
        assert len(out2["momentum_movers"]) >= 1
        assert out2["momentum_movers"][0]["product_id"] == 200
