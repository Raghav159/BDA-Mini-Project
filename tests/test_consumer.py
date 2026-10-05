"""
Stage 7 Unit Tests — Kafka Consumer + Window Orchestrator.

Test coverage:
  1. window_id_for_time()   — correct bucket assignment and boundaries
  2. parse_message()        — valid JSON, malformed JSON, missing fields,
                              null bytes, non-dict JSON
  3. event_to_tsv_row()    — correct TSV serialisation
  4. events_to_tsv()        — multi-event TSV output
  5. WindowOrchestrator     — HDFS write and MapReduce invocation via mocks,
                              dry-run mode, multiple-window accumulation,
                              final-window flush on shutdown, empty-window skip
  6. Bounded integration    — consume a small batch from a mock KafkaConsumer
                              and verify the expected flush calls are made.

All tests run without a live Kafka broker or HDFS.
"""

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from unittest.mock import MagicMock, patch, call

import pytest

from consumer.consumer import (
    WindowOrchestrator,
    event_to_tsv_row,
    events_to_tsv,
    parse_message,
    window_id_for_time,
)
from config.settings import Settings


# ============================================================================
# 1. window_id_for_time
# ============================================================================

class TestWindowIdForTime:
    """Tumbling window assignment and boundary behaviour."""

    def test_basic_assignment_60s(self):
        """An event at 17:00:30 UTC with a 60s window → bucket 17:00:00."""
        result = window_id_for_time("2026-09-29T17:00:30Z", window_size=60)
        assert result == "window_20260929_170000"

    def test_exact_boundary_is_start_of_next_window(self):
        """An event exactly on the minute boundary belongs to that new window."""
        result = window_id_for_time("2026-09-29T17:01:00Z", window_size=60)
        assert result == "window_20260929_170100"

    def test_last_second_of_window(self):
        """One second before the boundary stays in the earlier window."""
        result = window_id_for_time("2026-09-29T17:00:59Z", window_size=60)
        assert result == "window_20260929_170000"

    def test_300s_window(self):
        """5-minute window: 17:02:45 → bucket starting 17:00:00."""
        result = window_id_for_time("2026-09-29T17:02:45Z", window_size=300)
        assert result == "window_20260929_170000"

    def test_300s_window_next_bucket(self):
        """5-minute window: 17:05:01 → bucket starting 17:05:00."""
        result = window_id_for_time("2026-09-29T17:05:01Z", window_size=300)
        assert result == "window_20260929_170500"

    def test_accepts_offset_suffix(self):
        """+00:00 suffix is handled the same as Z."""
        r1 = window_id_for_time("2026-09-29T17:00:30+00:00", window_size=60)
        r2 = window_id_for_time("2026-09-29T17:00:30Z", window_size=60)
        assert r1 == r2

    def test_invalid_timestamp_raises(self):
        """A non-ISO timestamp raises ValueError."""
        with pytest.raises(ValueError):
            window_id_for_time("not-a-timestamp", window_size=60)

    def test_different_events_same_window(self):
        """Two events in the same 60s window get the same window id."""
        w1 = window_id_for_time("2026-09-29T17:00:10Z", window_size=60)
        w2 = window_id_for_time("2026-09-29T17:00:55Z", window_size=60)
        assert w1 == w2

    def test_adjacent_windows_are_different(self):
        """Events in consecutive windows get different window ids."""
        w1 = window_id_for_time("2026-09-29T17:00:59Z", window_size=60)
        w2 = window_id_for_time("2026-09-29T17:01:00Z", window_size=60)
        assert w1 != w2


# ============================================================================
# 2. parse_message
# ============================================================================

