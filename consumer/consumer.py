"""
Kafka Consumer + Window Orchestrator — Stage 7.

Responsibilities:
  1. Consume JSON events from the 'sales-events' Kafka topic.
  2. Assign each event to a tumbling window based on its event_time field.
  3. When a window boundary is crossed (or a flush is requested):
       a. Serialise the window's events as a TSV file.
       b. Write the TSV to HDFS under /bda-project/windows/.
       c. Invoke scripts/run_mapreduce.sh with the window input/output paths.
       d. Detect and report MapReduce failures — never treat a failed job as
          successful.
  4. Handle malformed Kafka messages safely (log and skip).
  5. Loop continuously until interrupted (SIGINT / SIGTERM) so that it
     naturally processes multiple windows.

HDFS paths produced per window:
  Input  : /bda-project/windows/window_<YYYYMMDD_HHMMSS>.tsv
  Output : /bda-project/output/window_<YYYYMMDD_HHMMSS>/

Usage:
    python -m consumer.consumer                    # run forever
    python -m consumer.consumer --max-windows 3    # stop after 3 windows

Environment variables used (never hard-coded):
    KAFKA_BOOTSTRAP_SERVERS   default: localhost:9092
    KAFKA_TOPIC               default: sales-events
    KAFKA_CONSUMER_GROUP      default: ranking-engine-group
    WINDOW_SIZE               default: 60  (seconds)
    REFRESH_INTERVAL          default: 60  (seconds — same as WINDOW_SIZE here)
    HDFS_BASE_PATH            default: /bda-project
    HADOOP_CONTAINER          default: bda-hadoop
"""

import argparse
import json
import logging
import os
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from kafka import KafkaConsumer
from kafka.errors import KafkaError

from config.settings import Settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("WindowOrchestrator")

# --------------------------------------------------------------------------- #
# TSV helpers                                                                  #
# --------------------------------------------------------------------------- #

def event_to_tsv_row(event: dict) -> str:
    """Convert a single parsed event dict to a TSV row for HDFS/MapReduce.

    TSV format (matches mapper.py expectations):
        product_id <TAB> product_name <TAB> units <TAB> event_time
    """
    product_id = str(event.get("product_id", ""))
    product_name = str(event.get("product_name", "")).replace("\t", " ")
    units = str(event.get("units", 1))
    event_time = str(event.get("event_time", ""))
    return f"{product_id}\t{product_name}\t{units}\t{event_time}"


def events_to_tsv(events: List[dict]) -> str:
    """Serialise a list of event dicts to a multi-line TSV string."""
    return "\n".join(event_to_tsv_row(e) for e in events) + ("\n" if events else "")


# --------------------------------------------------------------------------- #
# Window assignment                                                            #
# --------------------------------------------------------------------------- #

def window_id_for_time(event_time_str: str, window_size: int) -> str:
    """Return the tumbling-window label that owns *event_time_str*.

    The window label is ``window_YYYYMMDD_HHMMSS`` where the timestamp is the
    *start* of the window bucket that contains ``event_time_str``.

    Args:
        event_time_str: ISO-8601 timestamp string (from event["event_time"]).
        window_size:    Bucket duration in seconds.

    Returns:
        String like ``window_20260929_171500``.

    Raises:
        ValueError: if ``event_time_str`` cannot be parsed.
    """
    # Accept both Z-suffix and +00:00 forms
    ts_str = event_time_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(ts_str)
    epoch = dt.timestamp()
    bucket_start_epoch = int(epoch // window_size) * window_size
    bucket_start = datetime.fromtimestamp(bucket_start_epoch, tz=timezone.utc)
    return bucket_start.strftime("window_%Y%m%d_%H%M%S")


# --------------------------------------------------------------------------- #
# HDFS helpers                                                                 #
# --------------------------------------------------------------------------- #

def _hdfs_cmd_prefix(hadoop_container: str) -> List[str]:
    """Return the prefix for hdfs dfs commands (local or docker exec)."""
    if _has_local_hdfs():
        return ["hdfs", "dfs"]
    return ["docker", "exec", hadoop_container, "hdfs", "dfs"]


def _has_local_hdfs() -> bool:
    """True if the hdfs binary is on PATH (running inside Hadoop container)."""
    import shutil
    return shutil.which("hdfs") is not None


def hdfs_put_text(content: str, hdfs_path: str, hadoop_container: str) -> None:
    """Write *content* (UTF-8 string) to *hdfs_path* via stdin pipe.

    Uses ``docker exec -i bda-hadoop hdfs dfs -put -f - <hdfs_path>``
    when running outside the container, or ``hdfs dfs -put -f - <hdfs_path>``
    when hdfs is available locally.

    Args:
        content:          TSV text to write.
        hdfs_path:        Absolute HDFS path.
        hadoop_container: Docker container name (ignored if hdfs is local).

    Raises:
        RuntimeError: if the hdfs put command returns non-zero.
    """
    if _has_local_hdfs():
        cmd = ["hdfs", "dfs", "-put", "-f", "-", hdfs_path]
        proc = subprocess.run(
            cmd,
            input=content.encode("utf-8"),
            capture_output=True,
        )
    else:
        cmd = [
            "docker", "exec", "-i", hadoop_container,
            "hdfs", "dfs", "-put", "-f", "-", hdfs_path,
        ]
        proc = subprocess.run(
            cmd,
            input=content.encode("utf-8"),
            capture_output=True,
        )

    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            f"hdfs put failed (exit {proc.returncode}): {stderr}"
        )
    logger.info(f"Written {len(content.encode())} bytes to HDFS: {hdfs_path}")


