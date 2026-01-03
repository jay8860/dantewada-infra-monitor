from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Response, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from database import get_db
import models, auth
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime, timedelta
from pydantic import BaseModel
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

# --- Officers ---
@router.get("/officers")
async def get_officers(db: Session = Depends(get_db)):
    return db.query(models.User).filter(models.User.role == "officer").all()

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
        
        # Validate format
        if file.filename.endswith('.csv'):
            df = pd.read_csv(BytesIO(contents))
        elif file.filename.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Invalid file format")
            
        # Use Ingestion Logic
        import ingester
        result = ingester.process_dataframe(df, db)
        return {"message": f"Successfully processed {result['total_processed']} works (Inserted: {result['inserted']}, Updated: {result['updated']}, Errors: {result['errors']})"}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# --- Google Sheet Sync ---
@router.post("/works/sync-sheet")
async def sync_google_sheet(
    sheet_url: Optional[str] = Form(None),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Syncs data from a Google Sheet. 
    If sheet_url is not provided, uses the Default Main Sheet.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can sync data")

    try:
        import ingester
        target_url = sheet_url if sheet_url and sheet_url.strip() else ingester.DEFAULT_SHEET_URL
        
        result = ingester.sync_from_google_sheet(db, target_url)
        
        return {"message": f"Sync Complete. Processed {result['total_processed']} rows (Inserted: {result['inserted']}, Updated: {result['updated']})"}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@router.get("/works/stats")
async def get_work_stats(db: Session = Depends(get_db)):
    # Group by status
    from sqlalchemy import func
    stats_query = db.query(models.Work.current_status, func.count(models.Work.id)).filter(models.Work.current_status != None).group_by(models.Work.current_status).all()
    stats = {status: count for status, count in stats_query}
    
    total = db.query(models.Work).count()
    completed = stats.get('Completed', 0)
    cancelled = stats.get('Cancelled', 0) # Assumes 'Cancelled' is the exact string
    
    # User Request: Ongoing = Total - Completed - Cancelled (effectively "Active")
    in_progress = total - completed - cancelled
    
    # Last Sync Time
    last_sync_meta = db.query(models.SystemMetadata).filter(models.SystemMetadata.key == "last_sync_time").first()
    last_sync = last_sync_meta.value if last_sync_meta else None

    return {
        "total": total,
        "completed": stats.get('Completed', 0),
        "in_progress": stats.get('In Progress', 0),
        "not_started": stats.get('Not Started', 0),
        "cc_pending": stats.get('CC Not Come in DMF', 0),
        "cancelled": cancelled,
        "last_sync": last_sync
    }

@router.get("/works/filters")
async def get_work_filters(db: Session = Depends(get_db)):
    # Fetch all raw values and normalize in Python to ensure case-insensitivity
    def get_clean_values(column):
        raw = db.query(column).distinct().filter(column != None).all()
        # Deduplicate and strip, but preserve original casing (User Requirement: Exact Similarity)
        return sorted(list(set(str(r[0]).strip() for r in raw if r[0])))

    return {
        "blocks": get_clean_values(models.Work.block),
        "panchayats": get_clean_values(models.Work.panchayat),
        "departments": get_clean_values(models.Work.department),
        "agencies": get_clean_values(models.Work.agency_name),
        "statuses": get_clean_values(models.Work.current_status),
        "years": get_clean_values(models.Work.financial_year)
    }

@router.get("/works/summary/village")
async def get_village_summary(
    department: Optional[List[str]] = Query(None),
    year: Optional[List[str]] = Query(None),
    panchayat_view: bool = Query(False), # New Filter
    db: Session = Depends(get_db)
):
    # Base query
    query = db.query(
        models.Work.block,
        models.Work.panchayat,
        models.Work.current_status,
        models.Work.sanctioned_amount,
        models.Work.agency_name # Needed for filter
    )
    
    # Apply optional filtering
    if department:
        query = query.filter(models.Work.department.in_(department))
    if year:
        query = query.filter(models.Work.financial_year.in_(year))
        
    results = query.all()
    
    if not results:
        return []
        
    # Process with Pandas
    data = []
    for r in results:
        # Panchayat View Logic: ONLY show work if agency is "CEO Janpad Panchayat {Block}"
        if panchayat_view:
            target_agency = f"CEO Janpad Panchayat {str(r.block).strip()}"
            if not r.agency_name or r.agency_name.strip().lower() != target_agency.lower():
                continue

        data.append({
            "Block": r.block or "Unknown",
            "Panchayat": r.panchayat or "Unknown",
            "Status": r.current_status,
            "Amount": r.sanctioned_amount or 0.0
        })
        
    if not data:
        return [] # Return empty if filter removed all
        
    df = pd.DataFrame(data)
    
    # Helper to calculate stats
    grouped = df.groupby(['Block', 'Panchayat'])
    
    summary_list = []
    
    for (block, panchayat), group in grouped:
        # Total
        total_count = len(group)
        total_amount = group['Amount'].sum()
        
        # Completed
        completed = group[group['Status'] == 'Completed']
        completed_count = len(completed)
        completed_amount = completed['Amount'].sum()
        
        # In Progress
        in_progress = group[group['Status'] == 'In Progress']
        in_progress_count = len(in_progress)
        in_progress_amount = in_progress['Amount'].sum()
        
        # Not Started
        not_started = group[group['Status'] == 'Not Started'] 
        not_started_count = len(not_started)
        not_started_amount = not_started['Amount'].sum()

        # CC Not Come
        # Note: Check exact string match from user request "CC Not Come in DMF"
        # Based on routes.py line 140, usage is 'CC Not Come in DMF' or similar. 
        # Let's match roughly or exact. Providing exact from stats API code: 'CC Not Come in DMF'
        cc_pending = group[group['Status'] == 'CC Not Come in DMF']
        cc_pending_count = len(cc_pending)
        cc_pending_amount = cc_pending['Amount'].sum()

        
        summary_list.append({
            "block": block,
            "panchayat": panchayat,
            "total_works": int(total_count),
            "total_amount": float(round(total_amount, 2)),
            "completed_works": int(completed_count),
            "completed_amount": float(round(completed_amount, 2)),
            "progress_works": int(in_progress_count),
            "progress_amount": float(round(in_progress_amount, 2)),
            "not_started_works": int(not_started_count),
            "not_started_amount": float(round(not_started_amount, 2)),
            "cc_pending_works": int(cc_pending_count),
            "cc_pending_amount": float(round(cc_pending_amount, 2))
        })
        
    # Sort by Block then Panchayat
    summary_list.sort(key=lambda x: (x['block'], x['panchayat']))
    
    return summary_list

@router.get("/works/locations")
async def get_work_locations(
    department: Optional[List[str]] = Query(None), 
    block: Optional[List[str]] = Query(None),
    panchayat: Optional[List[str]] = Query(None),
    status: Optional[List[str]] = Query(None),
    agency: Optional[List[str]] = Query(None),
    year: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(
        models.Work.id, 
        models.Work.latitude, 
        models.Work.longitude, 
        models.Work.current_status,
        models.Work.work_name,
        models.Work.work_code,
        models.Work.department,
        models.Work.block,
        models.Work.panchayat,
        models.Work.assigned_officer_id,
        models.Work.remark # Added for coloring logic
    )
    
    # helper for list filtering
    def apply_list_filter(q, col, values):
        if not values: return q
        # Handle cases where value might be empty string
        clean_values = [str(v).strip().lower() for v in values if v]
        if not clean_values: return q
        # Use trim + lower for robust matching against sloppy data (e.g. "Dantewada " vs "Dantewada")
        # SQLite uses trim(), Postgres uses trim().
        return q.filter(func.trim(func.lower(col)).in_(clean_values))

    query = apply_list_filter(query, models.Work.department, department)
    query = apply_list_filter(query, models.Work.panchayat, panchayat)
    query = apply_list_filter(query, models.Work.financial_year, year)
    query = apply_list_filter(query, models.Work.agency_name, agency)
    query = apply_list_filter(query, models.Work.current_status, status)

    # Special Block Logic
    if block:
        clean_blocks = [b for b in block if b]
        if clean_blocks:
            # Check for special "District/Block Level Works" flag
            SPECIAL_FLAG = "District/Block Level Works"
            if SPECIAL_FLAG in clean_blocks:
                # Remove flag from standard block list
                std_blocks = [b for b in clean_blocks if b != SPECIAL_FLAG]
                
                from sqlalchemy import or_
                # Logic: (Block IN std_blocks) OR (Is District/Block Level Work)
                # District/Block Level Works are identified by Panchayat name
                block_cond = models.Work.block.in_(std_blocks) if std_blocks else None
                special_cond = or_(
                    models.Work.panchayat.ilike("Block Level%"),
                    models.Work.panchayat.ilike("District Level%")
                )
                
                if block_cond is not None:
                     query = query.filter(or_(block_cond, special_cond))
                else:
                     query = query.filter(special_cond)
            else:
                query = query.filter(models.Work.block.in_(clean_blocks))

    if search:

        search_term = f"%{search}%"
        from sqlalchemy import or_
        query = query.filter(or_(
            models.Work.work_name.ilike(search_term),
            models.Work.work_code.ilike(search_term)
        ))
        
    # Only return works with coordinates
    query = query.filter(models.Work.latitude != None, models.Work.longitude != None)
    
    results = query.all()
    
    # Convert to lightweight dict list
    return [
        {
            "id": r.id,
            "lat": r.latitude,
            "lng": r.longitude,
            "current_status": r.current_status, # Fixed key for frontend
            "remark": r.remark, # Added for color logic
            "title": r.work_name,
            "code": r.work_code,
            "dept": r.department,
            "block": r.block,
            "gp": r.panchayat,
            "assigned": True if r.assigned_officer_id else False
        }
        for r in results
    ]

# --- Filter Helper ---
def build_works_query(db, department, block, panchayat, status, agency, year, search):
    query = db.query(models.Work).options(joinedload(models.Work.assigned_officer))
    
    # helper for list filtering
    def apply_list_filter(q, col, values):
        if not values: return q
        clean_values = [str(v).strip() for v in values if v]
        if not clean_values: return q
        return q.filter(col.in_(clean_values))

    query = apply_list_filter(query, models.Work.department, department)
    query = apply_list_filter(query, models.Work.panchayat, panchayat)
    query = apply_list_filter(query, models.Work.financial_year, year)
    query = apply_list_filter(query, models.Work.agency_name, agency)
    query = apply_list_filter(query, models.Work.current_status, status)

    # Special Block Logic
    if block:
        clean_blocks = [b for b in block if b]
        if clean_blocks:
            # Check for special "District/Block Level Works" flag
            SPECIAL_FLAG = "District/Block Level Works"
            if SPECIAL_FLAG in clean_blocks:
                # Remove flag from standard block list
                std_blocks = [b for b in clean_blocks if b != SPECIAL_FLAG]
                
                from sqlalchemy import or_
                # Logic: (Block IN std_blocks) OR (Is District/Block Level Work)
                block_cond = models.Work.block.in_(std_blocks) if std_blocks else None
                special_cond = or_(
                    models.Work.panchayat.ilike("Block Level%"),
                    models.Work.panchayat.ilike("District Level%")
                )
                
                if block_cond is not None:
                     query = query.filter(or_(block_cond, special_cond))
                else:
                     query = query.filter(special_cond)
            else:
                query = query.filter(models.Work.block.in_(clean_blocks))

    if search:
        search_term = f"%{search}%"
        # Search in work_name or work_code
        from sqlalchemy import or_
        query = query.filter(or_(
            models.Work.work_name.ilike(search_term),
            models.Work.work_code.ilike(search_term)
        ))
    return query

# --- Sorting Helper ---
def apply_sorting(query, sort_by, sort_order):
    if not sort_by:
        return query
        
    valid_columns = {
        'work_name': models.Work.work_name,
        'department': models.Work.department,
        'block': models.Work.block,
        'sanctioned_amount': models.Work.sanctioned_amount,
        'sanctioned_date': models.Work.sanctioned_date,
        'current_status': models.Work.current_status,
        'agency_name': models.Work.agency_name,
        'financial_year': models.Work.financial_year,
        'total_released_amount': models.Work.total_released_amount,
        'amount_pending': models.Work.amount_pending,
        'probable_completion_date': models.Work.probable_completion_date
    }
    
    col = valid_columns.get(sort_by)
    if col:
        if sort_order == 'desc':
            query = query.order_by(col.desc())
        else:
            query = query.order_by(col.asc())
    return query

@router.get("/works")
async def get_works(
    response: Response,
    department: Optional[List[str]] = Query(None), 
    block: Optional[List[str]] = Query(None),
    panchayat: Optional[List[str]] = Query(None),
    status: Optional[List[str]] = Query(None),
    agency: Optional[List[str]] = Query(None),
    year: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = build_works_query(db, department, block, panchayat, status, agency, year, search)
        
    total_count = query.count()
    response.headers["X-Total-Count"] = str(total_count)
    
    # Sorting
    query = apply_sorting(query, sort_by, sort_order)
    
    return query.offset(skip).limit(limit).all()

@router.get("/works/export")
async def export_works(
    department: Optional[List[str]] = Query(None), 
    block: Optional[List[str]] = Query(None),
    panchayat: Optional[List[str]] = Query(None),
    status: Optional[List[str]] = Query(None),
    agency: Optional[List[str]] = Query(None),
    year: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    db: Session = Depends(get_db)
):
    try:
        query = build_works_query(db, department, block, panchayat, status, agency, year, search)
        query = apply_sorting(query, sort_by, sort_order)
        results = query.all()
        print(f"DEBUG: Export found {len(results)} rows")
        
        # Convert manually to avoid pandas overhead? No, pandas is safer for Excel
        data = []
        for r in results:
            data.append({
                "Work Code": r.work_code,
                "Work Name": r.work_name,
                "Department": r.department,
                "Type": r.financial_year, # Column 2 is Financial Year mostly
                "Location": r.panchayat, # Strict
                "Block": r.block,
                "Sanctioned Amount": r.sanctioned_amount,
                "Sanctioned Date": r.sanctioned_date,
                "Status": r.current_status,
                "Agency": r.agency_name,
                "Released": r.total_released_amount,
                "Pending": r.amount_pending,
                "Est End Date": r.probable_completion_date,
                "Remark": r.remark,
                "Assigned To": r.assigned_officer.username if r.assigned_officer else "Unassigned"
            })
        
        df = pd.DataFrame(data)
        
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Works')
            # Auto-wrap text
            worksheet = writer.sheets['Works']
            from openpyxl.styles import Alignment
            for row in worksheet.iter_rows():
                for cell in row:
                    cell.alignment = Alignment(wrap_text=True, vertical='top')
            
            # Adjust column widths
            for column in worksheet.columns:
                max_length = 0
                column_letter = column[0].column_letter
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except: pass
                adjusted_width = min(max_length + 2, 50) # Cap width at 50
                worksheet.column_dimensions[column_letter].width = adjusted_width

        output.seek(0)
        
        return Response(
            content=output.getvalue(), 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": f"attachment; filename=works_export_{datetime.now().strftime('%Y%m%d')}.xlsx"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Export Failed: {str(e)}")


@router.get("/works/{work_id}")
async def get_work(work_id: int, db: Session = Depends(get_db)):
    # Work does not have 'photos' relationship directly. Inspections have photos.
    work = db.query(models.Work).filter(models.Work.id == work_id).first()
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

class AssignRequest(BaseModel):
    officer_id: int
    deadline_days: Optional[int] = None

@router.post("/works/{work_id}/assign")
async def assign_work(
    work_id: int,
    payload: AssignRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can assign works")

    work = db.query(models.Work).filter(models.Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
        
    officer = db.query(models.User).filter(models.User.id == payload.officer_id, models.User.role == "officer").first()
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found")
        
    work.assigned_officer_id = payload.officer_id
    work.assignment_status = "Pending"
    
    if payload.deadline_days:
        work.inspection_deadline = datetime.utcnow() + timedelta(days=payload.deadline_days)
    else:
        work.inspection_deadline = None # Or default?
        
    work.last_updated = datetime.utcnow()
    db.commit()
    
    return {"message": f"Work assigned to {officer.username}"}
# ... existing code ...

from pydantic import BaseModel

class AdminUpdate(BaseModel):
    inspection_deadline: Optional[datetime] = None
    admin_remarks: Optional[str] = None

@router.put("/works/{work_id}/admin")
async def update_work_admin(
    work_id: int,
    update: AdminUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    work = db.query(models.Work).filter(models.Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
        
    # Only update if provided (handle nulls if user wants to clear? for now assume frontend sends current val or new val)
    # Actually, allow clearing by sending None? Pydantic Optional defaults to None if missing. 
    # But if user sends null explicitly? 
    # Let's trust the frontend sends what it wants to set.
    
    # Check if field is in update dict to distinguish between "not sent" and "sent as null"
    # But for simplicity:
    if update.inspection_deadline is not None:
        work.inspection_deadline = update.inspection_deadline
    if update.admin_remarks is not None:
        work.admin_remarks = update.admin_remarks
        
    db.commit()
    return {"message": "Updated"}
