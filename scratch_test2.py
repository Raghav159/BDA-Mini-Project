import time
from kafka import KafkaConsumer

def main():
    print("Testing KafkaConsumer iteration behavior")
    c = KafkaConsumer("test", bootstrap_servers="localhost:9092", consumer_timeout_ms=1000)
    print("Starting loop 1")
    for msg in c:
        pass
    print("Loop 1 ended (StopIteration caught).")
    
    t0 = time.time()
    for msg in c:
        pass
    t1 = time.time()
    print(f"Loop 2 ended in {t1 - t0:.3f} seconds.")

if __name__ == "__main__":
    main()
