
import pandas as pd
import requests
import json

def check_excel_headers():
    print("\n--- Checking Excel Headers ---")
    try:
        df = pd.read_excel("Cleaned_DMF_Works.xlsx", nrows=2)
        print("Columns found:", df.columns.tolist())
        # Check for Lat/Lng
        lat_col = next((c for c in df.columns if 'lat' in c.lower()), None)
        lng_col = next((c for c in df.columns if 'long' in c.lower()), None)
        print(f"Latitude Column: {lat_col}")
        print(f"Longitude Column: {lng_col}")
        
        if lat_col:
            print("Sample Lat:", df[lat_col].iloc[0])
    except Exception as e:
        print(f"Excel Error: {e}")

def check_prod_db():
    print("\n--- Checking Production DB ---")
    try:
        url = "https://dantewada-infra-monitor-production.up.railway.app/api/works/locations"
        resp = requests.get(url)
        data = resp.json()
        print(f"Total Works: {len(data)}")
        if len(data) > 0:
            print("Sample Work:", data[0])
    except Exception as e:
        print(f"Prod DB Error: {e}")

if __name__ == "__main__":
    check_excel_headers()
    check_prod_db()
