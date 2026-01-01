import pandas as pd
import numpy as np
import requests
import time
import sys
import os
import urllib3
import re
from datetime import datetime

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

INPUT_FILE = '1_1_26 DMF works.xlsx'
OUTPUT_FILE = 'Cleaned_DMF_Works.xlsx'
CACHE_FILE = 'gp_coords_cache.csv'

def clean_amount(val):
    if pd.isna(val) or val == '' or str(val).strip() == '-':
        return 0.0
    try:
        # Remove commas, currency symbols
        val = str(val).replace(',', '').replace('₹', '').replace('Rs', '').strip()
        return float(val)
    except:
        return 0.0

def clean_date(val):
    if pd.isna(val) or val == '' or str(val).strip() == '-':
        return None
    
    val_str = str(val).strip()
    
    # Try different formats
    formats = [
        '%d/%m/%Y', '%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y', '%Y'
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(val_str, fmt)
            return dt.strftime('%d-%m-%Y')
        except ValueError:
            continue
            
    # Handle Year only case if it's an integer
    if isinstance(val, (int, float)):
         # Check if it looks like a year (e.g. 2024 or 2024.0)
         if 2000 <= int(val) <= 2100:
             return f"01-01-{int(val)}" # Returning Jan 1st of that year as fallback? Or just leave as string?
             # User requested DD-MM-YYYY.
    
    return val_str # Return original if parse failed, for manual review

def map_status(status):
    if pd.isna(status) or str(status).strip() == '':
        return "Unstarted"
    
    # Just strip whitespace, preserve original text as requested
    return str(status).strip()

def generate_work_id(row):
    if pd.notna(row['Work Id Number']) and str(row['Work Id Number']).strip() != '':
        return str(row['Work Id Number']).split('.')[0] # Remove decimal if any
    if pd.notna(row['UNIQ ID']) and str(row['UNIQ ID']).strip() != '':
        return str(row['UNIQ ID'])
    if pd.notna(row['AS Number']) and str(row['AS Number']).strip() != '':
        # Generate from AS Number
        return f"AS-{str(row['AS Number'])}"
    # Fallback to a hash or index-based ID? 
    return f"GEN-{row.name}"

def get_coordinates(df):
    print("Geocoding locations...")
    
    # Identify unique GP + Block combos
    unique_locs = df[['Panchayat', 'Block']].drop_duplicates().dropna()
    print(f"Found {len(unique_locs)} unique locations.")
    
    coords_map = {}
    
    # Load cache
    if os.path.exists(CACHE_FILE):
        try:
            cached = pd.read_csv(CACHE_FILE)
            coords_map = dict(zip(cached['location_key'], zip(cached['latitude'], cached['longitude'])))
            print(f"Loaded {len(coords_map)} cached coordinates.")
        except Exception as e:
            print(f"Cache error: {e}")

    results = []
    
    headers = {'User-Agent': 'dantewada_monitor_extract_v1'}
    
    manual_overrides = {
        'BADEGADAM_KATEKALYAN': (18.71118, 81.66386),
    }

    count = 0
    
    for idx, row in unique_locs.iterrows():
        gp = str(row['Panchayat']).strip()
        block = str(row['Block']).strip()
        
        if gp.lower() == 'nan' or not gp:
            continue
            
        key = f"{gp}_{block}"
        
        lat, lon = None, None
        
        if key in manual_overrides:
            lat, lon = manual_overrides[key]
        elif key in coords_map:
            lat, lon = coords_map[key]
        
        if lat is None:
            # Query
            queries = [
                f"{gp}, {block}, Dantewada, Chhattisgarh",
                f"{gp}, {block}",
                f"{gp}, Dantewada"
            ]
            
            for q in queries:
                try:
                    time.sleep(1.1)
                    resp = requests.get("https://nominatim.openstreetmap.org/search", 
                                      params={'q': q, 'format': 'json', 'limit': 1},
                                      headers=headers, verify=False, timeout=5)
                    if resp.status_code == 200 and resp.json():
                        data = resp.json()[0]
                        lat, lon = float(data['lat']), float(data['lon'])
                        print(f"Found: {key} -> {lat}, {lon}")
                        break
                except Exception as e:
                    print(f"Error querying {q}: {e}")
            
            if lat is None:
                print(f"Failed to find: {key}")
                
            # Update cache map
            coords_map[key] = (lat, lon)
            
            # Save to cache file incrementally
            count += 1
            if count % 5 == 0:
                # Re-dump generic cache
                cache_list = [{'location_key': k, 'latitude': v[0], 'longitude': v[1]} for k,v in coords_map.items()]
                pd.DataFrame(cache_list).to_csv(CACHE_FILE, index=False)
        
        results.append({'location_key': key, 'lat': lat, 'lon': lon})

    # Final cache save
    cache_list = [{'location_key': k, 'latitude': v[0], 'longitude': v[1]} for k,v in coords_map.items()]
    pd.DataFrame(cache_list).to_csv(CACHE_FILE, index=False)
    
    # Merge back
    # Create key in main df
    df['location_key'] = df['Panchayat'].astype(str).str.strip() + '_' + df['Block'].astype(str).str.strip()
    
    coords_df = pd.DataFrame(results)
    if not coords_df.empty:
        # We need to map the lat/lon back
        # Since 'results' only has unique, we can map using the coords_map directly or merge
        # Using map is faster
        df['Latitude'] = df['location_key'].map(lambda x: coords_map.get(x, (None, None))[0])
        df['Longitude'] = df['location_key'].map(lambda x: coords_map.get(x, (None, None))[1])
    else:
        df['Latitude'] = None
        df['Longitude'] = None
        
    df.drop(columns=['location_key'], inplace=True)
    return df

def main():
    print(f"Reading {INPUT_FILE}...")
    df = pd.read_excel(INPUT_FILE)
    
    # 1. Rename Columns
    rename_map = {
        "Work Id Number": "Work Id Number",
        "SECTOR": "Department",
        "Unnamed: 1": "Financial Year", 
        "Block Name ": "Block",
        "Gram Panchayat": "Panchayat",
        "work name ": "Work Name",
        "AS Amount (in Rs)": "Sanctioned Amount",
        " AS Date": "Sanctioned Date",
        "Work Status": "Work Status",
        "Agency Name": "Agency",
        "Total Released Amount ": "Released Amount",
        "Amount Pending as per AS": "Pending Amount",
        "Probable Date of Completion (संभावित पूर्णता तिथि) ": "Probable End Date",
        "Remark": "Remark",
        # Fallbacks/Extras
        "UNIQ ID": "UNIQ ID", # Temporary
        "AS Number": "AS Number", # Temporary
        "Unnamed: 35": "Alt_Remark"
    }
    
    # Select only columns we care about if they exist
    cols_to_keep = []
    for raw, new in rename_map.items():
        if raw in df.columns:
            cols_to_keep.append(raw)
        else:
            print(f"Warning: Column '{raw}' not found.")
            
    df = df[cols_to_keep].copy()
    df.rename(columns=rename_map, inplace=True)
    
    # 2. Logic & Cleaning
    print("Cleaning data...")
    
    # Financial Year Fill forward if needed? Or specific mapping logic?
    # Sample showed "2024-25" in Unnamed: 1. Let's assume it's correct.
    
    # Work ID
    df['Work Id Number'] = df.apply(generate_work_id, axis=1)
    
    # Amounts
    for col in ['Sanctioned Amount', 'Released Amount', 'Pending Amount']:
        if col in df.columns:
            df[col] = df[col].apply(clean_amount)
            
    # Dates
    for col in ['Sanctioned Date', 'Probable End Date']:
        if col in df.columns:
            df[col] = df[col].apply(clean_date)
            
    # Status
    if 'Work Status' in df.columns:
        df['Work Status'] = df['Work Status'].apply(map_status)
        
    # Remarks merge
    if 'Remark' in df.columns and 'Alt_Remark' in df.columns:
        df['Remark'] = df['Remark'].fillna(df['Alt_Remark'])
        df.drop(columns=['Alt_Remark'], inplace=True)
    elif 'Alt_Remark' in df.columns:
        df.rename(columns={'Alt_Remark': 'Remark'}, inplace=True)

    # 3. Geocoding
    df = get_coordinates(df)
    
    # 4. Final Formatting & Selection
    sub_columns = [
        "Work Id Number", "Department", "Financial Year", "Block", "Panchayat", 
        "Work Name", "Sanctioned Amount", "Sanctioned Date", "Work Status", 
        "Agency", "Latitude", "Longitude", "Released Amount", "Pending Amount", 
        "Probable End Date", "Remark"
    ]
    
    # Add any missing columns as empty
    for col in sub_columns:
        if col not in df.columns:
            df[col] = None
            
    final_df = df[sub_columns]
    
    print(f"Saving to {OUTPUT_FILE}...")
    final_df.to_excel(OUTPUT_FILE, index=False)
    print("Done!")

if __name__ == "__main__":
    main()
