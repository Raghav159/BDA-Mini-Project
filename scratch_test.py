import time
from kafka import KafkaConsumer

def main():
    print("Testing KafkaConsumer StopIteration behavior")
    c = KafkaConsumer("test", bootstrap_servers="localhost:9092", consumer_timeout_ms=2000)
    print("Starting loop 1")
    for msg in c:
        print("Got msg")
    
    print("Loop 1 ended (StopIteration caught). Starting loop 2")
    try:
        for msg in c:
            print("Got msg loop 2")
        print("Loop 2 ended!")
    except Exception as e:
        print("Exception in loop 2:", type(e))

if __name__ == "__main__":
    main()
