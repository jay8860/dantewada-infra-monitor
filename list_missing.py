import pandas as pd
import csv

# Read cache
cache_file = 'gp_coords_cache.csv'
missing_gps = []

try:
    with open(cache_file, 'r') as f:
        reader = csv.reader(f)
        header = next(reader) # key, lat, lon, address
        for row in reader:
            if len(row) < 3: continue
            key = row[0]
            lat = row[1]
            lon = row[2]
            
            if not lat or not lon or lat == 'None':
                # Parse Key (GP_Block)
                parts = key.split('_')
                # Join back if GP had underscores, last part is usually block but let's just show the key or try to split
                # The key format in add_coordinates.py was f"{gp}_{block}"
                # But GP might have spaces replaced or not?
                # Let's just output the formatted "GP (Block)" string
                
                # Heuristic: split by last underscore
                if '_' in key:
                    gp = '_'.join(parts[:-1])
                    block = parts[-1]
                    missing_gps.append(f"{gp} ({block})")
                else:
                    missing_gps.append(key)

    print(f"Total Missing: {len(missing_gps)}")
    for gp in sorted(missing_gps):
        print(gp)

except Exception as e:
    print(f"Error: {e}")