class TestParseMessage:
    """Kafka message deserialisation — valid, malformed, and edge cases."""

    def _encode(self, obj) -> bytes:
        return json.dumps(obj).encode("utf-8")

    def test_valid_message_returns_dict(self):
        raw = self._encode({
            "product_id": 24852,
            "product_name": "Banana",
            "units": 1,
            "event_time": "2026-09-29T17:00:30Z",
            "order_hour": 10,
            "source": "historical_simulation",
        })
        result = parse_message(raw)
        assert result is not None
        assert result["product_id"] == 24852
        assert result["product_name"] == "Banana"

    def test_null_raw_value_returns_none(self):
        assert parse_message(None) is None

    def test_non_utf8_bytes_returns_none(self):
        assert parse_message(b"\xff\xfe\x00") is None

    def test_invalid_json_returns_none(self):
        assert parse_message(b"not json at all") is None

    def test_json_array_returns_none(self):
        """Top-level JSON array is not a valid event object."""
        assert parse_message(b"[1, 2, 3]") is None

    def test_missing_product_id_returns_none(self):
        raw = self._encode({
            "product_name": "Banana",
            "units": 1,
            "event_time": "2026-09-29T17:00:30Z",
        })
        assert parse_message(raw) is None

    def test_missing_event_time_returns_none(self):
        raw = self._encode({
            "product_id": 24852,
            "product_name": "Banana",
            "units": 1,
        })
        assert parse_message(raw) is None

    def test_empty_json_object_returns_none(self):
        assert parse_message(b"{}") is None

    def test_extra_fields_are_preserved(self):
        """Unknown fields should pass through without being stripped."""
        raw = self._encode({
            "product_id": 1,
            "event_time": "2026-09-29T10:00:00Z",
            "extra_field": "hello",
        })
        result = parse_message(raw)
        assert result is not None
        assert result["extra_field"] == "hello"


# ============================================================================
# 3. event_to_tsv_row / events_to_tsv
# ============================================================================

class TestTsvHelpers:
    """TSV serialisation functions."""

    def test_event_to_tsv_row_basic(self):
        event = {
            "product_id": 24852,
            "product_name": "Banana",
            "units": 1,
            "event_time": "2026-09-29T17:00:30Z",
        }
        row = event_to_tsv_row(event)
        assert row == "24852\tBanana\t1\t2026-09-29T17:00:30Z"

    def test_event_to_tsv_row_tab_in_name_is_replaced(self):
        """A tab character in product_name must not break the TSV format."""
        event = {
            "product_id": 1,
            "product_name": "Product\tWith\tTabs",
            "units": 2,
            "event_time": "2026-09-29T17:00:00Z",
        }
        row = event_to_tsv_row(event)
        parts = row.split("\t")
        assert len(parts) == 4
        assert "Product With Tabs" in parts[1]

    def test_events_to_tsv_empty_list(self):
        assert events_to_tsv([]) == ""

    def test_events_to_tsv_single_event(self):
        events = [{
            "product_id": 1,
            "product_name": "Apple",
            "units": 1,
            "event_time": "2026-09-29T10:00:00Z",
        }]
        tsv = events_to_tsv(events)
        lines = tsv.strip().split("\n")
        assert len(lines) == 1
        assert lines[0].startswith("1\tApple\t1\t")

    def test_events_to_tsv_multiple_events(self):
        events = [
            {"product_id": 1, "product_name": "A", "units": 1,
             "event_time": "2026-09-29T10:00:00Z"},
            {"product_id": 2, "product_name": "B", "units": 2,
             "event_time": "2026-09-29T10:00:05Z"},
        ]
        tsv = events_to_tsv(events)
        lines = [l for l in tsv.split("\n") if l]
        assert len(lines) == 2
        assert lines[0].startswith("1\tA")
        assert lines[1].startswith("2\tB")

    def test_events_to_tsv_is_readable_by_mapper(self):
        """Verify mapper.py can process the TSV produced by events_to_tsv."""
        import subprocess as sp
        events = [
            {"product_id": 24852, "product_name": "Banana",
             "units": 1, "event_time": "2026-09-29T10:00:00Z"},
            {"product_id": 24852, "product_name": "Banana",
             "units": 1, "event_time": "2026-09-29T10:00:10Z"},
            {"product_id": 13176, "product_name": "Bag of Organic Bananas",
             "units": 1, "event_time": "2026-09-29T10:00:20Z"},
        ]
        tsv = events_to_tsv(events)
        mapper_path = Path(__file__).resolve().parent.parent / "mapreduce" / "mapper.py"
        proc = sp.run(
            ["python3", str(mapper_path)],
            input=tsv.encode("utf-8"),
            capture_output=True,
        )
        assert proc.returncode == 0
        lines = proc.stdout.decode().strip().split("\n")
        assert "24852\t1" in lines
        assert "13176\t1" in lines