# --------------------------------------------------------------------------- #
# MapReduce trigger                                                            #
# --------------------------------------------------------------------------- #

def run_mapreduce(
    input_hdfs_path: str,
    output_hdfs_path: str,
    script_path: Path,
) -> None:
    """Invoke scripts/run_mapreduce.sh and raise on failure.

    Args:
        input_hdfs_path:  HDFS path of the window TSV file.
        output_hdfs_path: HDFS path for MapReduce output directory.
        script_path:      Absolute local path to run_mapreduce.sh.

    Raises:
        FileNotFoundError: if run_mapreduce.sh does not exist.
        subprocess.CalledProcessError: if the MapReduce job returns non-zero.
    """
    if not script_path.exists():
        raise FileNotFoundError(f"run_mapreduce.sh not found at {script_path}")

    cmd = [str(script_path), input_hdfs_path, output_hdfs_path]
    logger.info(f"Triggering MapReduce: {' '.join(cmd)}")

    result = subprocess.run(
        cmd,
        capture_output=False,   # let stdout/stderr stream to our terminal
        text=True,
    )

    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode,
            cmd,
            output=None,
            stderr=None,
        )
    logger.info(
        f"MapReduce job completed. Output at: {output_hdfs_path}"
    )


# --------------------------------------------------------------------------- #
# Orchestrator                                                                 #
# --------------------------------------------------------------------------- #

