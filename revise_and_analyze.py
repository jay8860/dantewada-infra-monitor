import pandas as pd
import csv
import io
import os

# 1. Update Cache
data_csv = """Gram Panchayat,Block/Tehsil,Latitude,Longitude
AALNAR,Geedam,18.95625,81.26311
KESHAPUR,Dantewada,18.92751,81.27543
Benglur ,Katekalyan,18.79999,81.65394"""

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
                # Flexible matching for 'Benglur' vs 'BENGLUR' and 'Katekalyan' vs 'KATEKALYAN'
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

# 2. Analyze Missing Works (using the LAST generated excel)
# We need to re-run finalize_output.py to propagate the cache updates to the Excel FIRST, 
# but finalize_output.py takes time.
# Instead, let's analyze the CURRENT state of cache vs INPUT file to predict missing.

input_file = 'Dmf works Dec 2025 updated.xlsx'
print(f"Reading {input_file}...")
df = pd.read_excel(input_file)
total_works = len(df)

# Load Cache Map
cache_map = {}
with open(cache_file, 'r') as f:
    reader = csv.reader(f)
    next(reader)
    for line in reader:
        if len(line) < 3: continue
        # key -> has lat/lon?
        is_valid = bool(line[1] and line[2])
        cache_map[line[0]] = is_valid

# Check each work
missing_works_count = 0
missing_gp_counts = {}

for idx, row in df.iterrows():
    try:
        gp = str(row['Gram Panchayat']).strip() if pd.notna(row['Gram Panchayat']) else ""
        block = str(row['Block Name ']).strip() if pd.notna(row['Block Name ']) else ""
        
        # Approximate key construction from add_coordinates.py
        # It tried multiple keys. We just need to check if ANY valid key exists for this combo.
        # But simplify: The primary key was f"{gp}_{block}". 
        # Add_coordinates normalized spaces.
        
        # Let's search the cache for this GP/Block combo
        # We can't perfectly replicate the key gen without the function, 
        # but we can look for "GP_BLOCK" (upper).
        key_search = f"{gp.upper()}_{block.upper()}"
        
        # Check if this key exists and is valid in cache
        # Note: Cache keys might be slightly different, but let's try direct look up
        # If strict lookup fails, we assume it *might* be missing.
        
        # Actually, let's look at the mapping logic.
        # If cache has entry for key AND it has coords -> Good.
        # If cache has entry AND no coords -> Missing.
        # If cache has NO entry -> Weird (should have been attempted).
        
        if key_search in cache_map:
            if not cache_map[key_search]:
                missing_works_count += 1
                missing_gp_counts[key_search] = missing_gp_counts.get(key_search, 0) + 1
        else:
            # Maybe mismatch key?
            # Try to fuzzy match against cache keys?
            # Let's assume if not found, it's missing.
            # But wait, add_coordinates might have used a different key format.
            pass

    except Exception as e:
        pass

print(f"Total Works: {total_works}")
# This analysis is imperfect because of key matching.
# Better: Just run finalize_output.py (it's fast enough) and THEN analyze the Result Excel.