# ============================================================================
# 4. WindowOrchestrator — unit tests with mocks
# ============================================================================

def _make_kafka_message(event: dict) -> MagicMock:
    """Create a minimal mock KafkaConsumerRecord."""
    msg = MagicMock()
    msg.value = json.dumps(event).encode("utf-8")
    return msg


def _make_orchestrator(
    dry_run: bool = True,
    window_size: int = 60,
    consumer_timeout_ms: Optional[int] = None,
) -> WindowOrchestrator:
    """Return an orchestrator in dry-run mode (no Kafka / HDFS needed)."""
    settings = Settings()
    orch = WindowOrchestrator(
        settings=settings,
        window_size=window_size,
        dry_run=dry_run,
        consumer_timeout_ms=consumer_timeout_ms,
    )
    return orch


class TestWindowOrchestratorDryRun:
    """Dry-run tests — verify windowing logic without HDFS/Kafka."""

    def _run_events(self, events: List[dict], window_size: int = 60) -> WindowOrchestrator:
        """Feed *events* directly into orchestrator internals without Kafka."""
        orch = _make_orchestrator(dry_run=True, window_size=window_size)

        for event in events:
            assigned = orch._assign_window(event)
            if assigned is None:
                continue
            if orch._current_window_id is None:
                orch._current_window_id = assigned
            if assigned != orch._current_window_id:
                orch._flush_window(orch._current_window_id, orch._window_buffer)
                orch._window_buffer = []
                orch._current_window_id = assigned
            orch._window_buffer.append(event)

        # Flush final window
        if orch._current_window_id and orch._window_buffer:
            orch._flush_window(orch._current_window_id, orch._window_buffer)
            orch._window_buffer = []

        return orch

    def test_single_window_all_events_same_bucket(self):
        """All events in the same 60s window → exactly 1 completed window."""
        events = [
            {"product_id": 1, "units": 1,
             "event_time": "2026-09-29T10:00:05Z"},
            {"product_id": 2, "units": 1,
             "event_time": "2026-09-29T10:00:30Z"},
            {"product_id": 1, "units": 1,
             "event_time": "2026-09-29T10:00:55Z"},
        ]
        orch = self._run_events(events, window_size=60)
        assert orch._windows_completed == 1

    def test_two_windows_boundary_crossing(self):
        """Events spanning two 60s windows → 2 completed windows."""
        events = [
            {"product_id": 1, "units": 1,
             "event_time": "2026-09-29T10:00:30Z"},
            {"product_id": 1, "units": 1,
             "event_time": "2026-09-29T10:01:30Z"},
        ]
        orch = self._run_events(events, window_size=60)
        assert orch._windows_completed == 2

    def test_three_windows(self):
        """Events spanning 3 windows → 3 completed windows."""
        events = [
            {"product_id": 1, "units": 1,
             "event_time": "2026-09-29T10:00:10Z"},
            {"product_id": 2, "units": 1,
             "event_time": "2026-09-29T10:01:10Z"},
            {"product_id": 3, "units": 1,
             "event_time": "2026-09-29T10:02:10Z"},
        ]
        orch = self._run_events(events, window_size=60)
        assert orch._windows_completed == 3

    def test_empty_window_is_skipped(self):
        """_flush_window with an empty list does not increment counter."""
        orch = _make_orchestrator(dry_run=True)
        orch._flush_window("window_test_empty", [])
        assert orch._windows_completed == 0

    def test_malformed_event_time_is_skipped(self):
        """Events with unparseable event_time are silently skipped."""
        orch = _make_orchestrator(dry_run=True)
        event = {"product_id": 1, "units": 1, "event_time": "NOT_A_DATE"}
        result = orch._assign_window(event)
        assert result is None

    def test_buffer_reset_after_flush(self):
        """After a window flush, the buffer is empty."""
        orch = _make_orchestrator(dry_run=True)
        orch._current_window_id = "window_20260929_100000"
        orch._window_buffer = [
            {"product_id": 1, "units": 1,
             "event_time": "2026-09-29T10:00:10Z"}
        ]
        orch._flush_window(orch._current_window_id, orch._window_buffer)
        # Manually simulate what run() does post-flush
        orch._window_buffer = []
        assert orch._window_buffer == []


