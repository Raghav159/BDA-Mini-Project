"""
Kafka Producer for real Instacart dataset sales events.

Streams transactions from order_products__prior.csv incrementally in chunks,
enriching each record with order details (order_hour_of_day) and product metadata.
Supports rate-limiting via PRODUCER_RATE and burst mode via state/burst_signal.json.
"""

import argparse
import csv
from datetime import datetime, timezone
import json
import logging
import os
import sys
import time
from typing import Any, Dict, Generator, Optional, Tuple

# Python 3.12 Windows compatibility patch for kafka-python selectors
import selectors
if hasattr(selectors, "SelectSelector"):
    _orig_unregister = selectors.SelectSelector.unregister
    def _safe_unregister(self, fileobj):
        try:
            return _orig_unregister(self, fileobj)
        except Exception:
            key = None
            try:
                fd = fileobj.fileno() if hasattr(fileobj, "fileno") else -1
            except Exception:
                fd = -1
            for reg_fd, reg_key in list(getattr(self, "_map", {}).items()):
                if reg_key.fileobj == fileobj or (fd != -1 and reg_fd == fd):
                    key = reg_key
                    break
            if key is not None:
                self._map.pop(key.fd, None)
                if hasattr(self, "_readers") and self._readers is not None:
                    self._readers.discard(key.fd)
                if hasattr(self, "_writers") and self._writers is not None:
                    self._writers.discard(key.fd)
                return key
            return None
    selectors.SelectSelector.unregister = _safe_unregister


from kafka import KafkaProducer
from kafka.errors import KafkaError

from config.settings import Settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("InstacartProducer")


