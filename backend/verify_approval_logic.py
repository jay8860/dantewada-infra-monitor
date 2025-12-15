import requests
import time

API_URL = "https://dantewada-infra-monitor-production.up.railway.app/api"
USERNAME = "officer"
PASSWORD = "officer123"
IMAGE_FILE = "test_evidence.jpg"

def verify_approval():
    # 1. Login
    print(f"Logging in...")
    resp = requests.post(f"{API_URL}/token", data={"username": USERNAME, "password": PASSWORD})
    if resp.status_code != 200:
        print("Login Failed")
        exit(1)
    token = resp.json()["access_token"]
    
    # 2. Get Work ID 1 and Check Initial Status
    # Since DB is restored, ID 1 should be "Not Started" (default).
    print("Fetching Work ID 1...")
    # We use the new pagination API to check if it works? No, fetching single ID via list or I'll implement get_one?
    # Actually I didn't implement get_one, I implemented get_works list.
    # So I fetch list and filter.
    works_resp = requests.get(f"{API_URL}/works?limit=5", headers={"Authorization": f"Bearer {token}"})
    works = works_resp.json()
    if not works:
        print("No works found.")
        exit(1)
    
    work = works[0]
    initial_status = work['current_status']
    work_id = work['id']
    print(f"Work {work_id} Initial Status: {initial_status}")

    # 3. Upload Inspection (Status: Completed)
    print("Uploading Inspection with status 'Completed'...")
    files = {'photos': ('test_evidence.jpg', open(IMAGE_FILE, 'rb'), 'image/jpeg')}
    data = {
        'status': 'Completed', # This should fit the Inspection Log, but NOT the Work Status
        'latitude': '19.0',
        'longitude': '82.0',
        'remarks': 'Testing Approval Workflow'
    }
    
    up_resp = requests.post(
        f"{API_URL}/works/{work_id}/inspections",
        headers={"Authorization": f"Bearer {token}"},
        data=data,
        files=files
    )
    
    if up_resp.status_code != 200:
        print(f"Upload Failed: {up_resp.text}")
        exit(1)
        
    print("Upload Successful.")
    
    # 4. Fetch Work Again and Verify Status UNCHANGED
    print("Verifying Post-Upload Status...")
    works_resp = requests.get(f"{API_URL}/works?limit=5", headers={"Authorization": f"Bearer {token}"})
    updated_work = works_resp.json()[0]
    
    new_status = updated_work['current_status']
    print(f"Work {work_id} New Status: {new_status}")
    
    if new_status == initial_status:
        print("VERIFICATION PASSED: Status remained unchanged (Approval Pending).")
    else:
        print(f"VERIFICATION FAILED: Status changed to {new_status} (Auto-update still active).")

if __name__ == "__main__":
    verify_approval()
