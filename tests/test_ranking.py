"""
Stage 8 Unit Tests — Ranking + Momentum Engine.

Tests cover:
  - compute_momentum: formula, edge cases (prev=0, both=0, normal)
  - parse_mr_output: valid, malformed, empty input
  - build_top10: cumulative ranking, tie-breaking, correct field population
  - build_top5_momentum_movers: selection criteria, ordering, tie-breaking
  - RankingEngine.process_window: state rotation, cumulative update, 2-window flow
  - JSON state persistence: state file written and reloaded correctly
  - Atomic write safety: partial write never exposed
  - Deterministic tie-breaking
  - Missing products / windows handled safely
"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Module under test
from engine.ranking import (
    RankingEngine,
    build_top10,
    build_top5_momentum_movers,
    compute_momentum,
    parse_mr_output,
    _atomic_write_json,
    _momentum_direction,
)
from config.settings import Settings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_engine(tmp_path: Path) -> RankingEngine:
    """Return a RankingEngine wired to *tmp_path* for state files."""
    settings = MagicMock(spec=Settings)
    settings.STATE_DIR = tmp_path
    settings.RANKING_STATE_FILE = tmp_path / "ranking_state.json"
    settings.RANKING_OUTPUT_FILE = tmp_path / "ranking_output.json"
    settings.HDFS_BASE_PATH = "/bda-project"
    settings.HADOOP_CONTAINER = "bda-hadoop"
    settings.WINDOW_SIZE = 60
    return RankingEngine(
        settings=settings,
        hdfs_output_base="/bda-project/output",
    )


# ---------------------------------------------------------------------------
# compute_momentum
# ---------------------------------------------------------------------------

class TestComputeMomentum:
    def test_normal_growth(self):
        # (45 - 20) / 20 * 100 = 125.0
        assert compute_momentum(45, 20) == 125.0

    def test_normal_decline(self):
        # (20 - 45) / 45 * 100 = -55.6
        assert compute_momentum(20, 45) == -55.6

    def test_steady(self):
        # (30 - 30) / 30 * 100 = 0.0
        assert compute_momentum(30, 30) == 0.0

    def test_new_product_previous_zero(self):
        # previous=0 -> denominator=max(0,1)=1 -> (5-0)/1*100 = 500.0
        assert compute_momentum(5, 0) == 500.0

    def test_both_zero(self):
        # Special case: both zero => 0.0
        assert compute_momentum(0, 0) == 0.0

    def test_disappeared_product(self):
        # (0 - 10) / 10 * 100 = -100.0
        assert compute_momentum(0, 10) == -100.0

    def test_large_burst(self):
        # (50 - 1) / 1 * 100 = 4900.0
        assert compute_momentum(50, 1) == 4900.0

    def test_rounding_to_one_decimal(self):
        # (20 - 35) / 35 * 100 = -42.857... -> -42.9
        assert compute_momentum(20, 35) == -42.9

    def test_previous_one_current_zero(self):
        # (0 - 1) / 1 * 100 = -100.0
        assert compute_momentum(0, 1) == -100.0

    def test_return_type_is_float(self):
        result = compute_momentum(10, 5)
        assert isinstance(result, float)

    def test_both_zero_return_type_is_float(self):
        result = compute_momentum(0, 0)
        assert isinstance(result, float)
        assert result == 0.0


# ---------------------------------------------------------------------------
# _momentum_direction
# ---------------------------------------------------------------------------

class TestMomentumDirection:
    def test_positive_is_up(self):
        assert _momentum_direction(100.0) == "up"

    def test_negative_is_down(self):
        assert _momentum_direction(-50.0) == "down"

    def test_zero_is_flat(self):
        assert _momentum_direction(0.0) == "flat"


# ---------------------------------------------------------------------------
# parse_mr_output
# ---------------------------------------------------------------------------

class TestParseMrOutput:
    def test_valid_two_products(self):
        raw = "100\t3\n200\t2\n"
        result = parse_mr_output(raw)
        assert result == {"100": 3, "200": 2}

    def test_valid_single_product(self):
        raw = "24852\t15\n"
        result = parse_mr_output(raw)
        assert result == {"24852": 15}

    def test_empty_input(self):
        assert parse_mr_output("") == {}

    def test_blank_lines_skipped(self):
        raw = "100\t3\n\n200\t2\n"
        result = parse_mr_output(raw)
        assert result == {"100": 3, "200": 2}

    def test_malformed_no_tab_skipped(self):
        raw = "100\t3\nMALFORMED_LINE\n200\t2\n"
        result = parse_mr_output(raw)
        assert result == {"100": 3, "200": 2}

    def test_non_integer_units_skipped(self):
        raw = "100\t3\n200\tABC\n300\t1\n"
        result = parse_mr_output(raw)
        assert result == {"100": 3, "300": 1}

    def test_empty_product_id_skipped(self):
        raw = "100\t3\n\t5\n200\t2\n"
        result = parse_mr_output(raw)
        assert result == {"100": 3, "200": 2}

    def test_extra_tabs_uses_first_two_columns(self):
        # Lines with more than 2 columns are still parseable
        raw = "100\t3\textra\n200\t2\n"
        result = parse_mr_output(raw)
        assert result == {"100": 3, "200": 2}

    def test_whitespace_stripped_from_values(self):
        raw = "100 \t 3 \n"
        result = parse_mr_output(raw)
        assert result == {"100": 3}

    def test_all_malformed_returns_empty(self):
        raw = "NO_TABS_HERE\nALSO_BAD\n"
        result = parse_mr_output(raw)
        assert result == {}


# ---------------------------------------------------------------------------
# build_top10
# ---------------------------------------------------------------------------

class TestBuildTop10:
    def _names(self):
        return {
            "100": "Apple",
            "200": "Banana",
            "300": "Cherry",
            "400": "Date",
        }

    def test_top10_ordered_by_cumulative_descending(self):
        cumulative = {"100": 10, "200": 50, "300": 30}
        current = {"100": 2, "200": 5, "300": 3}
        previous = {"100": 1, "200": 4, "300": 2}
        top10 = build_top10(cumulative, current, previous, self._names())
        assert len(top10) == 3
        assert top10[0]["product_id"] == 200
        assert top10[1]["product_id"] == 300
        assert top10[2]["product_id"] == 100

    def test_ranks_assigned_correctly(self):
        cumulative = {"100": 10, "200": 50}
        current = {}
        previous = {}
        top10 = build_top10(cumulative, current, previous, self._names())
        assert top10[0]["rank"] == 1
        assert top10[1]["rank"] == 2

    def test_tie_break_by_product_id_ascending(self):
        # Products 200 and 300 have same cumulative units
        cumulative = {"100": 5, "200": 20, "300": 20}
        current = {}
        previous = {}
        top10 = build_top10(cumulative, current, previous, self._names())
        # 200 < 300 lexicographically → 200 should come first
        assert top10[0]["product_id"] == 200
        assert top10[1]["product_id"] == 300

    def test_maximum_10_returned(self):
        cumulative = {str(i): i for i in range(1, 16)}
        current = {}
        previous = {}
        names = {str(i): f"Product {i}" for i in range(1, 16)}
        top10 = build_top10(cumulative, current, previous, names)
        assert len(top10) == 10

    def test_momentum_computed_for_each_product(self):
        cumulative = {"100": 10, "200": 5}
        current = {"100": 3, "200": 5}
        previous = {"100": 1, "200": 0}
        top10 = build_top10(cumulative, current, previous, self._names())
        apple = next(p for p in top10 if p["product_id"] == 100)
        banana = next(p for p in top10 if p["product_id"] == 200)
        # Apple: (3-1)/1*100 = 200.0
        assert apple["momentum_pct"] == 200.0
        assert apple["momentum_direction"] == "up"
        # Banana: (5-0)/max(0,1)*100 = 500.0
        assert banana["momentum_pct"] == 500.0

    def test_missing_current_window_product_defaults_to_zero(self):
        cumulative = {"100": 10}
        current = {}
        previous = {"100": 5}
        top10 = build_top10(cumulative, current, previous, self._names())
        assert top10[0]["current_window_units"] == 0
        # momentum: (0-5)/5*100 = -100.0
        assert top10[0]["momentum_pct"] == -100.0

    def test_unknown_product_name_uses_fallback(self):
        cumulative = {"999": 5}
        current = {}
        previous = {}
        top10 = build_top10(cumulative, current, previous, {})
        assert top10[0]["product_name"] == "Product 999"

    def test_empty_cumulative_returns_empty_list(self):
        top10 = build_top10({}, {}, {}, {})
        assert top10 == []

    def test_total_units_field_matches_cumulative(self):
        cumulative = {"100": 42}
        top10 = build_top10(cumulative, {}, {}, self._names())
        assert top10[0]["total_units"] == 42

    def test_product_id_converted_to_int(self):
        cumulative = {"24852": 10}
        top10 = build_top10(cumulative, {}, {}, {"24852": "Banana"})
        assert top10[0]["product_id"] == 24852
        assert isinstance(top10[0]["product_id"], int)


# ---------------------------------------------------------------------------
# build_top5_momentum_movers
# ---------------------------------------------------------------------------

class TestBuildTop5MomentumMovers:
    def _names(self):
        return {
            "100": "Apple",
            "200": "Banana",
            "300": "Cherry",
            "400": "Date",
            "500": "Elderberry",
            "600": "Fig",
        }

    def test_only_current_window_nonzero_included(self):
        current = {"100": 5, "200": 0, "300": 3}
        previous = {}
        cumulative = {"100": 5, "200": 10, "300": 3}
        movers = build_top5_momentum_movers(current, previous, cumulative, self._names())
        pids = [m["product_id"] for m in movers]
        assert 200 not in pids  # current=0 excluded

    def test_sorted_by_momentum_descending(self):
        # 300: prev=0 current=3 -> 300% momentum
        # 100: prev=2 current=5 -> 150% momentum
        current = {"100": 5, "300": 3}
        previous = {"100": 2}
        cumulative = {"100": 5, "300": 3}
        movers = build_top5_momentum_movers(current, previous, cumulative, self._names())
        assert movers[0]["product_id"] == 300
        assert movers[1]["product_id"] == 100

    def test_maximum_5_returned(self):
        current = {str(i): i for i in range(1, 10)}
        previous = {}
        cumulative = {str(i): i for i in range(1, 10)}
        names = {str(i): f"Product {i}" for i in range(1, 10)}
        movers = build_top5_momentum_movers(current, previous, cumulative, names)
        assert len(movers) <= 5

    def test_tie_break_by_product_id_ascending(self):
        # 200 and 300 both have prev=0, current=5 -> momentum=500%
        current = {"200": 5, "300": 5}
        previous = {}
        cumulative = {"200": 5, "300": 5}
        movers = build_top5_momentum_movers(current, previous, cumulative, self._names())
        assert movers[0]["product_id"] == 200
        assert movers[1]["product_id"] == 300

    def test_empty_current_window_returns_empty(self):
        movers = build_top5_momentum_movers({}, {}, {}, {})
        assert movers == []

    def test_all_current_zero_returns_empty(self):
        current = {"100": 0, "200": 0}
        movers = build_top5_momentum_movers(current, {}, {"100": 5, "200": 3}, self._names())
        assert movers == []

    def test_mover_fields_correct(self):
        current = {"100": 10}
        previous = {"100": 2}
        cumulative = {"100": 20}
        movers = build_top5_momentum_movers(current, previous, cumulative, {"100": "Apple"})
        assert len(movers) == 1
        m = movers[0]
        assert m["product_id"] == 100
        assert m["product_name"] == "Apple"
        assert m["total_units"] == 20
        assert m["current_window_units"] == 10
        assert m["previous_window_units"] == 2
        # (10-2)/2*100 = 400.0
        assert m["momentum_pct"] == 400.0
        assert m["momentum_direction"] == "up"

    def test_can_include_products_not_in_top10(self):
        # Small cumulative but high momentum — should appear in movers
        current = {"999": 50}
        previous = {"999": 1}
        cumulative = {"999": 51}
        movers = build_top5_momentum_movers(current, previous, cumulative, {"999": "Surge"})
        assert movers[0]["product_id"] == 999
        assert movers[0]["momentum_pct"] == 4900.0


# ---------------------------------------------------------------------------
# RankingEngine — process_window (in-process, no HDFS)
# ---------------------------------------------------------------------------

class TestRankingEngineProcessWindow:
    """Test RankingEngine.process_window using in-memory mr_output (no HDFS)."""

    # Window 1 data (matches architecture_spec.md §18 example)
    WINDOW1_MR = {"100": 3, "200": 2, "300": 1, "400": 4}
    WINDOW1_NAMES = {"100": "Apple", "200": "Banana", "300": "Cherry", "400": "Date"}

    # Window 2 data
    WINDOW2_MR = {"100": 1, "200": 4, "300": 5}
    WINDOW2_NAMES = {"100": "Apple", "200": "Banana", "300": "Cherry"}

    def test_first_window_cumulative_equals_mr_output(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        assert engine.cumulative_totals["100"] == 3
        assert engine.cumulative_totals["200"] == 2
        assert engine.cumulative_totals["300"] == 1
        assert engine.cumulative_totals["400"] == 4

    def test_second_window_cumulative_is_sum(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        engine.process_window("window_W2", self.WINDOW2_MR, self.WINDOW2_NAMES)
        # Apple: 3+1=4, Banana: 2+4=6, Cherry: 1+5=6, Date: 4+0=4
        assert engine.cumulative_totals["100"] == 4
        assert engine.cumulative_totals["200"] == 6
        assert engine.cumulative_totals["300"] == 6
        assert engine.cumulative_totals["400"] == 4

    def test_previous_window_set_after_second_window(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        engine.process_window("window_W2", self.WINDOW2_MR, self.WINDOW2_NAMES)
        # previous_window should be WINDOW1_MR values
        assert engine.previous_window.get("100") == 3
        assert engine.previous_window.get("200") == 2
        assert engine.previous_window.get("300") == 1

    def test_current_window_reflects_latest_mr_output(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        engine.process_window("window_W2", self.WINDOW2_MR, self.WINDOW2_NAMES)
        assert engine.current_window.get("100") == 1
        assert engine.current_window.get("200") == 4

    def test_windows_processed_counter(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        assert engine.windows_processed == 1
        engine.process_window("window_W2", self.WINDOW2_MR, self.WINDOW2_NAMES)
        assert engine.windows_processed == 2

    def test_top10_ranking_correct_after_two_windows(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        result = engine.process_window("window_W2", self.WINDOW2_MR, self.WINDOW2_NAMES)
        # Cumulative: Banana=6, Cherry=6, Apple=4, Date=4
        # Tie-break Banana(200) vs Cherry(300): "200" < "300" -> Banana first
        # Tie-break Apple(100) vs Date(400): "100" < "400" -> Apple first
        top10 = result["top_10"]
        assert top10[0]["product_id"] == 200  # Banana, 6 units
        assert top10[1]["product_id"] == 300  # Cherry, 6 units
        assert top10[2]["product_id"] == 100  # Apple, 4 units
        assert top10[3]["product_id"] == 400  # Date, 4 units

    def test_momentum_uses_previous_window(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        result = engine.process_window("window_W2", self.WINDOW2_MR, self.WINDOW2_NAMES)
        top10 = result["top_10"]
        apple = next(p for p in top10 if p["product_id"] == 100)
        banana = next(p for p in top10 if p["product_id"] == 200)
        # Apple: current=1, previous=3 -> (1-3)/3*100 = -66.7
        assert apple["momentum_pct"] == -66.7
        assert apple["momentum_direction"] == "down"
        # Banana: current=4, previous=2 -> (4-2)/2*100 = 100.0
        assert banana["momentum_pct"] == 100.0
        assert banana["momentum_direction"] == "up"

    def test_first_window_previous_is_zero_for_all(self, tmp_path):
        engine = _make_engine(tmp_path)
        result = engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        # On first window, previous_window is empty -> all prev=0
        for entry in result["top_10"]:
            assert entry["previous_window_units"] == 0

    def test_product_absent_from_current_window_has_correct_momentum(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        # Date (400) is absent from WINDOW2_MR
        result = engine.process_window("window_W2", self.WINDOW2_MR, self.WINDOW2_NAMES)
        date_entry = next(p for p in result["top_10"] if p["product_id"] == 400)
        assert date_entry["current_window_units"] == 0
        assert date_entry["previous_window_units"] == 4
        # (0-4)/4*100 = -100.0
        assert date_entry["momentum_pct"] == -100.0

    def test_empty_mr_output_is_handled_safely(self, tmp_path):
        engine = _make_engine(tmp_path)
        # First window ok
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        # Second window with empty MR output (no sales)
        result = engine.process_window("window_W2", {})
        # Cumulative totals should not change
        assert engine.cumulative_totals["100"] == 3

    def test_product_names_cached_across_windows(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        # Window 2 has no names provided
        result = engine.process_window("window_W2", self.WINDOW2_MR)
        apple = next(p for p in result["top_10"] if p["product_id"] == 100)
        assert apple["product_name"] == "Apple"

    def test_ranking_output_has_required_top_level_keys(self, tmp_path):
        engine = _make_engine(tmp_path)
        result = engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        required_keys = {
            "last_updated", "window_id", "window_size_seconds",
            "total_windows_processed", "top_10", "momentum_movers",
        }
        assert required_keys.issubset(result.keys())

    def test_ranking_output_window_id_matches(self, tmp_path):
        engine = _make_engine(tmp_path)
        result = engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        assert result["window_id"] == "window_W1"

    def test_ranking_entry_has_required_fields(self, tmp_path):
        engine = _make_engine(tmp_path)
        result = engine.process_window("window_W1", self.WINDOW1_MR, self.WINDOW1_NAMES)
        entry = result["top_10"][0]
        required = {
            "rank", "product_id", "product_name", "total_units",
            "current_window_units", "previous_window_units",
            "momentum_pct", "momentum_direction",
        }
        assert required.issubset(entry.keys())


# ---------------------------------------------------------------------------
# JSON state persistence
# ---------------------------------------------------------------------------

class TestStatePersistence:
    WINDOW1_MR = {"100": 3, "200": 2}
    NAMES = {"100": "Apple", "200": "Banana"}

    def test_state_file_created_after_process_window(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.NAMES)
        assert engine.state_file.exists()

    def test_output_file_created_after_process_window(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.NAMES)
        assert engine.output_file.exists()

    def test_state_file_is_valid_json(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.NAMES)
        with open(engine.state_file) as f:
            state = json.load(f)
        assert isinstance(state, dict)

    def test_output_file_is_valid_json(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.NAMES)
        with open(engine.output_file) as f:
            output = json.load(f)
        assert isinstance(output, dict)

    def test_state_persisted_and_reloaded(self, tmp_path):
        engine1 = _make_engine(tmp_path)
        engine1.process_window("window_W1", self.WINDOW1_MR, self.NAMES)

        # Create a second engine pointing to same state dir
        engine2 = _make_engine(tmp_path)
        # Should have loaded state from disk
        assert engine2.cumulative_totals.get("100") == 3
        assert engine2.cumulative_totals.get("200") == 2
        assert engine2.windows_processed == 1
        assert engine2.last_window_id == "window_W1"

    def test_state_file_contains_cumulative_totals(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.NAMES)
        with open(engine.state_file) as f:
            state = json.load(f)
        assert state["cumulative_totals"]["100"] == 3
        assert state["cumulative_totals"]["200"] == 2

    def test_state_file_contains_previous_window(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.NAMES)
        engine.process_window("window_W2", {"100": 1}, {"100": "Apple"})
        with open(engine.state_file) as f:
            state = json.load(f)
        assert state["previous_window"]["100"] == 3

    def test_state_file_contains_window_id(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.NAMES)
        with open(engine.state_file) as f:
            state = json.load(f)
        assert state["window_id"] == "window_W1"

    def test_state_file_contains_windows_processed(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.WINDOW1_MR, self.NAMES)
        with open(engine.state_file) as f:
            state = json.load(f)
        assert state["windows_processed"] == 1

    def test_corrupted_state_file_triggers_fresh_start(self, tmp_path):
        state_file = tmp_path / "ranking_state.json"
        state_file.write_text("NOT VALID JSON {{{")
        engine = _make_engine(tmp_path)
        # Should start with empty state, not crash
        assert engine.cumulative_totals == {}
        assert engine.windows_processed == 0

    def test_missing_state_file_triggers_fresh_start(self, tmp_path):
        engine = _make_engine(tmp_path)
        assert engine.cumulative_totals == {}
        assert engine.windows_processed == 0


# ---------------------------------------------------------------------------
# Atomic write safety
# ---------------------------------------------------------------------------

class TestAtomicWriteJson:
    def test_file_created_with_correct_content(self, tmp_path):
        path = tmp_path / "test_output.json"
        data = {"key": "value", "num": 42}
        _atomic_write_json(path, data)
        assert path.exists()
        loaded = json.loads(path.read_text())
        assert loaded == data

    def test_overwrite_existing_file(self, tmp_path):
        path = tmp_path / "test_output.json"
        _atomic_write_json(path, {"v": 1})
        _atomic_write_json(path, {"v": 2})
        loaded = json.loads(path.read_text())
        assert loaded["v"] == 2

    def test_no_tmp_file_left_behind(self, tmp_path):
        path = tmp_path / "test_output.json"
        _atomic_write_json(path, {"x": 1})
        tmp_files = list(tmp_path.glob("*.tmp"))
        assert tmp_files == []

    def test_parent_dir_created_if_missing(self, tmp_path):
        path = tmp_path / "nested" / "dir" / "output.json"
        _atomic_write_json(path, {"ok": True})
        assert path.exists()


# ---------------------------------------------------------------------------
# Verification: two-window end-to-end with controlled MR-like output
# ---------------------------------------------------------------------------

class TestTwoWindowVerification:
    """
    End-to-end verification using controlled, MapReduce-like window outputs.
    Demonstrates two consecutive windows with calculable rankings and momentum.

    Uses the architecture_spec.md §18 example data:
      Window 1: Apple=3, Banana=2, Cherry=1
      Window 2: Apple=1, Banana=4, Cherry=0 (Cherry absent)

    Expected after Window 2:
      Cumulative: Banana=6, Apple=4, Cherry=1  (also Date=4 from our extended set)
      Momentum:
        Apple:  (1-3)/3*100 = -66.7%
        Banana: (4-2)/2*100 = +100.0%
        Cherry: (0-1)/1*100 = -100.0%  (absent from window 2)
      Top momentum mover: Banana (+100%)
    """

    W1_MR = {"100": 3, "200": 2, "300": 1}
    W2_MR = {"100": 1, "200": 4}  # Cherry absent
    NAMES = {"100": "Apple", "200": "Banana", "300": "Cherry"}

    def test_cumulative_after_two_windows(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.W1_MR, self.NAMES)
        engine.process_window("window_W2", self.W2_MR, self.NAMES)
        assert engine.cumulative_totals["100"] == 4   # Apple
        assert engine.cumulative_totals["200"] == 6   # Banana
        assert engine.cumulative_totals["300"] == 1   # Cherry

    def test_top10_order_after_two_windows(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.W1_MR, self.NAMES)
        result = engine.process_window("window_W2", self.W2_MR, self.NAMES)
        top10 = result["top_10"]
        # Banana(6) > Apple(4) > Cherry(1)
        assert top10[0]["product_id"] == 200
        assert top10[1]["product_id"] == 100
        assert top10[2]["product_id"] == 300

    def test_momentum_for_all_products_after_two_windows(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.W1_MR, self.NAMES)
        result = engine.process_window("window_W2", self.W2_MR, self.NAMES)
        top10 = result["top_10"]

        apple = next(p for p in top10 if p["product_id"] == 100)
        banana = next(p for p in top10 if p["product_id"] == 200)
        cherry = next(p for p in top10 if p["product_id"] == 300)

        assert apple["momentum_pct"] == -66.7
        assert banana["momentum_pct"] == 100.0
        # Cherry absent from window 2 -> current=0, previous=1
        assert cherry["momentum_pct"] == -100.0

    def test_previous_window_data_actually_used(self, tmp_path):
        """Verify that the engine uses WINDOW1 data as 'previous' when computing
        WINDOW2 momentum (not zeroes or some other value)."""
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.W1_MR, self.NAMES)
        result = engine.process_window("window_W2", self.W2_MR, self.NAMES)
        top10 = result["top_10"]
        apple = next(p for p in top10 if p["product_id"] == 100)
        # previous_window_units must be 3 (from W1), not 0
        assert apple["previous_window_units"] == 3

    def test_top5_momentum_movers_after_two_windows(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.W1_MR, self.NAMES)
        result = engine.process_window("window_W2", self.W2_MR, self.NAMES)
        movers = result["momentum_movers"]
        # Only products with current > 0: Apple(1) and Banana(4)
        mover_pids = [m["product_id"] for m in movers]
        assert 300 not in mover_pids  # Cherry absent from W2
        # Banana has higher momentum -> first
        assert movers[0]["product_id"] == 200
        assert movers[0]["momentum_pct"] == 100.0

    def test_output_json_is_readable_and_valid(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.W1_MR, self.NAMES)
        engine.process_window("window_W2", self.W2_MR, self.NAMES)
        with open(engine.output_file) as f:
            output = json.load(f)
        assert output["total_windows_processed"] == 2
        assert len(output["top_10"]) == 3
        assert output["top_10"][0]["product_name"] == "Banana"

    def test_state_file_previous_window_is_window1_data(self, tmp_path):
        engine = _make_engine(tmp_path)
        engine.process_window("window_W1", self.W1_MR, self.NAMES)
        engine.process_window("window_W2", self.W2_MR, self.NAMES)
        with open(engine.state_file) as f:
            state = json.load(f)
        # previous_window in state must reflect W1 MR output
        assert state["previous_window"]["100"] == 3  # Apple W1
        assert state["previous_window"]["200"] == 2  # Banana W1
        assert state["previous_window"]["300"] == 1  # Cherry W1
