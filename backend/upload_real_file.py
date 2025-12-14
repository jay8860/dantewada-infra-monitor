
import requests

# 1. Login
login_url = "http://localhost:8000/api/token"
login_data = {"username": "admin", "password": "admin123"}
try:
    auth_resp = requests.post(login_url, data=login_data)
    if auth_resp.status_code != 200:
        print(f"Login failed: {auth_resp.text}")
        exit(1)
    
    token = auth_resp.json()["access_token"]
    print("Login successful.")

    # 2. Upload
    upload_url = "http://localhost:8000/api/works/upload"
    file_path = "../Dmf works Dec 2025 updated.xlsx"
    files = {"file": ("Dmf works Dec 2025 updated.xlsx", open(file_path, "rb"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    headers = {"Authorization": f"Bearer {token}"}
    
    print("Uploading file...")
    up_resp = requests.post(upload_url, headers=headers, files=files)
    print(f"Upload Status: {up_resp.status_code}")
    print(f"Upload Response: {up_resp.text}")

except Exception as e:
    print(f"Error: {e}")
