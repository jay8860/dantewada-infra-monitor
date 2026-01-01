
import pandas as pd
import requests
import io
import re

url = "https://docs.google.com/spreadsheets/d/10zFqsggEyiJ94sV0DojfC3VHeHplg2lh9_J_AEE9E3U/edit?usp=sharing"
sheet_name = "Work progress (Approved AS works)"

# Extract ID
match = re.search(r'/d/([a-zA-Z0-9-_]+)', url)
sheet_id = match.group(1) if match else None

if not sheet_id:
    print("Invalid URL")
    exit()

export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={sheet_name}"
print(f"Export URL: {export_url}")

try:
    response = requests.get(export_url)
    response.raise_for_status()
    # Check if it returned HTML (login page) instead of CSV
    if "text/html" in response.headers.get("Content-Type", ""):
        print("Error: Received HTML. Likely need permissions or wrong sheet name.")
        print(response.text[:500])
    else:
        df = pd.read_csv(io.BytesIO(response.content))
        print("Success!")
        print(f"Columns: {df.columns.tolist()}")
        print(f"Row count: {len(df)}")
except Exception as e:
    print(f"Error: {e}")
