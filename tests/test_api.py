"""
Tests for Stage 9 — FastAPI Backend (api/main.py).

Verifies health check, ranking retrieval, missing/malformed ranking handling,
burst signal generation, input validation, and CORS response headers.
"""

import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from api.main import app, settings


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def temp_state_dir(tmp_path, monkeypatch):
    """Fixture overriding STATE_DIR, RANKING_OUTPUT_FILE, and BURST_SIGNAL_FILE for isolated testing."""
    state_dir = tmp_path / "state"
    state_dir.mkdir(parents=True, exist_ok=True)

    ranking_output = state_dir / "ranking_output.json"
    burst_signal = state_dir / "burst_signal.json"

    monkeypatch.setattr(settings, "STATE_DIR", state_dir)
    monkeypatch.setattr(settings, "RANKING_OUTPUT_FILE", ranking_output)
    monkeypatch.setattr(settings, "BURST_SIGNAL_FILE", burst_signal)

    return state_dir


def test_health_check_no_ranking_file(client, temp_state_dir):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["last_updated"] is None
    assert data["current_window"] is None


def test_health_check_with_ranking_file(client, temp_state_dir):
    ranking_file = settings.RANKING_OUTPUT_FILE
    dummy_data = {
        "last_updated": "2026-10-03T12:00:00Z",
        "window_id": "window_20261003_120000",
        "total_windows_processed": 1,
        "top_10": [],
        "momentum_movers": [],
    }
    ranking_file.write_text(json.dumps(dummy_data), encoding="utf-8")

    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["last_updated"] == "2026-10-03T12:00:00Z"
    assert data["current_window"] == "window_20261003_120000"


def test_get_rankings_no_state_file(client, temp_state_dir):
    response = client.get("/api/rankings")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "no_data"
    assert data["top_10"] == []
    assert data["momentum_movers"] == []
    assert data["total_windows_processed"] == 0


def test_get_rankings_controlled_json(client, temp_state_dir):
    ranking_file = settings.RANKING_OUTPUT_FILE
    sample_ranking = {
        "last_updated": "2026-10-03T12:05:00Z",
        "window_id": "window_20261003_120500",
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
                "momentum_direction": "up",
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
                "momentum_direction": "up",
            }
        ],
    }
    ranking_file.write_text(json.dumps(sample_ranking), encoding="utf-8")

    response = client.get("/api/rankings")
    assert response.status_code == 200
    data = response.json()
    assert data == sample_ranking
    assert len(data["top_10"]) == 1
    assert data["top_10"][0]["product_id"] == 24852


def test_get_rankings_malformed_json(client, temp_state_dir):
    ranking_file = settings.RANKING_OUTPUT_FILE
    ranking_file.write_text("NOT_VALID_JSON{{{", encoding="utf-8")

    response = client.get("/api/rankings")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["top_10"] == []
    assert data["momentum_movers"] == []


def test_get_rankings_non_dict_json(client, temp_state_dir):
    ranking_file = settings.RANKING_OUTPUT_FILE
    ranking_file.write_text(json.dumps([1, 2, 3]), encoding="utf-8")

    response = client.get("/api/rankings")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "invalid_state"
    assert data["top_10"] == []


def test_post_burst_valid_defaults(client, temp_state_dir):
    payload = {"product_id": 24852}
    response = client.post("/api/burst", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "burst_started"
    assert data["product_id"] == 24852
    assert data["multiplier"] == settings.BURST_MULTIPLIER
    assert data["duration_seconds"] == settings.BURST_DURATION

    burst_file = settings.BURST_SIGNAL_FILE
    assert burst_file.exists()
    saved = json.loads(burst_file.read_text(encoding="utf-8"))
    assert saved["product_id"] == 24852
    assert saved["multiplier"] == settings.BURST_MULTIPLIER
    assert saved["duration_seconds"] == settings.BURST_DURATION


def test_post_burst_valid_custom_values(client, temp_state_dir):
    payload = {
        "product_id": 47209,
        "multiplier": 15,
        "duration_seconds": 300,
    }
    response = client.post("/api/burst", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "burst_started"
    assert data["product_id"] == 47209
    assert data["multiplier"] == 15
    assert data["duration_seconds"] == 300

    burst_file = settings.BURST_SIGNAL_FILE
    assert burst_file.exists()
    saved = json.loads(burst_file.read_text(encoding="utf-8"))
    assert saved == payload


def test_post_burst_invalid_product_id(client, temp_state_dir):
    # Non-positive product_id (<= 0)
    response = client.post("/api/burst", json={"product_id": -10})
    assert response.status_code == 400
    assert "product_id" in response.json()["detail"]

    response = client.post("/api/burst", json={"product_id": 0})
    assert response.status_code == 400

    # Missing product_id -> 422 validation error
    response = client.post("/api/burst", json={})
    assert response.status_code == 422


def test_post_burst_invalid_multiplier_or_duration(client, temp_state_dir):
    response = client.post("/api/burst", json={"product_id": 100, "multiplier": 0})
    assert response.status_code == 400
    assert "multiplier" in response.json()["detail"]

    response = client.post("/api/burst", json={"product_id": 100, "duration_seconds": -5})
    assert response.status_code == 400
    assert "duration_seconds" in response.json()["detail"]


def test_cors_header_present(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
