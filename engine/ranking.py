"""
Ranking + Momentum Engine — Stage 8.

Responsibilities:
  1. Parse the completed MapReduce output for a given window from HDFS.
  2. Maintain cumulative product units across all processed windows.
  3. Maintain previous-window per-product units for momentum calculation.
  4. Generate the Top-10 products ranked by cumulative units sold.
  5. Compute momentum for each Top-10 product.
  6. Generate the supplementary Top-5 momentum movers.
  7. Persist state safely to state/ranking_state.json.
  8. Write the final ranking JSON to state/ranking_output.json (atomic rename).

Momentum formula (architecture_spec.md §11):
    if current == 0 and previous == 0:
        return 0.0
    momentum = ((current - previous) / max(previous, 1)) * 100.0
    return round(momentum, 1)

Tie-breaking (secondary sort):
    Top-10  : cumulative units desc -> product_id asc (deterministic)
    Top-5   : momentum_pct desc -> product_id asc (deterministic)

State file (state/ranking_state.json):
    {
        "cumulative_totals": {"<product_id>": <int>, ...},
        "previous_window":   {"<product_id>": <int>, ...},
        "current_window":    {"<product_id>": <int>, ...},
        "window_id":         "<window_YYYYMMDD_HHMMSS>",
        "last_updated":      "<ISO-8601 UTC>",
        "windows_processed": <int>,
        "product_names":     {"<product_id>": "<name>", ...}
    }

Output file (state/ranking_output.json):
    Full ranking JSON expected by the FastAPI stage.

Usage (CLI):
    python -m engine.ranking <window_id>
    python -m engine.ranking <window_id> --hdfs-output-base /bda-project/output
"""

import argparse
import json
import logging
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from config.settings import Settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("RankingEngine")

# ---------------------------------------------------------------------------
# Pure functions (no I/O) -- easily unit-testable
# ---------------------------------------------------------------------------

def compute_momentum(current_units: int, previous_units: int) -> float:
    """Compute momentum percentage between two consecutive windows.

    Formula (architecture_spec.md section 11):
        if current == 0 and previous == 0: return 0.0
        ((current - previous) / max(previous, 1)) * 100.0

    Args:
        current_units:  Units sold in the current window.
        previous_units: Units sold in the previous window.

    Returns:
        Momentum percentage rounded to one decimal place.

    Examples:
        >>> compute_momentum(45, 20)
        125.0
        >>> compute_momentum(20, 45)
        -55.6
        >>> compute_momentum(5, 0)
        500.0
        >>> compute_momentum(0, 0)
        0.0
        >>> compute_momentum(0, 10)
        -100.0
    """
    if current_units == 0 and previous_units == 0:
        return 0.0

    denominator = max(previous_units, 1)
    momentum = ((current_units - previous_units) / denominator) * 100.0
    return round(momentum, 1)


def _momentum_direction(momentum_pct: float) -> str:
    """Return 'up', 'down', or 'flat' based on momentum sign."""
    if momentum_pct > 0:
        return "up"
    if momentum_pct < 0:
        return "down"
    return "flat"


def parse_mr_output(raw_text: str) -> Dict[str, int]:
    """Parse MapReduce reducer output (TSV: product_id\\ttotal_units) to a dict.

    Malformed lines (missing tab, non-integer units, empty product_id) are
    silently skipped so that a single bad line does not abort processing.

    Args:
        raw_text: Full text content of the MapReduce part-00000 file.

    Returns:
        Dict mapping str(product_id) -> int(total_units).
    """
    result: Dict[str, int] = {}
    for line in raw_text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            logger.warning(f"Skipping malformed MR output line (no tab): {line!r}")
            continue
        product_id = parts[0].strip()
        if not product_id:
            logger.warning(f"Skipping MR output line with empty product_id: {line!r}")
            continue
        try:
            units = int(parts[1].strip())
        except ValueError:
            logger.warning(
                f"Skipping MR output line with non-integer units: {line!r}"
            )
            continue
        result[product_id] = units
    return result


