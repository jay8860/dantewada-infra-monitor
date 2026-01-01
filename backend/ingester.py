
import pandas as pd
import models
from datetime import datetime
from sqlalchemy.orm import Session
import requests
import io
import re

DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/10zFqsggEyiJ94sV0DojfC3VHeHplg2lh9_J_AEE9E3U/edit?usp=sharing"
SHEET_TAB_NAME = "Work progress (Approved AS works)"
import time

# --- Helpers ---
def fetch_osm_coords(query):
    try:
        time.sleep(1.1)
        headers = {'User-Agent': 'dantewada_works_monitor_v1_sync'}
        url = "https://nominatim.openstreetmap.org/search"
        resp = requests.get(url, params={'q': query, 'format': 'json', 'limit': 1}, headers=headers, timeout=5)
        if resp.status_code == 200 and resp.json():
            return float(resp.json()[0]['lat']), float(resp.json()[0]['lon'])
    except Exception as e:
        print(f"OSM Error for {query}: {e}")
    return None, None

def parse_date(row, col_name):
    if col_name in row and pd.notna(row[col_name]):
        try:
            return pd.to_datetime(row[col_name], dayfirst=True).to_pydatetime() 
        except:
            return None
    return None

def parse_float(row, col_name):
    val = row.get(col_name)
    if pd.isna(val): return 0.0
    try:
        return float(str(val).replace(',', '').replace('₹', '').strip())
    except:
        return 0.0

