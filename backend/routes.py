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
import image_utils
import pdf_generator

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
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": user.role,
        "id": user.id,
        "allowed_agencies": user.allowed_agencies
    }

@router.get("/users/me")
async def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username, 
        "role": current_user.role, 
        "department": current_user.department,
        "allowed_agencies": current_user.allowed_agencies
    }

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
    
    # Auto-Sync Fallback: If DB is empty, trigger a sync in the background
    sync_active_meta = db.query(models.SystemMetadata).filter(models.SystemMetadata.key == "sync_active").first()
    is_syncing = (sync_active_meta.value == "true") if sync_active_meta else False

    if total == 0 and not is_syncing:
        try:
            import ingester
            from main import scheduler, run_scheduled_sync
            from datetime import datetime
            scheduler.add_job(run_scheduled_sync, 'date', run_date=datetime.utcnow())
            is_syncing = True # Optimistic
        except Exception as e:
            print(f"Lazy Sync Trigger Failed: {e}")
    
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
        "last_sync": last_sync,
        "is_syncing": is_syncing
    }

@router.get("/works/filters")
async def get_work_filters(db: Session = Depends(get_db)):
    # Fetch all raw values and normalize in Python to ensure case-insensitivity
    def get_clean_values(column):
        raw = db.query(column).distinct().filter(column != None).all()
        # Deduplicate and strip, but preserve original casing (User Requirement: Exact Similarity)
        return sorted(list(set(str(r[0]).strip() for r in raw if r[0])))

    # Get earliest date for default filter
    from sqlalchemy import func
    min_date = db.query(func.min(models.Work.sanctioned_date)).scalar()
    # Format as YYYY-MM-DD string if it exists
    min_date_str = min_date.strftime('%Y-%m-%d') if min_date else None

    return {
        "blocks": get_clean_values(models.Work.block),
        "panchayats": get_clean_values(models.Work.panchayat),
        "departments": get_clean_values(models.Work.department),
        "agencies": get_clean_values(models.Work.agency_name),
        "statuses": get_clean_values(models.Work.current_status),
        "years": get_clean_values(models.Work.financial_year),
        "earliest_date": min_date_str
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
    
    # Target Agencies for Panchayat View (Exact strings from DB)
    PANCHAYAT_AGENCIES = [
        "CEO JANPAND PANCHAYAT KATEKALYAN",
        "CEO JANPAND PANCHAYAT DANTEWADA", 
        "CEO JANPAND PANCHAYAT GEEDAM",
        "CEO JANPAND PANCHAYAT KUWAKONDA"
    ]
    
    for r in results:
        # Panchayat View Logic
        if panchayat_view:
            if not r.agency_name:
                continue
            # Normalize for check
            agency = r.agency_name.strip().upper()
            if agency not in PANCHAYAT_AGENCIES:
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
def build_works_query(db, user, department, block, panchayat, status, agency, year, search, start_date=None, end_date=None):
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

    # Date Range Filter (AS Date)
    if start_date:
        query = query.filter(models.Work.sanctioned_date >= start_date)
    if end_date:
        # Include the entire end day? If date only, <= matches 00:00:00 of that day usually unless time present.
        # If input is YYYY-MM-DD, and DB is DateTime, <= YYYY-MM-DD 00:00:00 excludes the day.
        # Let's assume inclusive end date by adding one day or checking logic. 
        # But safest given input type might be date string:
        # If user sends YYYY-MM-DD, we should probably cast or ensure logic. 
        # For simplicity, assuming frontend and DB align, but let's be careful.
        # User requested "Today" so they likely mean >= Start AND <= End (Inclusive).
        query = query.filter(models.Work.sanctioned_date <= end_date)

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

    # --- PRIVACY FILTER ---
    if user and user.role != "admin":
        if user.allowed_agencies:
            agencies = [a.strip() for a in user.allowed_agencies.split(',') if a.strip()]
            if agencies:
                query = query.filter(models.Work.agency_name.in_(agencies))
        else:
            # Check for works explicitly assigned to this user via work_assignments table
            user_assignment_ids = db.query(models.WorkAssignment.work_id).filter(models.WorkAssignment.user_id == user.id).all()
            assigned_ids = [r[0] for r in user_assignment_ids]
            
            # Combine legacy assigned_officer_id and new WorkAssignment table
            from sqlalchemy import or_
            query = query.filter(
                or_(
                    models.Work.assigned_officer_id == user.id,
                    models.Work.id.in_(assigned_ids)
                )
            )

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
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    query = build_works_query(db, current_user, department, block, panchayat, status, agency, year, search, start_date, end_date)
        
    total_count = query.count()
    response.headers["X-Total-Count"] = str(total_count)
    
    # Sorting
    query = apply_sorting(query, sort_by, sort_order)
    
    works = query.offset(skip).limit(limit).all()
    
    # Fetch all photos for the works
    work_ids = [w.id for w in works]
    work_photos_map = {}
    latest_inspections = {}
    
    if work_ids:
        from sqlalchemy import func
        photos = db.query(models.WorkPhoto).filter(models.WorkPhoto.work_id.in_(work_ids)).order_by(models.WorkPhoto.uploaded_at.desc()).all()
        for p in photos:
            if p.work_id not in work_photos_map:
                work_photos_map[p.work_id] = []
            work_photos_map[p.work_id].append({
                "id": p.id,
                "image_path": p.image_path,
                "thumbnail_path": p.thumbnail_path,
                "caption": p.caption,
                "category": p.category,
                "uploaded_by": p.uploaded_by,
                "uploaded_at": p.uploaded_at.isoformat() if p.uploaded_at else None
            })
            
        subq_insp = db.query(
            models.Inspection.work_id,
            func.max(models.Inspection.id).label('latest_id')
        ).filter(models.Inspection.work_id.in_(work_ids)).group_by(models.Inspection.work_id).subquery()
        
        inspections = db.query(models.Inspection).join(
            subq_insp, models.Inspection.id == subq_insp.c.latest_id
        ).all()
        
        for i in inspections:
            latest_inspections[i.work_id] = {
                "remark": i.remarks,
                "date": i.inspection_date.isoformat() if i.inspection_date else None,
                "status": i.status_at_time
            }
            
    # Build response with thumbnail info
    result = []
    for w in works:
        work_dict = {
            "id": w.id,
            "work_code": w.work_code,
            "department": w.department,
            "financial_year": w.financial_year,
            "block": w.block,
            "panchayat": w.panchayat,
            "work_name": w.work_name,
            "work_name_brief": w.work_name_brief,
            "as_number": w.as_number,
            "sanctioned_amount": w.sanctioned_amount,
            "sanctioned_date": w.sanctioned_date.isoformat() if w.sanctioned_date else None,
            "total_released_amount": w.total_released_amount,
            "amount_pending": w.amount_pending,
            "agency_name": w.agency_name,
            "probable_completion_date": w.probable_completion_date.isoformat() if w.probable_completion_date else None,
            "current_status": w.current_status,
            "work_percentage": w.work_percentage,
            "remark": w.remark,
            "admin_remarks": w.admin_remarks,
            "inspection_date": w.inspection_date.isoformat() if w.inspection_date else None,
            "latitude": w.latitude,
            "longitude": w.longitude,
            "assigned_officer_id": w.assigned_officer_id,
            "assignment_status": w.assignment_status,
            "inspection_deadline": w.inspection_deadline.isoformat() if w.inspection_deadline else None,
            "assigned_officer": {"id": w.assigned_officer.id, "username": w.assigned_officer.username} if w.assigned_officer else None,
            "photos": work_photos_map.get(w.id, []),
            "last_updated": (w.inspection_date or w.sanctioned_date or datetime.utcnow()).isoformat() if True else None,
            "user_remark": latest_inspections.get(w.id, {}).get("remark"),
            "photo_upload_date": latest_inspections.get(w.id, {}).get("date"),
            "reported_status": latest_inspections.get(w.id, {}).get("status"),
        }
        result.append(work_dict)
    
    return result

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
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    try:
        query = build_works_query(db, current_user, department, block, panchayat, status, agency, year, search)
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

@router.get("/works/export/pdf")
async def export_works_pdf(
    department: Optional[List[str]] = Query(None), 
    block: Optional[List[str]] = Query(None),
    panchayat: Optional[List[str]] = Query(None),
    status: Optional[List[str]] = Query(None),
    agency: Optional[List[str]] = Query(None),
    year: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # 1. Fetch filtered works
        query = build_works_query(db, current_user, department, block, panchayat, status, agency, year, search)
        query = apply_sorting(query, sort_by, sort_order)
        # Limit to prevent massive un-renderable PDFs
        works = query.limit(500).all()
        
        # 2. Fetch all photos for the works
        work_ids = [w.id for w in works]
        work_photos_map = {}
        
        if work_ids:
            photos = db.query(models.WorkPhoto).filter(models.WorkPhoto.work_id.in_(work_ids)).order_by(models.WorkPhoto.uploaded_at.desc()).all()
            for p in photos:
                if p.work_id not in work_photos_map:
                    work_photos_map[p.work_id] = []
                work_photos_map[p.work_id].append({
                    "image_path": p.image_path,
                    "thumbnail_path": p.thumbnail_path,
                    "category": p.category,
                    "uploaded_at": p.uploaded_at.isoformat() if p.uploaded_at else None
                })
                
        # 3. Build dictionary format matching pdf_generator expectations
        result = []
        for w in works:
            result.append({
                "work_code": w.work_code,
                "work_name": w.work_name,
                "agency_name": w.agency_name,
                "block": f"{w.block} - {w.panchayat}",
                "sanctioned_amount": w.sanctioned_amount,
                "current_status": w.current_status,
                "admin_remarks": w.admin_remarks,
                "photos": work_photos_map.get(w.id, [])
            })
            
        # 4. Generate PDF buffer
        pdf_buffer = pdf_generator.build_visual_pdf(result)
        
        return Response(
            content=pdf_buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=Dantewada_Visual_Report.pdf"}
        )
    except Exception as e:
        print("PDF Export failed:", str(e))
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/inspection-status")
async def export_inspection_status(db: Session = Depends(get_db)):
    try:
        works = db.query(models.Work).all()
        work_ids = [w.id for w in works]
        
        from sqlalchemy import func
        photo_counts = dict(
            db.query(models.WorkPhoto.work_id, func.count(models.WorkPhoto.id))
            .filter(models.WorkPhoto.work_id.in_(work_ids))
            .group_by(models.WorkPhoto.work_id)
            .all()
        ) if work_ids else {}
        
        latest_inspections = dict(
            db.query(models.Inspection.work_id, func.max(models.Inspection.inspection_date))
            .filter(models.Inspection.work_id.in_(work_ids))
            .group_by(models.Inspection.work_id)
            .all()
        ) if work_ids else {}
        
        data = []
        for w in works:
            if not w.assigned_officer_id:
                continue 
            
            p_count = photo_counts.get(w.id, 0)
            inspection_date = latest_inspections.get(w.id)
            data.append({
                "Agency": w.agency_name or "Unknown",
                "Work Code": w.work_code,
                "Assigned User": w.assigned_officer.username if w.assigned_officer else "Unknown",
                "Has Photo": "Yes" if p_count > 0 else "No",
                "Photo Count": p_count,
                "Latest Inspection Date": inspection_date.isoformat() if inspection_date else None
            })
            
        df = pd.DataFrame(data)
        
        if df.empty:
            summary_df = pd.DataFrame(columns=["Agency", "Total Assigned", "With Photos", "Pending Photos"])
        else:
            summary = df.groupby("Agency").agg(
                Total_Assigned=("Work Code", "count"),
                With_Photos=("Has Photo", lambda x: (x == "Yes").sum()),
            ).reset_index()
            summary["Pending_Photos"] = summary["Total_Assigned"] - summary["With_Photos"]
            summary_df = summary.rename(columns={
                "Total_Assigned": "Total Assigned", 
                "With_Photos": "With Photos",
                "Pending_Photos": "Pending Photos"
            })
        
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            summary_df.to_excel(writer, index=False, sheet_name='Agency Summary')
            if not df.empty:
                df.to_excel(writer, index=False, sheet_name='Detailed Works')
            
            for sheetname in writer.sheets:
                worksheet = writer.sheets[sheetname]
                from openpyxl.styles import Alignment
                for row in worksheet.iter_rows():
                    for cell in row:
                        cell.alignment = Alignment(wrap_text=True, vertical='top')
                
                for column in worksheet.columns:
                    max_length = 0
                    column_letter = column[0].column_letter
                    for cell in column:
                        try:
                            if len(str(cell.value)) > max_length:
                                max_length = len(str(cell.value))
                        except: pass
                    worksheet.column_dimensions[column_letter].width = min(max_length + 2, 50)

        output.seek(0)
        
        return Response(
            content=output.getvalue(), 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": f"attachment; filename=inspection_status_report_{datetime.now().strftime('%Y%m%d')}.xlsx"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Report Export Failed: {str(e)}")


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
    photo_category: str = Form("During"),
    latitude: float = Form(...),
    longitude: float = Form(...),
    remarks: str = Form(""),
    inspector_name: str = Form(""),
    inspector_designation: str = Form(""),
    photos: List[UploadFile] = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    try:
        work = db.query(models.Work).filter(models.Work.id == work_id).first()
        if not work:
            raise HTTPException(status_code=404, detail="Work not found")
            
        # Create Inspection Record
        final_inspector_name = inspector_name if inspector_name else current_user.username
        
        new_inspection = models.Inspection(
            work_id=work_id,
            inspector_name=final_inspector_name,
            inspector_designation=inspector_designation,
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
            # Read file bytes for processing
            file_bytes = await photo.read()
            
            # Use image_utils for processing (compression, thumbnail, orientation)
            full_path, thumb_path = image_utils.process_upload(file_bytes, photo.filename)
            
            new_photo = models.WorkPhoto(
                work_id=work_id,
                image_path=full_path,
                thumbnail_path=thumb_path,
                caption=f"Status: {status} | Remarks: {remarks}",
                category=photo_category,
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
    officer_ids: List[int]
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
        
    # Clear existing assignments for this work to prevent duplicates or provide clean state
    db.query(models.WorkAssignment).filter(models.WorkAssignment.work_id == work_id).delete()

    deadline = None
    if payload.deadline_days:
        deadline = datetime.utcnow() + timedelta(days=payload.deadline_days)
        work.inspection_deadline = deadline
    else:
        work.inspection_deadline = None

    for o_id in payload.officer_ids:
        # Check if officer exists
        off = db.query(models.User).filter(models.User.id == o_id).first()
        if off:
            new_assign = models.WorkAssignment(
                work_id=work_id,
                user_id=o_id,
                deadline=deadline
            )
            db.add(new_assign)
    
    # Keep legacy field for backward compatibility or primary agency reference
    if payload.officer_ids:
        work.assigned_officer_id = payload.officer_ids[0]
        
    work.assignment_status = "Assigned"
    work.last_updated = datetime.utcnow()
    db.commit()
    
    return {"message": "Work assigned successfully"}
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
        
    if update.inspection_deadline is not None:
        work.inspection_deadline = update.inspection_deadline
    if update.admin_remarks is not None:
        work.admin_remarks = update.admin_remarks
        
    db.commit()
    return {"message": "Updated"}

class BulkAssignRequest(BaseModel):
    work_ids: List[int]
    officer_ids: List[int]
    deadline_days: Optional[int] = None

@router.put("/works/bulk-assign")
async def bulk_assign_works(
    req: BulkAssignRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    target_user = db.query(models.User).filter(models.User.id == req.officer_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    works = db.query(models.Work).filter(models.Work.id.in_(req.work_ids)).all()
    deadline = None
    if req.deadline_days:
        deadline = datetime.utcnow() + timedelta(days=req.deadline_days)
        
    for w in works:
        w.assigned_officer_id = target_user.id
        w.assignment_status = "Assigned"
        if deadline:
            w.inspection_deadline = deadline
            
    db.commit()
    return {"message": f"Successfully assigned {len(works)} works to {target_user.username}"}

# =============================================
# WORK PHOTOS - Upload, List, Delete
# =============================================

@router.post("/works/{work_id}/photos")
async def upload_work_photos(
    work_id: int,
    photos: List[UploadFile] = File(...),
    category: str = Form("During"),
    caption: str = Form(""),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Upload one or more photos for a work. Compresses server-side."""
    import image_utils
    
    work = db.query(models.Work).filter(models.Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    
    # Check access
    if not auth.check_work_access(current_user, work):
        raise HTTPException(status_code=403, detail="You don't have access to this work")
    
    results = []
    for photo in photos:
        try:
            file_bytes = await photo.read()
            full_path, thumb_path = image_utils.process_upload(file_bytes, photo.filename)
            
            new_photo = models.WorkPhoto(
                work_id=work_id,
                image_path=full_path,
                thumbnail_path=thumb_path,
                caption=caption,
                category=category,
                uploaded_by=current_user.username
            )
            db.add(new_photo)
            db.flush()
            
            results.append({
                "id": new_photo.id,
                "image_path": full_path,
                "thumbnail_path": thumb_path,
                "size_kb": round(image_utils.get_file_size_kb(full_path), 1)
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            results.append({"error": f"Failed to process {photo.filename}: {str(e)}"})
    
    db.commit()
    return {"message": f"Uploaded {len([r for r in results if 'id' in r])} photo(s)", "photos": results}


@router.get("/works/{work_id}/photos")
async def get_work_photos(
    work_id: int,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all photos for a work, optionally filtered by category."""
    work = db.query(models.Work).filter(models.Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    
    query = db.query(models.WorkPhoto).filter(models.WorkPhoto.work_id == work_id)
    if category:
        query = query.filter(models.WorkPhoto.category == category)
    
    photos = query.order_by(models.WorkPhoto.uploaded_at.desc()).all()
    
    # Build base URL for serving
    return [
        {
            "id": p.id,
            "image_path": p.image_path,
            "thumbnail_path": p.thumbnail_path,
            "caption": p.caption,
            "category": p.category,
            "uploaded_by": p.uploaded_by,
            "uploaded_at": p.uploaded_at.isoformat() if p.uploaded_at else None
        }
        for p in photos
    ]


class DeleteRequest(BaseModel):
    admin_password: str

@router.delete("/works/{work_id}/photos/{photo_id}")
async def delete_work_photo(
    work_id: int,
    photo_id: int,
    req: DeleteRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a photo. Admin only. Requires password."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete photos")
    
    # Verify password
    if not auth.verify_password(req.admin_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid admin password")

    photo = db.query(models.WorkPhoto).filter(
        models.WorkPhoto.id == photo_id,
        models.WorkPhoto.work_id == work_id
    ).first()
    
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    # Delete files from disk
    for path in [photo.image_path, photo.thumbnail_path]:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
    
    db.delete(photo)
    db.commit()
    return {"message": "Photo deleted"}

@router.delete("/works/{work_id}/inspections/{inspection_id}")
async def delete_inspection(
    work_id: int,
    inspection_id: int,
    req: DeleteRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an inspection. Admin only. Requires password."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete inspections")
    
    # Verify password
    if not auth.verify_password(req.admin_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid admin password")

    inspection = db.query(models.Inspection).filter(
        models.Inspection.id == inspection_id,
        models.Inspection.work_id == work_id
    ).first()
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    # Optionally delete photos associated only with this inspection? 
    # Current WorkPhoto model doesn't strictly have an inspection_id, 
    # but let's just delete the record for now per user request.
    
    db.delete(inspection)
    db.commit()
    return {"message": "Inspection deleted"}


# =============================================
# USER MANAGEMENT - CRUD
# =============================================

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "officer"
    department: Optional[str] = None
    allowed_blocks: Optional[str] = None
    allowed_panchayats: Optional[str] = None
    allowed_agencies: Optional[str] = None

class UserUpdate(BaseModel):
    role: Optional[str] = None
    department: Optional[str] = None
    allowed_blocks: Optional[str] = None
    allowed_panchayats: Optional[str] = None
    allowed_agencies: Optional[str] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = None


@router.get("/users")
async def list_users(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """List all users. Admin only."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage users")
    
    users = db.query(models.User).order_by(models.User.id).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "department": u.department,
            "is_active": u.is_active if hasattr(u, 'is_active') else True,
            "allowed_blocks": u.allowed_blocks if hasattr(u, 'allowed_blocks') else None,
            "allowed_panchayats": u.allowed_panchayats if hasattr(u, 'allowed_panchayats') else None,
            "allowed_agencies": u.allowed_agencies if hasattr(u, 'allowed_agencies') else None,
            "created_at": u.created_at.isoformat() if hasattr(u, 'created_at') and u.created_at else None
        }
        for u in users
    ]


@router.post("/users")
async def create_user(
    user_data: UserCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new user. Admin only."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create users")
    
    # Check if username exists
    existing = db.query(models.User).filter(models.User.username == user_data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    new_user = models.User(
        username=user_data.username,
        hashed_password=auth.get_password_hash(user_data.password),
        role=user_data.role,
        department=user_data.department,
        allowed_blocks=user_data.allowed_blocks,
        allowed_panchayats=user_data.allowed_panchayats,
        allowed_agencies=user_data.allowed_agencies
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": f"User '{user_data.username}' created", "id": new_user.id}


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Update a user's details. Admin only."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update users")
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_data.role is not None:
        user.role = user_data.role
    if user_data.department is not None:
        user.department = user_data.department
    if user_data.allowed_blocks is not None:
        user.allowed_blocks = user_data.allowed_blocks if user_data.allowed_blocks else None
    if user_data.allowed_panchayats is not None:
        user.allowed_panchayats = user_data.allowed_panchayats if user_data.allowed_panchayats else None
    if user_data.allowed_agencies is not None:
        user.allowed_agencies = user_data.allowed_agencies if user_data.allowed_agencies else None
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    if user_data.new_password:
        user.hashed_password = auth.get_password_hash(user_data.new_password)
    
    db.commit()
    return {"message": f"User '{user.username}' updated"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Deactivate a user (soft delete). Admin only."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete users")
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.username == "admin":
        raise HTTPException(status_code=400, detail="Cannot deactivate the admin account")
    
    user.is_active = False
    db.commit()
    return {"message": f"User '{user.username}' deactivated"}

