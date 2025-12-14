
import requests
import pandas as pd
from io import BytesIO

# The headers provided by the user
headers = [
    "YEAR", "SECTOR", "Work Name (in brief)", "work name", "Gram Panchayat", "Block Name", 
    "UNIQ ID", "Work Id Number", "AS Number", "AS Date", "UNIQUE ID", "Tender Date", 
    "AS Amount (in Rs)", "Evaluation  Amount (in Rs)", "Agencys Released Amount And Date", 
    "Total Released Amount", "Amount Pending as per AS", "Agency Name", 
    "Work Completion Timelimit as per AS (in days)", "Probable Date of Completion (संभावित पूर्णता तिथि)", 
    "Work Status", "Work %", "Photo with Date", "Work Verified on ground?", "Date of Inspection", "Remark"
]

# Sample Data
data = [{
    "YEAR": "2024-25",
    "SECTOR": "Education",
    "Work Name (in brief)": "School Bldg",
    "work name": "Construction of Primary School at Lohandiguda",
    "Gram Panchayat": "Lohandiguda",
    "Block Name": "Tokapal",
    "UNIQ ID": "EDU001",
    "Work Id Number": "WK-100",
    "AS Number": "AS-999",
    "AS Date": "01-04-2024",
    "UNIQUE ID": "EDU001",
    "Tender Date": "15-04-2024",
    "AS Amount (in Rs)": "500000",
    "Evaluation  Amount (in Rs)": "480000",
    "Agencys Released Amount And Date": "200000 on 01-05-2024",
    "Total Released Amount": "200000",
    "Amount Pending as per AS": "300000",
    "Agency Name": "ABC Constructions",
    "Work Completion Timelimit as per AS (in days)": "180",
    "Probable Date of Completion (संभावित पूर्णता तिथि)": "30-10-2024",
    "Work Status": "In Progress",
    "Work %": "40%",
    "Photo with Date": "http://img.url/photo.jpg 2024-05-01",
    "Work Verified on ground?": "Yes",
    "Date of Inspection": "2024-06-01",
    "Remark": "Going perfectly"
}]

df = pd.DataFrame(data, columns=headers)
csv_buffer = BytesIO()
df.to_csv(csv_buffer, index=False)
csv_buffer.seek(0)

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
    files = {"file": ("test_custom_format.csv", csv_buffer, "text/csv")}
    headers = {"Authorization": f"Bearer {token}"}
    
    up_resp = requests.post(upload_url, headers=headers, files=files)
    print(f"Upload Status: {up_resp.status_code}")
    print(f"Upload Response: {up_resp.text}")
    
    # 3. Verify
    verify_url = "http://localhost:8000/api/works?department=Education" 
    v_resp = requests.get(verify_url, headers=headers)
    works = v_resp.json()
    
    if len(works) > 0:
        w = works[0]
        print(f"Verified Work: {w['work_name']}")
        print(f"Sector mapped to Dept: {w['department']}") # Should be Education
        print(f"Photo Info: {w.get('csv_photo_info')}") # Should be present
        if w['department'] == 'Education' and w.get('csv_photo_info'):
            print("SUCCESS: Data mapped correctly.")
        else:
            print("FAILURE: Mapping issue.")
    else:
        print("FAILURE: No works found.")

except Exception as e:
    print(f"Error: {e}")
