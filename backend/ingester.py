
import pandas as pd
import models
from datetime import datetime
from sqlalchemy.orm import Session

# --- Helpers ---
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
    
    # 1. Fetch existing codes
    all_existing_codes = {res[0] for res in db.query(models.Work.work_code).all()}
    
    to_insert = []
    to_update = []
    seen_in_batch = set()
    
    errors = 0
    
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
            if str(status_val).lower() == 'prossece': status_val = 'In Progress' # Handle specific typo if needed, or stick to raw

            data = {
               'work_code': work_code, 
               'department': row.get('Department') or row.get('SECTOR') or row.get('Sector') or row.get('department'),
               'financial_year': str(row.get('Financial Year') or row.get('YEAR') or row.get('financial_year') or ''),
               'block': row.get('Block') or row.get('Block Name') or row.get('block'),
               'panchayat': row.get('Panchayat') or row.get('Gram Panchayat') or row.get('panchayat'),
               'work_name': row.get('Work Name') or row.get('work name') or row.get('work_name'),
               'work_name_brief': row.get('Work Name (in brief)'),
               'unique_id': str(row.get('UNIQ ID') or row.get('UNIQUE ID') or ''),
               'as_number': str(row.get('AS Number') or ''),
               
               # Amount Logic prioritizing clean headers
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
               
               # Coordinates
               'latitude': float(row.get('Latitude')) if 'Latitude' in row and pd.notna(row.get('Latitude')) else (float(row.get('latitude')) if 'latitude' in row and pd.notna(row.get('latitude')) else None),
               'longitude': float(row.get('Longitude')) if 'Longitude' in row and pd.notna(row.get('Longitude')) else (float(row.get('longitude')) if 'longitude' in row and pd.notna(row.get('longitude')) else None)
            }

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
        final_updates = []
        for item in to_update:
            if item['work_code'] in code_to_id:
                item['id'] = code_to_id[item['work_code']]
                final_updates.append(item)
        
        if final_updates:
            db.bulk_update_mappings(models.Work, final_updates)

    db.commit()
    
    return {
        "total_processed": len(df),
        "inserted": len(to_insert),
        "updated": len(to_update),
        "errors": errors
    }
