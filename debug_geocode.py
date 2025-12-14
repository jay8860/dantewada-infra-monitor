
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

import time

# Test BADEGADAM variations
gp = "BADEGADAM"
block = "KATEKALYAN"
url = "https://nominatim.openstreetmap.org/search"
headers = {'User-Agent': 'dantewada_debug_v2'}

queries = [
    f"{gp}, {block}, Dantewada, Chhattisgarh",
    f"{gp}, {block}",
    f"{gp} {block}",
    f"{gp.replace('_', ' ')}, {block}",
    "Badegadam, Katekalyan",
    "Bade Gadam, Katekalyan",
    "Badegadam, Katekalyan, Dantewada",
    "Badegadam",
    "Bade Gadam",
    "Badeguda",
    "Badegudem",
    "Bada Gadam",
    "Badegadam Panchayat",
    "Gram Panchayat Badegadam",
    "Badegadam, Bastar",
    "Badegadam, Chhattisgarh"
]

for q in queries:
    print(f"Querying: {q}")
    try:
        resp = requests.get(url, params={'q': q, 'format': 'json', 'limit': 1}, headers=headers, verify=False, timeout=5)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200 and resp.json():
            data = resp.json()[0]
            print(f"FOUND: {data['lat']}, {data['lon']} ({data['display_name']})")
        else:
            print("Not found")
    except Exception as e:
        print(f"Error: {e}")
    time.sleep(1.1)

# Original HIDPAL test
gp = "HIDPAL"
block = "GEEDAM"
url = "https://nominatim.openstreetmap.org/search"
headers = {'User-Agent': 'dantewada_debug_v1'}

queries = [
    f"{gp}, {block}, Dantewada, Chhattisgarh",
    f"{gp}, Dantewada",
    f"{gp}, Chhattisgarh",
    f"{gp} village, India"
]

for q in queries:
    print(f"Querying: {q}")
    try:
        resp = requests.get(url, params={'q': q, 'format': 'json', 'limit': 1}, headers=headers, verify=False, timeout=5)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200 and resp.json():
            data = resp.json()[0]
            print(f"FOUND: {data['lat']}, {data['lon']} ({data['display_name']})")
        else:
            print("Not found")
    except Exception as e:
        print(f"Error: {e}")
    time.sleep(1)
