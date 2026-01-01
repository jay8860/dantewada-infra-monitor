
import requests

API_URL = "https://dantewada-infra-monitor-production.up.railway.app/api/works/locations"

try:
    print(f"Fetching locations from {API_URL}...")
    resp = requests.get(API_URL)
    resp.raise_for_status()
    data = resp.json()
    print(f"Total Works with Locations: {len(data)}")
    
    # Analyze a few
    if len(data) > 0:
        print("Sample:", data[0])
        
except Exception as e:
    print(f"Error: {e}")
