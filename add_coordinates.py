import pandas as pd
import requests
import time
import os
import urllib3
import sys

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Setup
file_path = 'Dmf works Dec 2025 updated.xlsx'
output_path = 'Dmf_works_Dec_2025_updated_with_coords.xlsx'
cache_file = 'gp_coords_cache.csv'

def get_coordinates():
    print("Reading Excel file...")
    # Force flush
    sys.stdout.flush()
    
    try:
        df = pd.read_excel(file_path)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
        return

    # Identify columns
    gp_col = 'Gram Panchayat'
    block_col = 'Block Name '

    if gp_col not in df.columns:
        print(f"Error: '{gp_col}' column not found.")
        return

    # Get unique locations
    unique_gps = df[[gp_col, block_col]].drop_duplicates().dropna()
    print(f"Found {len(unique_gps)} unique locations to geocode.")
    sys.stdout.flush()

    # Load cache if exists
    if os.path.exists(cache_file):
        print("Loading cache...")
        try:
            cached_coords = pd.read_csv(cache_file)
            coords_map = dict(zip(cached_coords['location_key'], zip(cached_coords['latitude'], cached_coords['longitude'])))
            print(f"Loaded {len(coords_map)} cached coordinates.")
        except Exception as e:
            print(f"Cache load error: {e}. Starting fresh.")
            coords_map = {}
    else:
        coords_map = {}

    # Manual Overrides for known difficult locations
    manual_overrides = {
        'BADEGADAM_KATEKALYAN': (18.71118, 81.66386),
        # Add others if found
    }

    results = []
    # Pre-populate results? NO. We will build results as we iterate unique_gps.
    # But we need to make sure we don't lose cached items for GPs that are NOT in unique_gps (unlikely if unique_gps derived from same file).
    # Assuming unique_gps covers everything relevant.

    headers = {
        'User-Agent': 'dantewada_works_monitor_v1_custom'
    }
    
    print("Starting geocoding...")
    sys.stdout.flush()
    
    count = 0
    start_time = time.time()
    
    for index, row in unique_gps.iterrows():
        # Strip whitespace!
        gp = str(row[gp_col]).strip()
        block = str(row[block_col]).strip()
        
        # Original keys were gp_block (with potential spaces inside gp if not stripped before?)
        # Let's use clean key now. 
        # CAUTION: If previous cache used dirty keys, we might mismatch.
        # But we deleted cache, so starting fresh is good.
        location_key = f"{gp}_{block}"
        
        # 1. Check Manual Overrides
        if location_key in manual_overrides:
            lat, lon = manual_overrides[location_key]
            results.append({'location_key': location_key, 'latitude': lat, 'longitude': lon})
            # Update cache map too so we don't query again if we rerun
            coords_map[location_key] = (lat, lon) 
            print(f"Manual Override: {location_key} -> {lat}, {lon}")
            continue

        # 2. Check if already in results (via cache map)
        if location_key in coords_map:
            cached_lat, cached_lon = coords_map[location_key]
            # If we have valid coordinates, use them and skip query
            if pd.notna(cached_lat) and pd.notna(cached_lon):
                results.append({'location_key': location_key, 'latitude': cached_lat, 'longitude': cached_lon})
                continue
            # Else: fall through to re-query

        queries = [
            f"{gp}, {block}",  # REQUESTED FORMAT: RAW "GP, BLOCK"
            f"{gp}, {block}, Dantewada",
            f"{gp.title()}, {block.title()}",
            f"{gp.title()}, {block.title()}, Dantewada, Chhattisgarh",
            f"{gp.title()}, Dantewada",
            f"{gp.title()}, Chhattisgarh"
        ]
        
        lat, lon = None, None
        
        for q in queries:
            try:
                # 1.1 second delay
                time.sleep(1.1) 
                
                url = "https://nominatim.openstreetmap.org/search"
                params = {
                    'q': q,
                    'format': 'json',
                    'limit': 1
                }
                
                response = requests.get(url, params=params, headers=headers, verify=False, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    if data:
                        lat = float(data[0]['lat'])
                        lon = float(data[0]['lon'])
                        print(f"Found: {q} -> {lat}, {lon}")
                        break
                    else:
                        pass # Try next query
                else:
                    print(f"Error {response.status_code} for {q}")
            except Exception as e:
                print(f"Exception for {q}: {e}")
        
        if lat is None:
             print(f"FAILED to find: {location_key}")
             sys.stdout.flush()

        # Update map and results
        coords_map[location_key] = (lat, lon)
        results.append({'location_key': location_key, 'latitude': lat, 'longitude': lon})
        
        # Incremental save every 10 items
        count += 1
        if count % 10 == 0:
            pd.DataFrame(results).to_csv(cache_file, index=False)
            sys.stdout.flush()

    # Final save of cache
    pd.DataFrame(results).to_csv(cache_file, index=False)

    # Prepare final DataFrame
    coords_df = pd.DataFrame(results)
    
    # We need to map these back to the main DF.
    # We must ensure we generate the same keys correctly.
    # Since we strip() above, we must clean the main DF columns too before key gen.
    df['location_key'] = df[gp_col].astype(str).str.strip() + '_' + df[block_col].astype(str).str.strip()
    
    print("Merging data...")
    final_df = df.merge(coords_df, on='location_key', how='left')
    final_df.drop(columns=['location_key'], inplace=True)
    
    print(f"Saving to {output_path}...")
    final_df.to_excel(output_path, index=False)
    print("Done!")

if __name__ == "__main__":
    get_coordinates()
