import requests
import pandas as pd

# Login first
url = "http://localhost:8000/api"
session = requests.Session()

print("Logging in...")
login_data = {
    "username": "admin",
    "password": "admin123"
}
# Note: FastAPI expects form data for OAuth2
response = session.post(f"{url}/token", data=login_data)

if response.status_code != 200:
    print(f"Login Failed: {response.text}")
    exit(1)

token = response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

print("Uploading file...")
files = {'file': open('../../sample_works_v2.csv', 'rb')}
try:
    r = session.post(f"{url}/works/upload", headers=headers, files=files)
    print(f"Status Code: {r.status_code}")
    print(f"Response: {r.text}")
except Exception as e:
    print(f"Error: {e}")
