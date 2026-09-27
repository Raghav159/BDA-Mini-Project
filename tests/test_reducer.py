import subprocess
import pytest

REDUCER_PATH = "mapreduce/reducer.py"

def run_reducer(input_str: str) -> str:
    proc = subprocess.Popen(
        ["python3", REDUCER_PATH],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    stdout, stderr = proc.communicate(input=input_str)
    assert proc.returncode == 0, f"Reducer failed with stderr: {stderr}"
    return stdout

def test_reducer_single_product():
    input_data = (
        "24852\t1\n"
        "24852\t1\n"
        "24852\t3\n"
    )
    expected = "24852\t5\n"
    output = run_reducer(input_data)
    assert output == expected

def test_reducer_multiple_products():
    input_data = (
        "13176\t1\n"
        "24852\t1\n"
        "24852\t1\n"
        "30000\t10\n"
    )
    expected = (
        "13176\t1\n"
        "24852\t2\n"
        "30000\t10\n"
    )
    output = run_reducer(input_data)
    assert output == expected

def test_reducer_malformed_lines():
    input_data = (
        "13176\t1\n"
        "BADLINE\n"
        "13176\tnot_a_number\n"
        "13176\t2\n"
    )
    expected = "13176\t3\n"
    output = run_reducer(input_data)
    assert output == expected

def test_reducer_zero_units():
    input_data = (
        "13176\t0\n"
        "13176\t1\n"
    )
    expected = "13176\t1\n"
    output = run_reducer(input_data)
    assert output == expected

def test_reducer_empty_input():
    input_data = ""
    expected = ""
    output = run_reducer(input_data)
    assert output == expected
