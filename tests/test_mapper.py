import subprocess
import sys
import pytest

MAPPER_PATH = "mapreduce/mapper.py"

def run_mapper(input_str: str) -> str:
    proc = subprocess.Popen(
        [sys.executable, MAPPER_PATH],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    stdout, stderr = proc.communicate(input=input_str)
    assert proc.returncode == 0, f"Mapper failed with stderr: {stderr}"
    return stdout

def test_mapper_valid_input():
    input_data = (
        "24852\tBanana\t1\t2026-09-27T17:00:00Z\n"
        "24852\tBanana\t2\t2026-09-27T17:00:01Z\n"
        "13176\tBag of Organic Bananas\t1\t2026-09-27T17:00:02Z\n"
    )
    expected = (
        "24852\t1\n"
        "24852\t2\n"
        "13176\t1\n"
    )
    output = run_mapper(input_data)
    assert output == expected

def test_mapper_malformed_input():
    input_data = (
        "24852\tBanana\t1\t2026-09-27T17:00:00Z\n"
        "INVALID_ROW_NO_TABS\n"
        "100\tApple\tnot_an_int\t2026-09-27T17:00:00Z\n"
        "\t\t1\t2026-09-27T17:00:00Z\n"  # Empty product_id
        "300\tCherry\t5\t2026-09-27T17:00:00Z\n"
    )
    expected = (
        "24852\t1\n"
        "300\t5\n"
    )
    output = run_mapper(input_data)
    assert output == expected

def test_mapper_zero_units():
    input_data = "24852\tBanana\t0\t2026-09-27T17:00:00Z\n"
    expected = "24852\t0\n"
    output = run_mapper(input_data)
    assert output == expected

def test_mapper_empty_input():
    input_data = ""
    expected = ""
    output = run_mapper(input_data)
    assert output == expected