class WindowOrchestrator:
    """Accumulates Kafka events into tumbling windows and triggers MapReduce.

    Attributes:
        settings:         Project settings instance.
        window_size:      Tumbling window duration in seconds.
        hdfs_base:        Root HDFS path (e.g. /bda-project).
        hadoop_container: Docker container name for HDFS commands.
        script_path:      Absolute path to scripts/run_mapreduce.sh.

    Internal state:
        _current_window_id:   Label of the window currently being filled.
        _window_buffer:       Events accumulated for the current window.
    """

    def __init__(
        self,
        settings: Optional[Settings] = None,
        bootstrap_servers: Optional[str] = None,
        topic: Optional[str] = None,
        consumer_group: Optional[str] = None,
        window_size: Optional[int] = None,
        hdfs_base: Optional[str] = None,
        hadoop_container: Optional[str] = None,
        auto_offset_reset: str = "earliest",
        consumer_timeout_ms: int = 1000,
        dry_run: bool = False,
    ):
        self.settings = settings or Settings()
        self.bootstrap_servers = (
            bootstrap_servers or self.settings.KAFKA_BOOTSTRAP_SERVERS
        )
        self.topic = topic or self.settings.KAFKA_TOPIC
        self.consumer_group = consumer_group or self.settings.KAFKA_CONSUMER_GROUP
        self.window_size = window_size if window_size is not None else self.settings.WINDOW_SIZE
        self.hdfs_base = hdfs_base or self.settings.HDFS_BASE_PATH
        self.hadoop_container = hadoop_container or self.settings.HADOOP_CONTAINER
        self.auto_offset_reset = auto_offset_reset
        self.consumer_timeout_ms = consumer_timeout_ms
        self.dry_run = dry_run

        # Derived paths
        self.hdfs_windows_path = f"{self.hdfs_base}/windows"
        self.hdfs_output_path = f"{self.hdfs_base}/output"
        self.script_path: Path = (
            self.settings.PROJECT_ROOT / "scripts" / "run_mapreduce.sh"
        )

        # Per-run state
        self._current_window_id: Optional[str] = None
        self._window_buffer: List[dict] = []
        self._windows_completed: int = 0

        # Kafka consumer (None until connect() is called)
        self._consumer: Optional[KafkaConsumer] = None

    # ---------------------------------------------------------------------- #
    # Kafka lifecycle                                                          #
    # ---------------------------------------------------------------------- #

    def connect(self) -> None:
        """Create and configure the KafkaConsumer.

        Consumer group: ranking-engine-group (from settings).
        Auto offset reset: earliest (architecture spec §7).
        """
        logger.info(
            f"Connecting Kafka consumer to {self.bootstrap_servers} "
            f"topic={self.topic} group={self.consumer_group} "
            f"auto_offset_reset={self.auto_offset_reset}"
        )
        self._consumer = KafkaConsumer(
            self.topic,
            bootstrap_servers=self.bootstrap_servers,
            group_id=self.consumer_group,
            auto_offset_reset=self.auto_offset_reset,
            enable_auto_commit=True,
            auto_commit_interval_ms=5000,
            consumer_timeout_ms=self.consumer_timeout_ms,
            value_deserializer=lambda raw: raw,  # We do JSON parsing ourselves
        )
        logger.info("Kafka consumer connected.")

    def close(self) -> None:
        """Commit offsets and close the consumer."""
        if self._consumer is not None:
            try:
                self._consumer.commit()
            except Exception:
                pass
            try:
                self._consumer.close()
            except Exception:
                pass
            self._consumer = None
            logger.info("Kafka consumer closed.")

    # ---------------------------------------------------------------------- #
    # Message parsing                                                         #
    # ---------------------------------------------------------------------- #

    @staticmethod
    def parse_message(raw_value: bytes) -> Optional[dict]:
        """Deserialise a raw Kafka message value to a dict.

        Returns None (and logs a warning) for malformed messages instead of
        raising so that a single bad message never halts the consumer.

        Args:
            raw_value: Raw bytes from Kafka message.value.

        Returns:
            Parsed dict or None if the message is malformed/missing fields.
        """
        if raw_value is None:
            logger.warning("Received null message value; skipping.")
            return None
        try:
            text = raw_value.decode("utf-8")
        except (UnicodeDecodeError, AttributeError) as exc:
            logger.warning(f"Cannot decode message bytes: {exc}; skipping.")
            return None

        try:
            event = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.warning(f"Malformed JSON in Kafka message: {exc}; skipping.")
            return None

        if not isinstance(event, dict):
            logger.warning("Message is valid JSON but not an object; skipping.")
            return None

        # Validate required fields
        missing = [f for f in ("product_id", "event_time") if f not in event]
        if missing:
            logger.warning(
                f"Message missing required fields {missing}; skipping. "
                f"Keys present: {list(event.keys())}"
            )
            return None

        return event

    # ---------------------------------------------------------------------- #
    # Window logic                                                            #
    # ---------------------------------------------------------------------- #

    def _assign_window(self, event: dict) -> Optional[str]:
        """Return the window label for *event*, or None on parse error."""
        try:
            return window_id_for_time(event["event_time"], self.window_size)
        except (ValueError, KeyError) as exc:
            logger.warning(
                f"Cannot assign window for event_time={event.get('event_time')!r}: "
                f"{exc}; skipping event."
            )
            return None

    def _flush_window(self, window_id: str, events: List[dict]) -> None:
        """Write *events* to HDFS and trigger the MapReduce job.

        Args:
            window_id: Label such as ``window_20260929_171500``.
            events:    List of event dicts accumulated in this window.
        """
        if not events:
            logger.info(f"Window {window_id} is empty; skipping HDFS write.")
            return

        hdfs_tsv_path = f"{self.hdfs_windows_path}/{window_id}.tsv"
        hdfs_mr_output = f"{self.hdfs_output_path}/{window_id}"

        logger.info(
            f"Flushing window {window_id}: {len(events)} events "
            f"→ HDFS {hdfs_tsv_path}"
        )

        tsv_content = events_to_tsv(events)

        if self.dry_run:
            logger.info(
                f"[DRY-RUN] Would write {len(events)} events to {hdfs_tsv_path}"
            )
            logger.info(
                f"[DRY-RUN] Would invoke MapReduce: "
                f"input={hdfs_tsv_path} output={hdfs_mr_output}"
            )
            self._windows_completed += 1
            return

        # --- 1. Write TSV to HDFS ---
        try:
            hdfs_put_text(tsv_content, hdfs_tsv_path, self.hadoop_container)
        except Exception as exc:
            logger.error(
                f"Failed to write window {window_id} to HDFS: {exc}",
                exc_info=True,
            )
            return  # Do not attempt MR if write failed

        # --- 2. Trigger MapReduce ---
        try:
            run_mapreduce(hdfs_tsv_path, hdfs_mr_output, self.script_path)
        except subprocess.CalledProcessError as exc:
            logger.error(
                f"MapReduce job FAILED for window {window_id} "
                f"(exit code {exc.returncode}). "
                f"Input: {hdfs_tsv_path}  Output dir: {hdfs_mr_output}"
            )
            return  # Detected and reported — not silently swallowed
        except Exception as exc:
            logger.error(
                f"Unexpected error triggering MapReduce for {window_id}: {exc}",
                exc_info=True,
            )
            return

        self._windows_completed += 1
        logger.info(
            f"Window {window_id} complete. "
            f"Total windows processed: {self._windows_completed}."
        )

    # ---------------------------------------------------------------------- #
    # Main loop                                                               #
    # ---------------------------------------------------------------------- #

    def run(self, max_windows: Optional[int] = None) -> int:
        """Main consumer loop.

        Consumes messages from Kafka indefinitely (or until *max_windows* are
        completed), assigning each event to a tumbling window.  When the window
        label changes (i.e. the current bucket is over), the buffered events
        are flushed.

        Args:
            max_windows: Stop after this many windows are completed.
                         None means run forever (until SIGINT/SIGTERM).

        Returns:
            Number of windows successfully flushed.
        """
        if self._consumer is None:
            raise RuntimeError("Call connect() before run().")

        logger.info(
            f"Starting window orchestrator. "
            f"window_size={self.window_size}s  "
            f"max_windows={max_windows}  dry_run={self.dry_run}"
        )

        _shutdown = False

        def _handle_signal(signum, frame):
            nonlocal _shutdown
            logger.info(f"Received signal {signum}; initiating graceful shutdown.")
            _shutdown = True

        signal.signal(signal.SIGINT, _handle_signal)
        signal.signal(signal.SIGTERM, _handle_signal)

        try:
            for message in self._consumer:
                if _shutdown:
                    break

                event = self.parse_message(message.value)
                if event is None:
                    continue  # malformed — already logged

                assigned_window = self._assign_window(event)
                if assigned_window is None:
                    continue  # bad event_time — already logged

                if self._current_window_id is None:
                    # First event ever — initialise the current window
                    self._current_window_id = assigned_window
                    logger.info(f"First window started: {assigned_window}")

                if assigned_window != self._current_window_id:
                    # Crossed a window boundary — flush the completed window
                    self._flush_window(
                        self._current_window_id, self._window_buffer
                    )
                    self._window_buffer = []
                    self._current_window_id = assigned_window
                    logger.info(f"New window started: {assigned_window}")

                    if max_windows is not None and self._windows_completed >= max_windows:
                        logger.info(
                            f"Reached max_windows={max_windows}; stopping."
                        )
                        break

                self._window_buffer.append(event)

        except StopIteration:
            # consumer_timeout_ms elapsed with no new messages
            logger.info("Consumer timed out (no new messages).")

        except KafkaError as exc:
            logger.error(f"Kafka error in consumer loop: {exc}", exc_info=True)
            raise

        finally:
            # Flush the final (possibly incomplete) window if it has events
            if self._current_window_id and self._window_buffer:
                logger.info(
                    f"Flushing final window {self._current_window_id} "
                    f"({len(self._window_buffer)} events) on shutdown."
                )
                self._flush_window(self._current_window_id, self._window_buffer)
                self._window_buffer = []

            self.close()

        logger.info(
            f"Orchestrator finished. Windows completed: {self._windows_completed}."
        )
        return self._windows_completed


# --------------------------------------------------------------------------- #
# CLI entry point                                                              #
# --------------------------------------------------------------------------- #

# Module-level aliases — convenient for testing and external callers.
parse_message = WindowOrchestrator.parse_message


def main() -> None:
    parser = argparse.ArgumentParser(
        description="BDA Stage 7 — Kafka Consumer + Window Orchestrator"
    )
    parser.add_argument(
        "--max-windows",
        type=int,
        default=None,
        help="Stop after this many windows are completed (default: run forever).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log actions without writing to HDFS or triggering MapReduce.",
    )
    parser.add_argument(
        "--consumer-timeout-ms",
        type=int,
        default=5000,
        help="Consumer poll timeout in ms before stopping (default: 5000).",
    )
    args = parser.parse_args()

    orchestrator = WindowOrchestrator(
        dry_run=args.dry_run,
        consumer_timeout_ms=args.consumer_timeout_ms,
    )
    orchestrator.connect()
    orchestrator.run(max_windows=args.max_windows)


if __name__ == "__main__":
    main()