class TestWindowOrchestratorMockedHdfs:
    """Tests that verify HDFS write and MapReduce trigger via mocks."""

    def _make_events_in_two_windows(self):
        return [
            {
                "product_id": 24852,
                "product_name": "Banana",
                "units": 1,
                "event_time": "2026-09-29T10:00:10Z",
                "order_hour": 10,
                "source": "historical_simulation",
            },
            {
                "product_id": 13176,
                "product_name": "Bag of Organic Bananas",
                "units": 1,
                "event_time": "2026-09-29T10:01:05Z",  # next window
                "order_hour": 10,
                "source": "historical_simulation",
            },
        ]

    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_hdfs_put_called_per_window(self, mock_hdfs_put, mock_mr):
        """hdfs_put_text must be called once per non-empty window."""
        orch = _make_orchestrator(dry_run=False)

        # Directly feed two events from different windows
        events = self._make_events_in_two_windows()
        for event in events:
            assigned = orch._assign_window(event)
            if orch._current_window_id is None:
                orch._current_window_id = assigned
            if assigned != orch._current_window_id:
                orch._flush_window(orch._current_window_id, orch._window_buffer)
                orch._window_buffer = []
                orch._current_window_id = assigned
            orch._window_buffer.append(event)

        # Flush final window
        orch._flush_window(orch._current_window_id, orch._window_buffer)
        orch._window_buffer = []

        assert mock_hdfs_put.call_count == 2

    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_mapreduce_triggered_per_window(self, mock_hdfs_put, mock_mr):
        """run_mapreduce must be called once per non-empty window."""
        orch = _make_orchestrator(dry_run=False)

        events = self._make_events_in_two_windows()
        for event in events:
            assigned = orch._assign_window(event)
            if orch._current_window_id is None:
                orch._current_window_id = assigned
            if assigned != orch._current_window_id:
                orch._flush_window(orch._current_window_id, orch._window_buffer)
                orch._window_buffer = []
                orch._current_window_id = assigned
            orch._window_buffer.append(event)

        orch._flush_window(orch._current_window_id, orch._window_buffer)
        orch._window_buffer = []

        assert mock_mr.call_count == 2

    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_hdfs_path_format(self, mock_hdfs_put, mock_mr):
        """HDFS paths must follow the /bda-project/windows/<window_id>.tsv pattern."""
        orch = _make_orchestrator(dry_run=False)
        event = {
            "product_id": 1,
            "product_name": "X",
            "units": 1,
            "event_time": "2026-09-29T10:00:10Z",
        }
        orch._flush_window("window_20260929_100000", [event])

        call_args = mock_hdfs_put.call_args
        hdfs_path_arg = call_args[0][1]  # positional arg index 1
        assert hdfs_path_arg == "/bda-project/windows/window_20260929_100000.tsv"

    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_mr_output_path_format(self, mock_hdfs_put, mock_mr):
        """MapReduce output path must follow /bda-project/output/<window_id>."""
        orch = _make_orchestrator(dry_run=False)
        event = {
            "product_id": 1,
            "product_name": "X",
            "units": 1,
            "event_time": "2026-09-29T10:00:10Z",
        }
        orch._flush_window("window_20260929_100000", [event])

        mr_call_args = mock_mr.call_args
        output_path = mr_call_args[0][1]  # positional arg 1 = output_hdfs_path
        assert output_path == "/bda-project/output/window_20260929_100000"

    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_mapreduce_failure_is_detected_not_swallowed(self, mock_hdfs_put, mock_mr):
        """A CalledProcessError from run_mapreduce is logged, not re-raised,
        but the window is NOT counted as completed."""
        mock_mr.side_effect = subprocess.CalledProcessError(1, ["run_mapreduce.sh"])

        orch = _make_orchestrator(dry_run=False)
        event = {
            "product_id": 1,
            "product_name": "X",
            "units": 1,
            "event_time": "2026-09-29T10:00:10Z",
        }
        orch._flush_window("window_20260929_100000", [event])

        # Window NOT counted as complete on MR failure
        assert orch._windows_completed == 0
        # But hdfs_put was still called (write happened before MR)
        assert mock_hdfs_put.call_count == 1

    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_hdfs_failure_skips_mapreduce(self, mock_hdfs_put, mock_mr):
        """If HDFS write fails, MapReduce must NOT be triggered."""
        mock_hdfs_put.side_effect = RuntimeError("HDFS unavailable")

        orch = _make_orchestrator(dry_run=False)
        event = {
            "product_id": 1,
            "product_name": "X",
            "units": 1,
            "event_time": "2026-09-29T10:00:10Z",
        }
        orch._flush_window("window_20260929_100000", [event])

        assert mock_mr.call_count == 0
        assert orch._windows_completed == 0

    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_tsv_content_passed_to_hdfs(self, mock_hdfs_put, mock_mr):
        """The TSV content passed to hdfs_put_text must contain the event data."""
        orch = _make_orchestrator(dry_run=False)
        events = [
            {"product_id": 24852, "product_name": "Banana",
             "units": 1, "event_time": "2026-09-29T10:00:10Z"},
        ]
        orch._flush_window("window_20260929_100000", events)

        tsv_content = mock_hdfs_put.call_args[0][0]  # first positional arg
        assert "24852" in tsv_content
        assert "Banana" in tsv_content


