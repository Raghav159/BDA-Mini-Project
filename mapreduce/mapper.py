#!/usr/bin/env python3
"""
MapReduce Mapper for BDA Mini Project.
Reads TSV records from stdin: product_id <TAB> product_name <TAB> units <TAB> event_time
Emits tab-separated product_id and units: product_id <TAB> units
"""
import sys

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) < 3:
            continue
        product_id = parts[0].strip()
        units_str = parts[2].strip()
        if not product_id:
            continue
        try:
            units = int(units_str)
        except ValueError:
            continue
        print(f"{product_id}\t{units}")

if __name__ == '__main__':
    main()
