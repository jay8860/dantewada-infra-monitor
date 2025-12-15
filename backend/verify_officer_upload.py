import requests
import os

API_URL = "https://dantewada-infra-monitor-production.up.railway.app/api"
USERNAME = "officer"
PASSWORD = "officer123"
IMAGE_FILE = "test_evidence.jpg"

def verify_upload():
    # 1. Login
    print(f"Logging in as {USERNAME}...")
    resp = requests.post(f"{API_URL}/token", data={"username": USERNAME, "password": PASSWORD})
    if resp.status_code != 200:
        print(f"Login Failed: {resp.text}")
        exit(1)
    
    token = resp.json()["access_token"]
    print("Login Successful.")

    # 2. Get a Work ID
    print("Fetching a work item...")
    works_resp = requests.get(f"{API_URL}/works", params={"department": "Edu"}, headers={"Authorization": f"Bearer {token}"})
    # If filter returns empty, get all
    if not works_resp.json():
        works_resp = requests.get(f"{API_URL}/works", headers={"Authorization": f"Bearer {token}"})
    
    works = works_resp.json()
    if not works:
        print("No works found to test.")
        exit(1)
    
    work_id = works[0]['id']
    print(f"Testing with Work ID: {work_id} ({works[0]['work_name'][:30]}...)")

    # 3. Upload Inspection
    print("Uploading inspection photo...")
    files = {'photos': ('test_evidence.jpg', open(IMAGE_FILE, 'rb'), 'image/jpeg')}
    data = {
        'status': 'In Progress',
        'latitude': '18.9000',
        'longitude': '81.3000',
        'remarks': 'Automated Verification Upload'
    }
    
    up_resp = requests.post(
        f"{API_URL}/works/{work_id}/inspections",
        headers={"Authorization": f"Bearer {token}"},
        data=data,
        files=files
    )
    
    print(f"Upload Status: {up_resp.status_code}")
    print(f"Upload Response: {up_resp.text}")
    
    if up_resp.status_code == 200:
        print("VERIFICATION PASSED: Officer Upload works.")
    else:
        print("VERIFICATION FAILED.")

if __name__ == "__main__":
    verify_upload()