def build_top10(
    cumulative_totals: Dict[str, int],
    current_window: Dict[str, int],
    previous_window: Dict[str, int],
    product_names: Dict[str, str],
) -> List[dict]:
    """Build the Top-10 ranked product list.

    Ranking is primarily by cumulative units (descending).
    Tie-breaking: product_id ascending (deterministic).

    For each product the dict contains:
        rank, product_id (int), product_name, total_units,
        current_window_units, previous_window_units,
        momentum_pct, momentum_direction.

    Args:
        cumulative_totals: product_id -> cumulative total units.
        current_window:    product_id -> units this window.
        previous_window:   product_id -> units last window.
        product_names:     product_id -> human-readable name.

    Returns:
        List of up to 10 dicts, ordered by rank.
    """
    # Sort: (-cumulative_units, product_id_str) for deterministic ordering
    sorted_products = sorted(
        cumulative_totals.items(),
        key=lambda item: (-item[1], item[0]),
    )
    top10 = sorted_products[:10]

    result = []
    for rank, (pid, total_units) in enumerate(top10, start=1):
        cur = current_window.get(pid, 0)
        prev = previous_window.get(pid, 0)
        mom = compute_momentum(cur, prev)
        result.append(
            {
                "rank": rank,
                "product_id": _safe_int(pid),
                "product_name": product_names.get(pid, f"Product {pid}"),
                "total_units": total_units,
                "current_window_units": cur,
                "previous_window_units": prev,
                "momentum_pct": mom,
                "momentum_direction": _momentum_direction(mom),
            }
        )
    return result


def build_top5_momentum_movers(
    current_window: Dict[str, int],
    previous_window: Dict[str, int],
    cumulative_totals: Dict[str, int],
    product_names: Dict[str, str],
) -> List[dict]:
    """Build the Top-5 momentum movers list.

    Includes only products with current_window_units > 0.
    Sorted by momentum_pct descending; tie-break: product_id ascending.

    Args:
        current_window:    product_id -> units this window.
        previous_window:   product_id -> units last window.
        cumulative_totals: product_id -> cumulative total units.
        product_names:     product_id -> human-readable name.

    Returns:
        List of up to 5 dicts.
    """
    candidates = []
    for pid, cur in current_window.items():
        if cur <= 0:
            continue
        prev = previous_window.get(pid, 0)
        mom = compute_momentum(cur, prev)
        candidates.append(
            {
                "product_id": _safe_int(pid),
                "product_name": product_names.get(pid, f"Product {pid}"),
                "total_units": cumulative_totals.get(pid, cur),
                "current_window_units": cur,
                "previous_window_units": prev,
                "momentum_pct": mom,
                "momentum_direction": _momentum_direction(mom),
            }
        )

    # Sort: (-momentum_pct, str(product_id)) for deterministic ordering
    candidates.sort(key=lambda x: (-x["momentum_pct"], str(x["product_id"])))
    return candidates[:5]


def _safe_int(value: str) -> object:
    """Return int(value) if parseable, else the original string."""
    try:
        return int(value)
    except (ValueError, TypeError):
        return value


# ---------------------------------------------------------------------------
# HDFS reader
# ---------------------------------------------------------------------------

