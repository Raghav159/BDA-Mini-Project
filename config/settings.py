"""
Centralized configuration for BDA Mini Project.

All configuration is read from environment variables with sensible defaults.
Every module in the project imports settings from here — never hard-code values.

Usage:
    from config.settings import Settings
    settings = Settings()
    print(settings.WINDOW_SIZE)
"""

import os
from pathlib import Path

# Load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    # Find the project root (parent of config/)
    _project_root = Path(__file__).resolve().parent.parent
    load_dotenv(_project_root / ".env")
except ImportError:
    pass


class Settings:
    """Read-only settings from environment variables."""

    def __init__(self):
        # --- Project paths ---
        self.PROJECT_ROOT = Path(__file__).resolve().parent.parent
        self.DATASET_PATH = self.PROJECT_ROOT / os.getenv("DATASET_PATH", "datasets/instacart")
        self.STATE_DIR = self.PROJECT_ROOT / "state"
        self.STATE_DIR.mkdir(parents=True, exist_ok=True)

        # --- Windowing (all values in SECONDS) ---
        self.WINDOW_SIZE = int(os.getenv("WINDOW_SIZE", "60"))
        self.REFRESH_INTERVAL = int(os.getenv("REFRESH_INTERVAL", "60"))

        # --- Kafka ---
        self.KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        self.KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "sales-events")
        self.KAFKA_CONSUMER_GROUP = os.getenv("KAFKA_CONSUMER_GROUP", "ranking-engine-group")

        # --- Producer ---
        self.PRODUCER_RATE = int(os.getenv("PRODUCER_RATE", "50"))
        self.BURST_PRODUCT_ID = os.getenv("BURST_PRODUCT_ID", "") or None
        self.BURST_MULTIPLIER = int(os.getenv("BURST_MULTIPLIER", "10"))
        self.BURST_DURATION = int(os.getenv("BURST_DURATION", "120"))

        # --- HDFS ---
        self.HDFS_BASE_PATH = os.getenv("HDFS_BASE_PATH", "/bda-project")
        self.HADOOP_CONTAINER = os.getenv("HADOOP_CONTAINER", "bda-hadoop")

        # --- FastAPI ---
        self.API_HOST = os.getenv("API_HOST", "0.0.0.0")
        self.API_PORT = int(os.getenv("API_PORT", "8000"))
        origins_str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        self.CORS_ORIGINS = [o.strip() for o in origins_str.split(",") if o.strip()]

        # --- Derived paths ---
        self.RANKING_OUTPUT_FILE = self.STATE_DIR / "ranking_output.json"
        self.RANKING_STATE_FILE = self.STATE_DIR / "ranking_state.json"
        self.BURST_SIGNAL_FILE = self.STATE_DIR / "burst_signal.json"

        # --- Dataset files ---
        self.ORDERS_FILE = self.DATASET_PATH / "orders.csv"
        self.PRODUCTS_FILE = self.DATASET_PATH / "products.csv"
        self.ORDER_PRODUCTS_FILE = self.DATASET_PATH / "order_products__prior.csv"
        self.AISLES_FILE = self.DATASET_PATH / "aisles.csv"
        self.DEPARTMENTS_FILE = self.DATASET_PATH / "departments.csv"

    def __repr__(self):
        return (
            f"Settings(\n"
            f"  WINDOW_SIZE={self.WINDOW_SIZE}s,\n"
            f"  REFRESH_INTERVAL={self.REFRESH_INTERVAL}s,\n"
            f"  KAFKA_BOOTSTRAP_SERVERS={self.KAFKA_BOOTSTRAP_SERVERS},\n"
            f"  KAFKA_TOPIC={self.KAFKA_TOPIC},\n"
            f"  PRODUCER_RATE={self.PRODUCER_RATE} msg/s,\n"
            f"  HDFS_BASE_PATH={self.HDFS_BASE_PATH},\n"
            f"  DATASET_PATH={self.DATASET_PATH}\n"
            f")"
        )