class InstacartProducer:
    """
    Kafka Producer that streams real Instacart dataset sales events.
    Reads datasets incrementally in chunks to minimize memory footprint.
    """

    def __init__(
        self,
        settings: Optional[Settings] = None,
        bootstrap_servers: Optional[str] = None,
        topic: Optional[str] = None,
        rate: Optional[int] = None,
        chunk_size: int = 10000,
        dry_run: bool = False,
    ):
        self.settings = settings or Settings()
        self.bootstrap_servers = bootstrap_servers or self.settings.KAFKA_BOOTSTRAP_SERVERS
        self.topic = topic or self.settings.KAFKA_TOPIC
        self.rate = rate or self.settings.PRODUCER_RATE
        self.chunk_size = chunk_size
        self.dry_run = dry_run

        self.products: Dict[int, Dict[str, str]] = {}
        self.orders: Dict[int, Tuple[int, int]] = {}
        self.departments: Dict[int, str] = {}
        self.aisles: Dict[int, str] = {}

        self.burst_start_time: Optional[float] = None
        self.active_burst_id: Optional[int] = None

        self.producer: Optional[KafkaProducer] = None
        if not self.dry_run:
            self._init_kafka_producer()

    def _init_kafka_producer(self) -> None:
        """Initialize KafkaProducer instance."""
        try:
            logger.info(f"Connecting to Kafka broker at {self.bootstrap_servers}...")
            self.producer = KafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                api_version=(2, 6, 0),
                key_serializer=lambda k: str(k).encode("utf-8"),
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                acks=1,
                linger_ms=10,
                retries=3
            )
            logger.info(f"Connected to Kafka broker. Target topic: {self.topic}")
        except Exception as e:
            logger.error(f"Failed to connect to Kafka broker at {self.bootstrap_servers}: {e}")
            raise

    def load_departments(self) -> None:
        """Load department_id -> department_name mapping."""
        dep_file = self.settings.DEPARTMENTS_FILE
        if not dep_file.exists():
            logger.warning(f"Departments file not found at {dep_file}")
            return

        logger.info(f"Loading departments from {dep_file}...")
        try:
            with open(dep_file, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        dep_id = int(row["department_id"])
                        self.departments[dep_id] = row["department"]
                    except (ValueError, KeyError):
                        continue
            logger.info(f"Loaded {len(self.departments)} departments.")
        except Exception as e:
            logger.error(f"Error loading departments file: {e}")

    def load_aisles(self) -> None:
        """Load aisle_id -> aisle_name mapping."""
        aisle_file = self.settings.AISLES_FILE
        if not aisle_file.exists():
            logger.warning(f"Aisles file not found at {aisle_file}")
            return

        logger.info(f"Loading aisles from {aisle_file}...")
        try:
            with open(aisle_file, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        aisle_id = int(row["aisle_id"])
                        self.aisles[aisle_id] = row["aisle"]
                    except (ValueError, KeyError):
                        continue
            logger.info(f"Loaded {len(self.aisles)} aisles.")
        except Exception as e:
            logger.error(f"Error loading aisles file: {e}")

    def load_products(self) -> None:
        """Load products lookup table: product_id -> {product_name, category, department}."""
        self.load_departments()
        self.load_aisles()

        prod_file = self.settings.PRODUCTS_FILE
        if not prod_file.exists():
            raise FileNotFoundError(f"Products file not found at {prod_file}")

        logger.info(f"Loading products lookup from {prod_file}...")
        try:
            with open(prod_file, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        pid = int(row["product_id"])
                        pname = row["product_name"]
                        aisle_id = int(row.get("aisle_id", 0))
                        dept_id = int(row.get("department_id", 0))

                        category = self.aisles.get(aisle_id, "unknown")
                        department = self.departments.get(dept_id, "unknown")

                        self.products[pid] = {
                            "product_name": pname,
                            "category": category,
                            "department": department
                        }
                    except (ValueError, KeyError) as err:
                        logger.debug(f"Skipping invalid product row {row}: {err}")
                        continue
            logger.info(f"Loaded {len(self.products)} products into memory lookup.")
        except Exception as e:
            logger.error(f"Error loading products: {e}")
            raise

    def load_orders(self) -> None:
        """Load orders lookup table: order_id -> (order_hour_of_day, order_dow)."""
        orders_file = self.settings.ORDERS_FILE
        if not orders_file.exists():
            raise FileNotFoundError(f"Orders file not found at {orders_file}")

        logger.info(f"Loading order lookup from {orders_file}...")
        try:
            with open(orders_file, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        oid = int(row["order_id"])
                        order_hour = int(row["order_hour_of_day"])
                        order_dow = int(row["order_dow"])
                        self.orders[oid] = (order_hour, order_dow)
                    except (ValueError, KeyError) as err:
                        logger.debug(f"Skipping invalid order row {row}: {err}")
                        continue
            logger.info(f"Loaded {len(self.orders)} orders into memory lookup.")
        except Exception as e:
            logger.error(f"Error loading orders: {e}")
            raise

    def check_burst_signal(self) -> Tuple[Optional[int], int]:
        """
        Check for burst mode configuration from state/burst_signal.json or environment.
        Returns:
            (burst_product_id, burst_multiplier)
        """
        signal_file = self.settings.BURST_SIGNAL_FILE
        if signal_file.exists():
            try:
                with open(signal_file, mode="r", encoding="utf-8") as f:
                    data = json.load(f)

                burst_pid = int(data.get("product_id"))
                multiplier = int(data.get("multiplier", self.settings.BURST_MULTIPLIER))
                duration = int(data.get("duration_seconds", self.settings.BURST_DURATION))

                now = time.time()
                if self.active_burst_id != burst_pid:
                    self.active_burst_id = burst_pid
                    self.burst_start_time = now
                    logger.info(f"Burst signal activated for product_id={burst_pid} (x{multiplier}, duration {duration}s)")
                elif self.burst_start_time and (now - self.burst_start_time > duration):
                    logger.info(f"Burst duration ({duration}s) expired for product_id={burst_pid}. Clearing burst.")
                    self.active_burst_id = None
                    self.burst_start_time = None
                    try:
                        signal_file.unlink()
                    except OSError:
                        pass
                    return None, 1

                return burst_pid, multiplier
            except Exception as e:
                logger.warning(f"Error reading burst signal file {signal_file}: {e}")

        # Fallback to env config
        if self.settings.BURST_PRODUCT_ID:
            try:
                burst_pid = int(self.settings.BURST_PRODUCT_ID)
                multiplier = self.settings.BURST_MULTIPLIER
                return burst_pid, multiplier
            except ValueError:
                pass

        self.active_burst_id = None
        self.burst_start_time = None
        return None, 1

    def create_event(self, order_id: int, product_id: int) -> Dict[str, Any]:
        """Create a standardized Kafka JSON event dict."""
        prod_info = self.products.get(
            product_id,
            {
                "product_name": f"Unknown Product {product_id}",
                "category": "unknown",
                "department": "unknown"
            }
        )

        order_info = self.orders.get(order_id, (12, 0))
        order_hour, order_dow = order_info

        return {
            "product_id": product_id,
            "product_name": prod_info["product_name"],
            "category": prod_info["category"],
            "department": prod_info["department"],
            "units": 1,
            "event_time": datetime.now(timezone.utc).isoformat(),
            "order_hour": order_hour,
            "order_dow": order_dow,
            "source": "historical_simulation"
        }

    def read_order_products_chunks(self) -> Generator[list[Tuple[int, int]], None, None]:
        """
        Memory-safe reader yielding chunks of (order_id, product_id) tuples
        from datasets/instacart/order_products__prior.csv.
        Does NOT load the entire 32M+ file into memory.
        """
        file_path = self.settings.ORDER_PRODUCTS_FILE
        if not file_path.exists():
            raise FileNotFoundError(f"Order products file not found at {file_path}")

        logger.info(f"Streaming order_products incrementally from {file_path} in chunks of {self.chunk_size}...")

        chunk: list[Tuple[int, int]] = []
        with open(file_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    oid = int(row["order_id"])
                    pid = int(row["product_id"])
                    chunk.append((oid, pid))
                    if len(chunk) >= self.chunk_size:
                        yield chunk
                        chunk = []
                except (ValueError, KeyError) as err:
                    logger.debug(f"Skipping malformed order_products row {row}: {err}")
                    continue

        if chunk:
            yield chunk

    def run(self, max_messages: Optional[int] = None) -> int:
        """
        Run the producer streaming loop.
        Args:
            max_messages: Maximum number of events to produce (None for unlimited).
        Returns:
            Total count of produced messages.
        """
        self.load_products()
        self.load_orders()

        total_produced = 0
        target_delay = 1.0 / max(1, self.rate)
        logger.info(
            f"Starting producer loop. Target rate: {self.rate} msg/s "
            f"(delay: {target_delay:.4f}s per msg). Dry-run: {self.dry_run}"
        )

        try:
            while True:
                for chunk in self.read_order_products_chunks():
                    for oid, pid in chunk:
                        burst_pid, multiplier = self.check_burst_signal()

                        copies = multiplier if (burst_pid is not None and burst_pid == pid) else 1

                        for _ in range(copies):
                            event = self.create_event(oid, pid)

                            if self.dry_run:
                                if total_produced < 5 or total_produced % 1000 == 0:
                                    logger.info(f"[DRY-RUN] Would produce key={pid}: {json.dumps(event)}")
                            else:
                                try:
                                    self.producer.send(
                                        topic=self.topic,
                                        key=pid,
                                        value=event
                                    )
                                except KafkaError as ke:
                                    logger.error(f"Kafka send error for product {pid}: {ke}")

                            total_produced += 1

                            if max_messages and total_produced >= max_messages:
                                logger.info(f"Reached max_messages limit ({max_messages}). Stopping producer.")
                                if self.producer and not self.dry_run:
                                    self.producer.flush()
                                return total_produced

                            if target_delay > 0:
                                time.sleep(target_delay)

                            if total_produced % 100 == 0 and not self.dry_run and self.producer:
                                self.producer.flush()
                                logger.info(f"Produced {total_produced} messages to topic '{self.topic}'.")

                if max_messages:
                    break
                logger.info("Reached end of Instacart dataset; rewinding stream for continuous real-time analytics...")

        except KeyboardInterrupt:
            logger.info("Producer execution interrupted by user.")
        except Exception as e:
            logger.error(f"Producer encountered unexpected error: {e}", exc_info=True)
            raise
        finally:
            if self.producer and not self.dry_run:
                self.producer.flush()
                self.producer.close()
                logger.info("Kafka producer flushed and closed.")

        return total_produced


def main():
    parser = argparse.ArgumentParser(description="Instacart Kafka Producer")
    parser.add_argument("--max-messages", type=int, default=None, help="Maximum messages to produce")
    parser.add_argument("--rate", type=int, default=None, help="Producer rate in messages/sec")
    parser.add_argument("--chunk-size", type=int, default=10000, help="CSV reader chunk size")
    parser.add_argument("--dry-run", action="store_true", help="Run producer without sending to Kafka")
    parser.add_argument("--topic", type=str, default=None, help="Kafka topic name")
    parser.add_argument("--bootstrap-servers", type=str, default=None, help="Kafka bootstrap servers")

    args = parser.parse_args()

    producer = InstacartProducer(
        bootstrap_servers=args.bootstrap_servers,
        topic=args.topic,
        rate=args.rate,
        chunk_size=args.chunk_size,
        dry_run=args.dry_run
    )
    producer.run(max_messages=args.max_messages)


if __name__ == "__main__":
    main()