def read_hdfs_file(hdfs_path: str, hadoop_container: str) -> Optional[str]:
    """Read a file from HDFS and return its text content.

    Tries ``hdfs dfs -cat`` locally first; falls back to ``docker exec``.

    Args:
        hdfs_path:        Full HDFS path (e.g. /bda-project/output/window_.../part-00000).
        hadoop_container: Docker container name.

    Returns:
        File contents as a string, or None on failure.
    """
    import shutil

    if shutil.which("hdfs") is not None:
        cmd = ["hdfs", "dfs", "-cat", hdfs_path]
    else:
        cmd = ["docker", "exec", hadoop_container, "hdfs", "dfs", "-cat", hdfs_path]

    logger.debug(f"Reading HDFS file: {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=60,
        )
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            logger.error(
                f"hdfs cat failed (exit {result.returncode}) for {hdfs_path}: {stderr}"
            )
            return None
        return result.stdout.decode("utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        logger.error(f"Timeout reading HDFS file: {hdfs_path}")
        return None
    except Exception as exc:
        logger.error(f"Unexpected error reading HDFS file {hdfs_path}: {exc}")
        return None


# ---------------------------------------------------------------------------
# RankingEngine
# ---------------------------------------------------------------------------

class RankingEngine:
    """Stateful ranking engine: consumes MapReduce window outputs and produces
    the continuously updated Top-10 product ranking JSON.

    State is persisted across runs in state/ranking_state.json so that
    cumulative totals and previous-window data survive restarts.

    Atomic writes: ranking_output.json is written via a temp file and then
    renamed so a partial write is never visible to readers (FastAPI).
    """

    def __init__(
        self,
        settings: Optional[Settings] = None,
        hadoop_container: Optional[str] = None,
        hdfs_output_base: Optional[str] = None,
    ) -> None:
        self.settings = settings or Settings()
        self.hadoop_container = (
            hadoop_container or self.settings.HADOOP_CONTAINER
        )
        self.hdfs_output_base = hdfs_output_base or (
            f"{self.settings.HDFS_BASE_PATH}/output"
        )

        self.state_dir: Path = self.settings.STATE_DIR
        self.state_file: Path = self.settings.RANKING_STATE_FILE
        self.output_file: Path = self.settings.RANKING_OUTPUT_FILE

        # In-memory state (loaded from disk on startup)
        self.cumulative_totals: Dict[str, int] = {}
        self.previous_window: Dict[str, int] = {}
        self.current_window: Dict[str, int] = {}
        self.product_names: Dict[str, str] = {}
        self.last_window_id: str = ""
        self.windows_processed: int = 0
        self.window_history: List[dict] = []

        self._load_state()

    # ------------------------------------------------------------------
    # State persistence
    # ------------------------------------------------------------------

    def _load_state(self) -> None:
        """Load state from state/ranking_state.json if it exists.

        On any read or parse error the engine starts with empty state
        (safe recovery behaviour).
        """
        if not self.state_file.exists():
            logger.info("No existing state file found; starting fresh.")
            return

        try:
            with open(self.state_file, "r", encoding="utf-8") as fh:
                state = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning(
                f"Could not read state file {self.state_file}: {exc}. "
                "Starting with empty state."
            )
            return

        self.cumulative_totals = {
            str(k): int(v)
            for k, v in state.get("cumulative_totals", {}).items()
        }
        self.previous_window = {
            str(k): int(v)
            for k, v in state.get("previous_window", {}).items()
        }
        self.current_window = {
            str(k): int(v)
            for k, v in state.get("current_window", {}).items()
        }
        self.product_names = {
            str(k): str(v)
            for k, v in state.get("product_names", {}).items()
        }
        self.last_window_id = state.get("window_id", "")
        self.windows_processed = int(state.get("windows_processed", 0))
        self.window_history = state.get("window_history", [])

        logger.info(
            f"State loaded: {len(self.cumulative_totals)} products, "
            f"{self.windows_processed} windows processed, "
            f"last_window_id={self.last_window_id!r}"
        )

    def _save_state(self, window_id: str) -> None:
        """Persist current in-memory state to state/ranking_state.json.

        Uses atomic write (temp file + rename) to prevent partial exposure.
        """
        state = {
            "cumulative_totals": self.cumulative_totals,
            "previous_window": self.previous_window,
            "current_window": self.current_window,
            "product_names": self.product_names,
            "window_id": window_id,
            "last_updated": _utc_now(),
            "windows_processed": self.windows_processed,
            "window_history": self.window_history,
        }
        _atomic_write_json(self.state_file, state)
        logger.debug(f"State saved to {self.state_file}")

    # ------------------------------------------------------------------
    # MapReduce output reader
    # ------------------------------------------------------------------

    def _read_mr_output(self, window_id: str) -> Optional[Dict[str, int]]:
        """Read and parse the MapReduce output for *window_id* from HDFS.

        The MR output directory is: <hdfs_output_base>/<window_id>/
        The reducer writes: part-00000 (single reducer by default).

        Returns:
            Dict {product_id_str: units} or None on failure.
        """
        hdfs_path = f"{self.hdfs_output_base}/{window_id}/part-00000"
        raw = read_hdfs_file(hdfs_path, self.hadoop_container)
        if raw is None:
            logger.error(
                f"Failed to read MR output from HDFS: {hdfs_path}"
            )
            return None
        parsed = parse_mr_output(raw)
        logger.info(
            f"Parsed MR output for {window_id}: {len(parsed)} products"
        )
        return parsed

    # ------------------------------------------------------------------
    # Core processing logic
    # ------------------------------------------------------------------

    def process_window(
        self,
        window_id: str,
        mr_output: Optional[Dict[str, int]] = None,
        product_names: Optional[Dict[str, str]] = None,
    ) -> dict:
        """Process one completed MapReduce window and update rankings.

        If *mr_output* is not provided it is fetched from HDFS automatically.
        If *product_names* is provided those names are merged into the engine's
        product_names dict (supplementing names already learned from previous
        windows).

        Steps:
          1. Fetch/use MR output.
          2. Update product_names cache.
          3. Move current_window -> previous_window.
          4. Set current_window = mr_output.
          5. Update cumulative_totals.
          6. Build Top-10 by cumulative units (tie-break: product_id asc).
          7. Build Top-5 momentum movers (current_window_units > 0,
             sorted by momentum_pct desc, tie-break: product_id asc).
          8. Write ranking_output.json (atomic).
          9. Write ranking_state.json (atomic).

        Args:
            window_id:     Label like 'window_20260927_171600'.
            mr_output:     Optional pre-parsed {product_id_str: units} dict.
            product_names: Optional {product_id_str: name} dict to cache.

        Returns:
            The ranking output dict that was written to ranking_output.json.
        """
        logger.info(f"Processing window: {window_id}")

        # Step 1: Obtain MR output
        if mr_output is None:
            mr_output = self._read_mr_output(window_id)
            if mr_output is None:
                logger.error(
                    f"Cannot process window {window_id}: MR output unavailable."
                )
                return {}

        # Step 2: Merge product names
        if product_names:
            for pid, name in product_names.items():
                self.product_names[str(pid)] = str(name)

        # Step 3 & 4: Rotate windows
        self.previous_window = self.current_window
        self.current_window = {str(k): int(v) for k, v in mr_output.items()}

        # Step 5: Update cumulative totals
        for pid, units in self.current_window.items():
            self.cumulative_totals[pid] = (
                self.cumulative_totals.get(pid, 0) + units
            )

        self.windows_processed += 1
        self.last_window_id = window_id

        # Step 6: Top-10
        top10 = build_top10(
            self.cumulative_totals,
            self.current_window,
            self.previous_window,
            self.product_names,
        )

        # Step 7: Top-5 momentum movers
        momentum_movers = build_top5_momentum_movers(
            self.current_window,
            self.previous_window,
            self.cumulative_totals,
            self.product_names,
        )

        # Step 8: Record window history (last 12 windows)
        total_window_units = sum(self.current_window.values())
        window_record = {
            "window_id": window_id,
            "timestamp": _utc_now(),
            "total_window_units": total_window_units,
            "product_units": {str(k): int(v) for k, v in self.current_window.items()},
        }
        self.window_history.append(window_record)
        if len(self.window_history) > 20:
            self.window_history = self.window_history[-20:]

        # Step 9: Build and write ranking output
        ranking_output = {
            "last_updated": _utc_now(),
            "window_id": window_id,
            "window_size_seconds": self.settings.WINDOW_SIZE,
            "total_windows_processed": self.windows_processed,
            "total_window_units": total_window_units,
            "top_10": top10,
            "momentum_movers": momentum_movers,
            "window_history": self.window_history,
        }

        _atomic_write_json(self.output_file, ranking_output)
        logger.info(
            f"Ranking output written to {self.output_file} "
            f"(top10={len(top10)}, movers={len(momentum_movers)})"
        )

        # Step 9: Persist state
        self._save_state(window_id)

        return ranking_output

    # ------------------------------------------------------------------
    # Convenience: process from HDFS path directly
    # ------------------------------------------------------------------

    def process_window_from_hdfs(self, window_id: str) -> dict:
        """Fetch MR output from HDFS then run process_window.

        This is the main entry point used by the CLI.
        """
        return self.process_window(window_id, mr_output=None)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    """Return current UTC time as ISO-8601 string with Z suffix."""
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write_json(path: Path, data: dict) -> None:
    """Write *data* as JSON to *path* atomically (temp file + rename).

    This ensures that a reader (FastAPI) never sees a partial file.

    Args:
        path: Destination Path.
        data: Dict to serialise as JSON.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write to a sibling temp file first
    tmp_fd, tmp_path_str = tempfile.mkstemp(
        dir=str(path.parent), suffix=".tmp"
    )
    tmp_path = Path(tmp_path_str)
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
        tmp_path.replace(path)  # atomic on POSIX
    except Exception:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """CLI: process a single window and update ranking state + output."""
    parser = argparse.ArgumentParser(
        description="BDA Stage 8 -- Ranking + Momentum Engine"
    )
    parser.add_argument(
        "window_id",
        help="Window label to process (e.g. window_20260927_171600)",
    )
    parser.add_argument(
        "--hdfs-output-base",
        default=None,
        help="HDFS base path for MapReduce output (default: from settings).",
    )
    args = parser.parse_args()

    engine = RankingEngine(hdfs_output_base=args.hdfs_output_base)
    result = engine.process_window_from_hdfs(args.window_id)

    if result:
        top_entry = result["top_10"][0] if result.get("top_10") else "N/A"
        print(f"Ranking updated. Top product: {top_entry}")
        sys.exit(0)
    else:
        print("ERROR: Could not process window.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
