"""
Tests for Stage 2 Configuration and Scaffolding.
"""

import os
from pathlib import Path
import pytest
from config.settings import Settings


def test_default_settings():
    """Verify default settings loaded from .env."""
    settings = Settings()
    assert settings.WINDOW_SIZE == 60
    assert settings.REFRESH_INTERVAL == 60
    assert settings.KAFKA_TOPIC == "sales-events"
    assert settings.HDFS_BASE_PATH == "/bda-project"
    assert settings.STATE_DIR.exists()


def test_env_override(monkeypatch):
    """Verify configuration loads properly from environment variables."""
    monkeypatch.setenv("WINDOW_SIZE", "120")
    monkeypatch.setenv("REFRESH_INTERVAL", "120")
    monkeypatch.setenv("PRODUCER_RATE", "100")
    settings = Settings()
    assert settings.WINDOW_SIZE == 120
    assert settings.REFRESH_INTERVAL == 120
    assert settings.PRODUCER_RATE == 100


def test_dataset_files_exist():
    """Verify raw dataset files expected by settings exist and are untouched."""
    settings = Settings()
    assert settings.ORDERS_FILE.exists(), f"Missing {settings.ORDERS_FILE}"
    assert settings.PRODUCTS_FILE.exists(), f"Missing {settings.PRODUCTS_FILE}"
    assert settings.ORDER_PRODUCTS_FILE.exists(), f"Missing {settings.ORDER_PRODUCTS_FILE}"


def test_package_structure():
    """Verify required Python package init files exist."""
    project_root = Path(__file__).resolve().parent.parent
    packages = ["producer", "consumer", "mapreduce", "engine", "api", "config", "tests"]
    for pkg in packages:
        init_file = project_root / pkg / "__init__.py"
        assert init_file.exists(), f"Missing __init__.py in package {pkg}"
