from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
import models, auth
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime
import shutil
import os
import pandas as pd
from io import BytesIO

router = APIRouter()

# --- Auth ---
@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}

@router.get("/users/me")
async def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return {"username": current_user.username, "role": current_user.role, "department": current_user.department}

# --- Works ---
# Helper to parse date
def parse_date(row, col_name):
    if col_name in row and pd.notna(row[col_name]):
        try:
            # Handle various formats? pandas usually good at this
            return pd.to_datetime(row[col_name], dayfirst=True).to_pydatetime() 
        except:
            return None
    return None

# Helper to clean currency/float
def parse_float(row, col_name):
    val = row.get(col_name)
    if pd.isna(val): return 0.0
    try:
        return float(str(val).replace(',', '').replace('₹', '').strip())
    except:
        return 0.0

@router.post("/works/upload")
async def upload_works(
    file: UploadFile = File(...), 
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admin can upload works")
        
        contents = await file.read()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(BytesIO(contents))
        elif file.filename.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Invalid file format")
            
        # Normalize columns: strip whitespace
        df.columns = df.columns.astype(str).str.strip()
        
        # 1. Fetch all existing work codes to minimize queries
        all_existing_codes = {res[0] for res in db.query(models.Work.work_code).all()}
        
        to_insert = []
        to_update = []
        
        # Track codes seen in this batch to handle duplicates within the file
        seen_in_batch = set()

        # Process DataFrame
        for _, row in df.iterrows():
             # Map "Work Id Number" or "work_code"
            work_code = str(row.get('Work Id Number') or row.get('work_code') or '')
            
            # Basic validation
            if not work_code or work_code.lower() == 'nan':
                 work_code = str(row.get('UNIQ ID') or row.get('UNIQUE ID') or '')
            
            if (not work_code or work_code.lower() == 'nan') and row.get('AS Number'):
                 as_num = str(row.get('AS Number'))
                 if as_num.endswith('.0'):
                     as_num = as_num[:-2]
                 work_code = as_num

            if not work_code or work_code.lower() == 'nan':
                continue

            if work_code.endswith('.0'):
                work_code = work_code[:-2]

            # Prevent duplicates within the same file (violates Unique constraint)
            if work_code in seen_in_batch:
                continue
            seen_in_batch.add(work_code)

            # Mapping Data
            data = {
               'work_code': work_code, # Required for ID
               'department': row.get('SECTOR') or row.get('Sector') or row.get('department'),
               'financial_year': str(row.get('YEAR') or row.get('financial_year') or ''),
               'block': row.get('Block Name') or row.get('block'),
               'panchayat': row.get('Gram Panchayat') or row.get('panchayat'),
               'work_name': row.get('work name') or row.get('work name ') or row.get('work_name'),
               'work_name_brief': row.get('Work Name (in brief)'),
               'unique_id': str(row.get('UNIQ ID') or row.get('UNIQUE ID') or ''),
               'as_number': str(row.get('AS Number') or ''),
               'sanctioned_amount': parse_float(row, 'AS Amount (in Rs)') if 'AS Amount (in Rs)' in row else parse_float(row, 'sanctioned_amount'),
               'sanctioned_date': parse_date(row, 'AS Date') if 'AS Date' in row else parse_date(row, 'sanctioned_date'),
               'tender_date': parse_date(row, 'Tender Date'),
               'evaluation_amount': parse_float(row, 'Evaluation  Amount (in Rs)'),
               'agency_release_details': row.get('Agencys Released Amount And Date'),
               'total_released_amount': parse_float(row, 'Total Released Amount'),
               'amount_pending': parse_float(row, 'Amount Pending as per AS'),
               'agency_name': row.get('Agency Name'),
               'completion_timelimit_days': int(pd.to_numeric(row.get('Work Completion Timelimit as per AS (in days)'), errors='coerce') or 0) if pd.notna(pd.to_numeric(row.get('Work Completion Timelimit as per AS (in days)'), errors='coerce')) else 0,
               'probable_completion_date': parse_date(row, 'Probable Date of Completion (संभावित पूर्णता तिथि)'),
               'current_status': row.get('Work Status') or row.get('current_status') or 'Not Started',
               'work_percentage': str(row.get('Work %') or ''),
               'verified_on_ground': row.get('Work Verified on ground?'),
               'inspection_date': parse_date(row, 'Date of Inspection'),
               'remark': row.get('Remark'),
               'csv_photo_info': str(row.get('Photo with Date') or ''), 
               'latitude': float(row.get('latitude')) if 'latitude' in row and pd.notna(row.get('latitude')) else None,
               'longitude': float(row.get('longitude')) if 'longitude' in row and pd.notna(row.get('longitude')) else None
            }

            if work_code in all_existing_codes:
                to_update.append(data)
            else:
                to_insert.append(data)
        
        # 2. Bulk Insert
        if to_insert:
            db.bulk_insert_mappings(models.Work, to_insert)
            
        # 3. Bulk Update (Optimization)
        # SQLAlchemy bulk_update_mappings requires Primary Key 'id' to be in the dict.
        # We only have 'work_code'.
        # Efficient Strategy: Fetch {work_code: id} mapping for all existing items.
        
        if to_update:
            code_to_id = {w.work_code: w.id for w in db.query(models.Work.id, models.Work.work_code).all()}
            
            final_updates = []
            for item in to_update:
                if item['work_code'] in code_to_id:
                    item['id'] = code_to_id[item['work_code']]
                    final_updates.append(item)
            
            if final_updates:
                 db.bulk_update_mappings(models.Work, final_updates)

        db.commit()
        return {"message": f"Successfully processed {len(df)} works (Inserted: {len(to_insert)}, Updated: {len(to_update)})"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/works")
async def get_works(
    department: Optional[str] = None, 
    block: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(models.Work)
    if department:
        query = query.filter(models.Work.department == department)
    if block:
        query = query.filter(models.Work.block == block)
    if block:
        query = query.filter(models.Work.block == block)
    return query.offset(skip).limit(limit).all()

@router.get("/works/{work_id}")
async def get_work(work_id: int, db: Session = Depends(get_db)):
    work = db.query(models.Work).options(joinedload(models.Work.photos)).filter(models.Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    return work

@router.post("/works/{work_id}/inspections")
async def create_inspection(
    work_id: int,
    status: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    remarks: str = Form(""),
    photos: List[UploadFile] = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    try:
        work = db.query(models.Work).filter(models.Work.id == work_id).first()
        if not work:
            raise HTTPException(status_code=404, detail="Work not found")
            
        # Create Inspection Record
        new_inspection = models.Inspection(
            work_id=work_id,
            inspector_name=current_user.username,
            status_at_time=status,
            remarks=remarks,
            latitude=latitude,
            longitude=longitude,
            inspection_date=datetime.utcnow()
        )
        db.add(new_inspection)
        db.flush() # Get ID
        
        # Save Photos
        for photo in photos:
            file_extension = photo.filename.split(".")[-1]
            filename = f"insp_{new_inspection.id}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{photo.filename}"
            os.makedirs("uploads", exist_ok=True)
            file_path = f"uploads/{filename}"
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(photo.file, buffer)
                
            new_photo = models.Photo(
                work_id=work_id,
                inspection_id=new_inspection.id,
                image_path=file_path,
                gps_lat=latitude,
                gps_long=longitude,
                uploaded_by=current_user.username
            )
            db.add(new_photo)
            
        # Update Work's latitude/longitude to reflect latest inspection location (useful for tracking)
        # BUT DO NOT update current_status automatically. Admin must approve.
        work.latitude = latitude
        work.longitude = longitude
        # Also update verified status? User said "Verified on ground?" - keeping this as it reflects field reality
        work.verified_on_ground = "Yes"
        # work.inspection_date = datetime.utcnow() # Maybe keep this? Or only on approval? 
        # Let's keep inspection_date as "last visited".
        work.inspection_date = datetime.utcnow()
        work.last_updated = datetime.utcnow()
        
        db.commit()
        return {"message": "Inspection submitted successfully"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Inspection failed: {str(e)}")

@router.get("/works/{work_id}/timeline")
async def get_work_timeline(
    work_id: int,
    db: Session = Depends(get_db)
):
    # Fetch inspections with photos
    # SQLAlchemy relationship handles fetching, we just serialize
    work = db.query(models.Work).filter(models.Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
        
    timeline = []
    for insp in work.inspections:
        timeline.append({
            "id": insp.id,
            "date": insp.inspection_date,
            "inspector": insp.inspector_name,
            "status": insp.status_at_time,
            "remarks": insp.remarks,
            "photos": [{"url": p.image_path} for p in insp.photos]
        })
    return timeline
