import requests
import os

url = "http://localhost:8000/api"
auth = {"username": "admin", "password": "admin123"}
try:
    r = requests.post(f"{url}/token", data=auth)
    r.raise_for_status()
    token = r.json()['access_token']
    print(f"Token obtained: {token[:15]}...")

    files = {'file': open('../sample_works_v3.csv', 'rb')}
    headers = {'Authorization': f'Bearer {token}'}
    r = requests.post(f"{url}/works/upload", files=files, headers=headers)
    print(f"Upload Status: {r.status_code}")
    print(r.text)
except Exception as e:
    print(f"Error: {e}")