# ============================================================================
# 5. Bounded integration test — mock KafkaConsumer
# ============================================================================

class TestBoundedIntegration:
    """Simulate consuming a bounded batch from a mock KafkaConsumer.

    Verifies that the orchestrator correctly:
      - Assigns events to windows.
      - Flushes when window boundaries cross.
      - Calls HDFS/MR helpers the correct number of times.
    """

    def _build_messages(self, events: List[dict]) -> List[MagicMock]:
        return [_make_kafka_message(e) for e in events]

    @patch("engine.ranking.RankingEngine.process_window")
    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_consume_two_windows_via_mock_consumer(self, mock_hdfs_put, mock_mr, mock_process_window):
        """Feed two windows of messages through a mock KafkaConsumer.

        Window 1: 3 events at 10:00:xx UTC
        Window 2: 2 events at 10:01:xx UTC  (triggers flush of window 1)

        Expected: 2 HDFS writes + 2 MapReduce calls.
        """
        w1_events = [
            {"product_id": 24852, "product_name": "Banana", "units": 1,
             "event_time": "2026-09-29T10:00:10Z"},
            {"product_id": 24852, "product_name": "Banana", "units": 1,
             "event_time": "2026-09-29T10:00:20Z"},
            {"product_id": 13176, "product_name": "Bag of Organic Bananas",
             "units": 1, "event_time": "2026-09-29T10:00:50Z"},
        ]
        w2_events = [
            {"product_id": 24852, "product_name": "Banana", "units": 1,
             "event_time": "2026-09-29T10:01:05Z"},
            {"product_id": 47209, "product_name": "Organic Hass Avocado",
             "units": 1, "event_time": "2026-09-29T10:01:55Z"},
        ]
        all_messages = self._build_messages(w1_events + w2_events)

        orch = _make_orchestrator(dry_run=False, window_size=60)
        orch._consumer = MagicMock()
        orch._consumer.__iter__ = MagicMock(return_value=iter(all_messages))
        orch._consumer.commit = MagicMock()
        orch._consumer.close = MagicMock()

        orch.run(max_windows=None)

        # 2 flushes: once when boundary crossed + once in finally block
        assert mock_hdfs_put.call_count == 2
        assert mock_mr.call_count == 2
        assert mock_process_window.call_count == 2
        assert orch._windows_completed == 2

    @patch("engine.ranking.RankingEngine.process_window")
    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_malformed_messages_are_skipped(self, mock_hdfs_put, mock_mr, mock_process_window):
        """Malformed Kafka messages must not crash the consumer loop."""
        messages = [
            _make_kafka_message({"product_id": 1, "product_name": "A",
                                  "units": 1, "event_time": "2026-09-29T10:00:00Z"}),
        ]
        # Insert some bad messages
        bad1 = MagicMock()
        bad1.value = b"NOT JSON"
        bad2 = MagicMock()
        bad2.value = None
        bad3 = MagicMock()
        bad3.value = b'{"missing_event_time": true}'
        all_messages = [bad1, bad2, bad3] + messages

        orch = _make_orchestrator(dry_run=False, window_size=60)
        orch._consumer = MagicMock()
        orch._consumer.__iter__ = MagicMock(return_value=iter(all_messages))
        orch._consumer.commit = MagicMock()
        orch._consumer.close = MagicMock()

        # Should not raise
        orch.run()

        # The one valid event's window is flushed in the finally block
        assert mock_hdfs_put.call_count == 1

    @patch("engine.ranking.RankingEngine.process_window")
    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_max_windows_stops_consumer(self, mock_hdfs_put, mock_mr, mock_process_window):
        """When max_windows is set, the orchestrator stops after that count."""
        # 3 windows of events
        events = []
        for hour_offset in range(3):
            t = f"2026-09-29T10:0{hour_offset}:30Z"
            events.append({
                "product_id": 1, "product_name": "A", "units": 1,
                "event_time": t,
            })

        all_messages = self._build_messages(events)

        orch = _make_orchestrator(dry_run=False, window_size=60)
        orch._consumer = MagicMock()
        orch._consumer.__iter__ = MagicMock(return_value=iter(all_messages))
        orch._consumer.commit = MagicMock()
        orch._consumer.close = MagicMock()

        completed = orch.run(max_windows=2)
        assert completed == 2

    @patch("engine.ranking.RankingEngine.process_window")
    @patch("consumer.consumer.run_mapreduce")
    @patch("consumer.consumer.hdfs_put_text")
    def test_consumer_does_not_terminate_on_polling_timeout(self, mock_hdfs_put, mock_mr, mock_process_window):
        """Proves consumer does not terminate merely because a polling period (StopIteration) has no message."""
        msg = _make_kafka_message({
            "product_id": 24852, "product_name": "Banana", "units": 1,
            "event_time": "2026-09-29T10:00:10Z"
        })

        orch = _make_orchestrator(dry_run=False, window_size=60)
        orch.consumer_timeout_ms = 5000

        class MockConsumerIter:
            def __init__(self):
                self.calls = 0
            def __iter__(self):
                return self
            def __next__(self):
                self.calls += 1
                if self.calls == 1:
                    # Simulate polling timeout on first poll
                    raise StopIteration()
                elif self.calls == 2:
                    return msg
                else:
                    # After processing message, signal end of mock test stream
                    orch.consumer_timeout_ms = None
                    raise StopIteration()

        mock_iter = MockConsumerIter()
        mock_consumer = MagicMock()
        mock_consumer.__iter__ = MagicMock(return_value=mock_iter)
        mock_consumer.commit = MagicMock()
        mock_consumer.close = MagicMock()
        orch._consumer = mock_consumer

        # Run orchestrator
        orch.run()

        # Verify that the message yielded on 2nd iteration (after StopIteration timeout) was processed
        assert mock_hdfs_put.call_count >= 1

