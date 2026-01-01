
import pandas as pd
import requests
import io
import re

url = "https://docs.google.com/spreadsheets/d/10zFqsggEyiJ94sV0DojfC3VHeHplg2lh9_J_AEE9E3U/edit?usp=sharing"
sheet_name = "Work progress (Approved AS works)"

match = re.search(r'/d/([a-zA-Z0-9-_]+)', url)
sheet_id = match.group(1) if match else None
export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={sheet_name}"

try:
    response = requests.get(export_url)
    df = pd.read_csv(io.BytesIO(response.content))
    print(f"Columns: {df.columns.tolist()}")
except Exception as e:
    print(f"Error: {e}")
