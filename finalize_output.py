import pandas as pd
import csv

# 1. Read Excel
input_file = "Dmf works Dec 2025 updated.xlsx"
print("Reading Excel...")
df = pd.read_excel(input_file, engine='openpyxl')

# 2. Read Cache
cache_file = "gp_coords_cache.csv"
print("Reading cache...")
cache = {}
with open(cache_file, 'r') as f:
    reader = csv.reader(f)
    try:
        header = next(reader)
    except StopIteration:
        header = []
        
    for row in reader:
        if len(row) < 3: continue
        key = row[0]
        lat = row[1]
        lon = row[2]
        if lat and lon:
            cache[key] = (float(lat), float(lon))

# 3. Merge
print("Merging...")
latitudes = []
longitudes = []
final_gps = []

# Block Level Coordinates (Hardcoded / From Cache)
BLOCK_COORDS = {
    'DANTEWADA': (18.8910, 81.3508), # Generic Dantewada
    'GEEDAM': (18.9748, 81.3938),   # GEEDAM_GEEDAM
    'KUWAKONDA': (18.7229, 81.4203), # KUWAKONDA_KUWAKONDA
    'KATEKALYAN': (18.7108, 81.6854) # KATEKALYAN_KATEKALYAN
}

for idx, row in df.iterrows():
    gp = str(row['Gram Panchayat']).strip() if pd.notna(row['Gram Panchayat']) else ""
    block = str(row['Block Name ']).strip() if pd.notna(row['Block Name ']) else ""
    
    lat = None
    lon = None
    final_gp_name = gp

    # Standard Cache Lookup
    if gp:
        # Try constructing keys (Same logic as add_coordinates potentially, or just UPPER_UPPER)
        # The cache has mixed keys, mostly UPPER_UPPER or UPPER_Title
        # We try a few combos
        keys_to_try = [
            f"{gp.upper()}_{block.upper()}",
            f"{gp.upper()}_{block}",
            f"{gp}_{block}"
        ]
        
        for k in keys_to_try:
            if k in cache:
                lat, lon = cache[k]
                break
    
    # Block Level Logic (If GP is blank OR lookup failed? User said blank GP works)
    if not gp:
        # Use Block Coords
        if block.upper() in BLOCK_COORDS:
            lat, lon = BLOCK_COORDS[block.upper()]
            final_gp_name = f"Block Level ({block})"

    latitudes.append(lat)
    longitudes.append(lon)
    final_gps.append(final_gp_name)

df['latitude'] = latitudes
df['longitude'] = longitudes
# We update the GP column so the Frontend sees "Block Level (Dantewada)" and filters key off it
df['Gram Panchayat'] = final_gps 

output_file = "Dmf_works_Dec_2025_updated_with_coords.xlsx"
print(f"Final Row Count: {len(df)}")
print(f"Saving to {output_file}...")
df.to_excel(output_file, index=False)
print("Done.")
