
import requests
import json

API_URL = "https://dantewada-infra-monitor-production.up.railway.app/api"

def check_db():
    print(f"--- Checking Locations ---")
    try:
        resp = requests.get(f"{API_URL}/works/locations")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Total Works with Locations: {len(data)}")
            if len(data) > 0:
                print(f"Sample: {data[0]}")
        else:
            print(f"Location Error: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"Loc Exception: {e}")

def check_stats():
    print(f"\n--- Checking Stats (Last Sync) ---")
    try:
        resp = requests.get(f"{API_URL}/works/stats")
        if resp.status_code == 200:
            print(f"Stats: {json.dumps(resp.json(), indent=2)}")
        else:
            print(f"Stats Error: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"Stats Exception: {e}")

if __name__ == "__main__":
    check_db()
    check_stats()
