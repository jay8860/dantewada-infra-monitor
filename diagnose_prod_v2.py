
import requests
import json

API_URL = "https://dantewada-infra-monitor-production.up.railway.app/api"
# API_URL = "https://dantewada-infra-monitor-production-d35a.up.railway.app/api" # User provided this, likely same backend

def check_map_data():
    print("--- Checking Map Data ---")
    try:
        resp = requests.get(f"{API_URL}/works/locations")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Count: {len(data)}")
            if len(data) > 0:
                print(f"Sample: {data[0]}")
        else:
            print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Exception: {e}")

def check_assign_preflight(work_id):
    print(f"\n--- Checking Assign Logic (Work {work_id}) ---")
    # First get work to see if it exists
    ws = requests.get(f"{API_URL}/works/{work_id}")
    if ws.status_code != 200:
        print(f"Work {work_id} not found.")
        return

    # Try to assign with valid payload
    payload = {"officer_id": 2, "deadline_days": 7}
    print(f"Sending payload: {payload}")
    # Auth
    token_resp = requests.post(f"{API_URL}/token", data={"username": "admin", "password": "admin123"})
    if token_resp.status_code != 200:
        print("Auth failed")
        return
    token = token_resp.json()["access_token"]
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Intentionally dry-run or just see if it hits 422
    resp = requests.post(f"{API_URL}/works/{work_id}/assign", json=payload, headers=headers)
    print(f"Assign Response Code: {resp.status_code}")
    print(f"Assign Response Body: {resp.text}")

if __name__ == "__main__":
    check_map_data()
    check_assign_preflight(1)
