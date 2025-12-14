import pandas as pd
import csv
import io
import os

# 1. Update Cache
data_csv = """Gram Panchayat,Block/Tehsil,Latitude,Longitude
CHITALANKA,Dantewada,18.91628,81.34383
GADHMIRI,Kuwakonda,18.76601,81.42969
CHITALUR,Dantewada,18.88466,81.38873
DHURLI,Dantewada,18.78529,81.28410
BADEKARLI,Geedam,18.97500,81.38900
DUGELI,Dantewada,18.69097,81.32327
EDPAL,Katekalyan,18.72736,81.54176
BADESUROKHI,Geedam,18.99271,81.27057
BODLI,Geedam,18.98000,81.14000
ATEPAL,Katekalyan,18.71000,81.53000"""

updates = {}
reader = csv.DictReader(io.StringIO(data_csv))
for row in reader:
    gp = row['Gram Panchayat'].strip().upper()
    block = row['Block/Tehsil'].strip()
    lat = row['Latitude']
    lon = row['Longitude']
    updates[(gp, block)] = (lat, lon)

rows = []
cache_file = 'gp_coords_cache.csv'
updated_count = 0

with open(cache_file, 'r') as f:
    reader = csv.reader(f)
    header = next(reader)
    rows.append(header)
    for line in reader:
        if len(line) < 3: continue
        key = line[0]
        # Deconstruct key
        if '_' in key:
            parts = key.split('_')
            key_gp = '_'.join(parts[:-1]) 
            key_block = parts[-1]
            
            # Try to match
            for (u_gp, u_block), (u_lat, u_lon) in updates.items():
                if key_gp.upper() == u_gp.upper() and key_block.upper() == u_block.upper():
                    line[1] = u_lat
                    line[2] = u_lon
                    updated_count += 1
                    print(f"Updated {key} -> {u_lat}, {u_lon}")
        rows.append(line)

with open(cache_file, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerows(rows)

print(f"Updated {updated_count} cache entries.")
