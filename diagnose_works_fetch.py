
import requests
import json

API_URL = "https://dantewada-infra-monitor-production.up.railway.app/api"
# API_URL = "http://localhost:8000/api"

def check_work_fetch():
    print("--- 1. Get List of Works ---")
    try:
        # Fetch list to get a valid ID
        resp = requests.get(f"{API_URL}/works?limit=5")
        if resp.status_code == 200:
            works = resp.json()
            if not works:
                print("No works returned from /works")
                return
            
            valid_work = works[0]
            work_id = valid_work['id']
            print(f"Found Work ID: {work_id}")
            print(f"Work Name: {valid_work.get('work_name')}")

            print(f"\n--- 2. Fetch Details for ID {work_id} ---")
            detail_resp = requests.get(f"{API_URL}/works/{work_id}")
            print(f"Status: {detail_resp.status_code}")
            if detail_resp.status_code == 200:
                print(f"Details: {json.dumps(detail_resp.json(), indent=2)}")
            else:
                 print(f"Error: {detail_resp.text}")

        else:
            print(f"Error fetching list: {resp.text}")

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    check_work_fetch()
