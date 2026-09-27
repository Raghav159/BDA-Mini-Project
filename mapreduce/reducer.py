#!/usr/bin/env python3
"""
MapReduce Reducer for BDA Mini Project.
Reads sorted key-value pairs from stdin: product_id <TAB> units
Sums total units per product_id and emits: product_id <TAB> total_units
"""
import sys

def main():
    current_product = None
    current_count = 0

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) != 2:
            continue
        product_id = parts[0].strip()
        count_str = parts[1].strip()
        try:
            count = int(count_str)
        except ValueError:
            continue

        if current_product == product_id:
            current_count += count
        else:
            if current_product is not None:
                print(f"{current_product}\t{current_count}")
            current_product = product_id
            current_count = count

    if current_product is not None:
        print(f"{current_product}\t{current_count}")

if __name__ == '__main__':
    main()
