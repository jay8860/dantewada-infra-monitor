import sys
import os
# Change dir to backend so relative sqlite path works
os.chdir('backend')
sys.path.append('.')

from database import SessionLocal
import models
from sqlalchemy import func

# List of problematic Panchayats identified previously
PROBLEMATIC_PANCHAYATS = [
    "BADE BACHELI", "BADEBEDMA", "CHHINDNAR"
]

db = SessionLocal()
try:
    print(f"Checking AS Numbers for sample panchayats...")
    
    for p_name in PROBLEMATIC_PANCHAYATS:
        # Fetch works
        works = db.query(models.Work).filter(models.Work.panchayat.ilike(f"%{p_name}%")).limit(5).all()
        
        for w in works:
            print(f"ID: {w.id} | Name: {w.work_name[:30]}... | Work Code: '{w.work_code}' | AS Num: '{w.as_number}'")

finally:
    db.close()
