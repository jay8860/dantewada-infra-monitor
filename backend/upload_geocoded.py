
import requests
import os

# 1. Login
login_url = "http://localhost:8000/api/token"
login_data = {"username": "admin", "password": "admin123"}
try:
    print(f"Logging in to {login_url}...")
    auth_resp = requests.post(login_url, data=login_data)
    if auth_resp.status_code != 200:
        print(f"Login failed: {auth_resp.text}")
        exit(1)
    
    token = auth_resp.json()["access_token"]
    print("Login successful.")

    # 2. Upload
    upload_url = "http://localhost:8000/api/works/upload"
    # File is in the parent directory of backend
    file_path = "../Dmf_works_Dec_2025_updated_with_coords.xlsx"
    
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        exit(1)

    files = {"file": ("Dmf_works_Dec_2025_updated_with_coords.xlsx", open(file_path, "rb"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    headers = {"Authorization": f"Bearer {token}"}
    
    print(f"Uploading file: {file_path}...")
    # Increase timeout for large file processing
    up_resp = requests.post(upload_url, headers=headers, files=files, timeout=60)
    print(f"Upload Status: {up_resp.status_code}")
    print(f"Upload Response: {up_resp.text}")

except Exception as e:
    print(f"Error: {e}")
