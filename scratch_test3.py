import time
import logging
from consumer.consumer import WindowOrchestrator

logging.basicConfig(level=logging.DEBUG)

def main():
    orch = WindowOrchestrator(consumer_timeout_ms=5000)
    orch.connect()
    # It should not exit after 5 seconds!
    orch.run(max_windows=2)

if __name__ == "__main__":
    main()
