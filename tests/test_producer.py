"""
Unit tests for Stage 6 — Kafka Producer.
"""

import json
from pathlib import Path
import tempfile
import time
import pytest

from config.settings import Settings
from producer.producer import InstacartProducer


def test_producer_initialization():
    """Verify InstacartProducer can be initialized in dry-run mode."""
    producer = InstacartProducer(dry_run=True, rate=1000)
    assert producer.dry_run is True
    assert producer.rate == 1000


def test_producer_event_schema():
    """Verify generated JSON event matches architecture spec requirements."""
    producer = InstacartProducer(dry_run=True)
    # Manually populate small lookups for test
    producer.products[24852] = {
        "product_name": "Banana",
        "category": "fresh fruits",
        "department": "produce"
    }
    producer.orders[10] = (14, 2)

    event = producer.create_event(order_id=10, product_id=24852)

    assert event["product_id"] == 24852
    assert event["product_name"] == "Banana"
    assert event["category"] == "fresh fruits"
    assert event["department"] == "produce"
    assert event["units"] == 1
    assert event["order_hour"] == 14
    assert event["order_dow"] == 2
    assert event["source"] == "historical_simulation"
    assert "event_time" in event
    assert isinstance(event["event_time"], str)


def test_chunked_reading_generator(tmp_path):
    """Verify chunked reading yields chunks of configured size."""
    # Create synthetic order_products file
    csv_file = tmp_path / "order_products.csv"
    with open(csv_file, "w", encoding="utf-8") as f:
        f.write("order_id,product_id,add_to_cart_order,reordered\n")
        for i in range(25):
            f.write(f"{i+1},{100 + i},1,0\n")

    settings = Settings()
    settings.ORDER_PRODUCTS_FILE = csv_file

    producer = InstacartProducer(settings=settings, chunk_size=10, dry_run=True)
    chunks = list(producer.read_order_products_chunks())

    assert len(chunks) == 3
    assert len(chunks[0]) == 10
    assert len(chunks[1]) == 10
    assert len(chunks[2]) == 5
    assert chunks[0][0] == (1, 100)


def test_burst_mode_signal(tmp_path):
    """Verify burst signal file detection and burst multiplier."""
    settings = Settings()
    signal_file = tmp_path / "burst_signal.json"
    settings.BURST_SIGNAL_FILE = signal_file

    burst_data = {
        "product_id": 24852,
        "multiplier": 5,
        "duration_seconds": 60
    }
    with open(signal_file, "w", encoding="utf-8") as f:
        json.dump(burst_data, f)

    producer = InstacartProducer(settings=settings, dry_run=True)
    pid, mult = producer.check_burst_signal()

    assert pid == 24852
    assert mult == 5


def test_bounded_producer_run():
    """Verify producer stops cleanly after max_messages in dry-run mode."""
    producer = InstacartProducer(dry_run=True, rate=10000, chunk_size=50)
    # Mock lookup dicts so run() doesn't need to load 3.4M orders for a dry-run test
    producer.products[33120] = {"product_name": "Test Prod", "category": "cat", "department": "dept"}
    producer.orders[2] = (10, 1)

    # Override load_products / load_orders to be no-ops
    producer.load_products = lambda: None
    producer.load_orders = lambda: None

    count = producer.run(max_messages=15)
    assert count == 15