def process_dataframe(df: pd.DataFrame, db: Session):
    """
    Process a DataFrame (from Excel or GSheet) and upsert into the DB.
    Returns a summary dict.
    """
    # Normalize columns
    df.columns = df.columns.astype(str).str.strip()
    
    # 1. Fetch existing codes and coordinates to preserve them if missing in update
    existing_works = db.query(models.Work.work_code, models.Work.latitude, models.Work.longitude, models.Work.panchayat, models.Work.block).all()
    # Robust Clean: Strip .0 from DB codes too just in case
    all_existing_codes = set()
    existing_coords = {}
    for w in existing_works:
        wc = str(w.work_code)
        if wc.endswith('.0'): wc = wc[:-2]
        all_existing_codes.add(wc)
        existing_coords[wc] = (w.latitude, w.longitude)
    
    # Build GP Cache from DB to avoid API calls
    # Map "GP_BLOCK" -> (lat, lng)
    gp_coords_cache = {}
    for w in existing_works:
        if w.latitude and w.longitude and w.panchayat and w.block:
            key = f"{str(w.panchayat).strip().upper()}_{str(w.block).strip().upper()}"
            gp_coords_cache[key] = (w.latitude, w.longitude)

    to_insert = []
    to_update = []
    seen_in_batch = set()
    
    errors = 0
    
    # Block Centers (Approximated)
    BLOCK_CENTERS = {
        'DANTEWADA': (18.8956, 81.3503),
        'GEEDAM': (18.9691, 81.3994),
        'KUWAKONDA': (18.7303, 81.2585),
        'KATEKALYAN': (18.8021, 81.5647),
        'BARSOOR': (19.1033, 81.3789)
    }

    for idx, row in df.iterrows():
        try:
            # --- 1. Identify Work Code ---
            work_code = str(row.get('Work Id Number') or row.get('work_code') or '')
            if not work_code or work_code.lower() == 'nan':
                 work_code = str(row.get('UNIQ ID') or row.get('UNIQUE ID') or '')
            
            if (not work_code or work_code.lower() == 'nan') and row.get('AS Number'):
                 as_num = str(row.get('AS Number'))
                 if as_num.endswith('.0'): as_num = as_num[:-2]
                 work_code = as_num

            if not work_code or work_code.lower() == 'nan':
                continue # Skip row if no ID

            if work_code.endswith('.0'):
                work_code = work_code[:-2]

            if work_code in seen_in_batch:
                continue
            seen_in_batch.add(work_code)

            # --- 2. Map Data (Robust to Column Variations) ---
            # Status Normalization
            status_val = row.get('Work Status') or row.get('current_status') or 'Not Started'
            if str(status_val).lower() == 'unstarted': status_val = 'Not Started'
            if str(status_val).lower() == 'prossece': status_val = 'In Progress' 

            # Coordinate Logic: New > Existing > None
            new_lat = float(row.get('Latitude')) if 'Latitude' in row and pd.notna(row.get('Latitude')) else (float(row.get('latitude')) if 'latitude' in row and pd.notna(row.get('latitude')) else None)
            new_lng = float(row.get('Longitude')) if 'Longitude' in row and pd.notna(row.get('Longitude')) else (float(row.get('longitude')) if 'longitude' in row and pd.notna(row.get('longitude')) else None)
            
            final_lat = new_lat
            final_lng = new_lng
            
            if (final_lat is None or final_lng is None) and work_code in existing_coords:
                 # Keep existing if new is missing
                 final_lat = existing_coords[work_code][0]
                 final_lng = existing_coords[work_code][1]

            # 3. Geocoding Fallback
            gp_name = str(row.get('Panchayat') or row.get('Gram Panchayat') or row.get('panchayat') or '').strip()
            blk_name = str(row.get('Block') or row.get('Block Name') or row.get('block') or '').strip()
            
            # New field for District/Block Level
            level_raw = row.get('District/Block level')
            level_type = str(level_raw).strip() if pd.notna(level_raw) else ''

            if final_lat is None or final_lng is None:
                # A. Try GP Cache (DB based)
                if gp_name and blk_name and gp_name.lower() != 'nan':
                    cache_key = f"{gp_name.upper()}_{blk_name.upper()}"
                    if cache_key in gp_coords_cache:
                        final_lat, final_lng = gp_coords_cache[cache_key]
                
                # B. Try Block Center (If GP missing or Cache miss, AND level implies Block/District)
                if (final_lat is None) and blk_name:
                    # Check if it's explicitly a Block/District level work OR simply missing GP
                    # Level column populated means Block Level. Empty means GP (as per user).
                    is_block_level = (bool(level_type) and level_type.lower() != 'nan') or (not gp_name) or (gp_name.lower() == 'nan')
                    
                    if is_block_level and blk_name.upper() in BLOCK_CENTERS:
                        final_lat, final_lng = BLOCK_CENTERS[blk_name.upper()]
                        # Ensure we flag this for the frontend Red Pin (by setting Panchayat special string?)
                        if not gp_name or gp_name.lower() == 'nan':
                            gp_name = "Block Level" 

            data = {
               'work_code': work_code, 
               'department': row.get('Department') or row.get('SECTOR') or row.get('Sector') or row.get('department'),
               'financial_year': str(row.get('Financial Year') or row.get('YEAR') or row.get('financial_year') or ''),
               'block': blk_name,
               'panchayat': gp_name,
               'work_name': row.get('Work Name') or row.get('work name') or row.get('work_name'),
               'work_name_brief': row.get('Work Name (in brief)'),
               'unique_id': str(row.get('UNIQ ID') or row.get('UNIQUE ID') or ''),
               'as_number': str(row.get('AS Number') or ''),
               
               'sanctioned_amount': parse_float(row, 'Sanctioned Amount') if 'Sanctioned Amount' in row else (parse_float(row, 'AS Amount (in Rs)') if 'AS Amount (in Rs)' in row else parse_float(row, 'sanctioned_amount')),
               'sanctioned_date': parse_date(row, 'Sanctioned Date') if 'Sanctioned Date' in row else (parse_date(row, 'AS Date') if 'AS Date' in row else parse_date(row, 'sanctioned_date')),
               
               'tender_date': parse_date(row, 'Tender Date'),
               'evaluation_amount': parse_float(row, 'Evaluation  Amount (in Rs)'),
               'agency_release_details': row.get('Agencys Released Amount And Date'),
               
               'total_released_amount': parse_float(row, 'Released Amount') if 'Released Amount' in row else parse_float(row, 'Total Released Amount'),
               'amount_pending': parse_float(row, 'Pending Amount') if 'Pending Amount' in row else parse_float(row, 'Amount Pending as per AS'),
               
               'agency_name': row.get('Agency') or row.get('Agency Name'),
               'completion_timelimit_days': int(pd.to_numeric(row.get('Work Completion Timelimit as per AS (in days)'), errors='coerce') if pd.notna(pd.to_numeric(row.get('Work Completion Timelimit as per AS (in days)'), errors='coerce')) else 0),
               'probable_completion_date': parse_date(row, 'Probable End Date') if 'Probable End Date' in row else parse_date(row, 'Probable Date of Completion (संभावित पूर्णता तिथि)'),
               
               'current_status': status_val,
               'work_percentage': str(row.get('Work %') or ''),
               'verified_on_ground': row.get('Work Verified on ground?'),
               'inspection_date': parse_date(row, 'Date of Inspection'),
               'remark': row.get('Remark'),
               'csv_photo_info': str(row.get('Photo with Date') or ''), 
            }
            
            # Non-Destructive Update: Only include coords if valid (either explicit or fallback)
            if final_lat is not None and final_lng is not None:
                data['latitude'] = final_lat
                data['longitude'] = final_lng

            if work_code in all_existing_codes:
                to_update.append(data)
            else:
                to_insert.append(data)
                
        except Exception as e:
            # "Ignore such things" - we skip the row but don't crash the sync
            print(f"Skipping row {idx} due to error: {e}")
            errors += 1
            continue

    # --- Database Operations ---
    if to_insert:
        db.bulk_insert_mappings(models.Work, to_insert)
        
    if to_update:
        # Fetch ID mapping for updates
        code_to_id = {w.work_code: w.id for w in db.query(models.Work.id, models.Work.work_code).all()}
        
        # Split into batches based on keys to ensure bulk_update works (SQLAlchemy needs uniform keys)
        updates_with_coords = []
        updates_without_coords = []
        
        for item in to_update:
            if item['work_code'] in code_to_id:
                item['id'] = code_to_id[item['work_code']]
                if 'latitude' in item:
                    updates_with_coords.append(item)
                else:
                    updates_without_coords.append(item)
        
        if updates_with_coords:
            db.bulk_update_mappings(models.Work, updates_with_coords)
        if updates_without_coords:
            db.bulk_update_mappings(models.Work, updates_without_coords)

    # --- Update Last Sync Time ---
    sync_meta = db.query(models.SystemMetadata).filter(models.SystemMetadata.key == "last_sync_time").first()
    # Use UTC with 'Z' suffix to ensure frontend parses as UTC
    now_iso = datetime.utcnow().isoformat() + 'Z'
    
    if not sync_meta:
        sync_meta = models.SystemMetadata(key="last_sync_time", value=now_iso)
        db.add(sync_meta)
    else:
        sync_meta.value = now_iso
        sync_meta.updated_at = datetime.utcnow()


    db.commit()
    
    return {
        "total_processed": len(df),
        "inserted": len(to_insert),
        "updated": len(to_update),
        "errors": errors
    }
    return {
        "total_processed": len(df),
        "inserted": len(to_insert),
        "updated": len(to_update),
        "errors": errors
    }

def sync_from_google_sheet(db: Session, sheet_url: str = DEFAULT_SHEET_URL) -> dict:
    """
    Fetches the Google Sheet as CSV and processes it.
    """
    # Extract ID
    match = re.search(r'/d/([a-zA-Z0-9-_]+)', sheet_url)
    sheet_id = match.group(1) if match else None
    
    if not sheet_id:
        raise ValueError("Invalid Google Sheet URL")

    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={SHEET_TAB_NAME}"
    
    try:
        response = requests.get(export_url, timeout=30)
        response.raise_for_status()
        
        # Check if login page returned
        if "text/html" in response.headers.get("Content-Type", ""):
             # Try simpler export URL if visualization API fails auth? No, usually public sheets work.
             # Or maybe the sheet name is wrong?
             raise ValueError("Google returned HTML (Login Page). Ensure Sheet is Public and Tab Name is correct.")

        df = pd.read_csv(io.BytesIO(response.content), on_bad_lines='skip')
        return process_dataframe(df, db)
        
    except Exception as e:
        print(f"Sync Logic Failed: {e}")
        raise e
