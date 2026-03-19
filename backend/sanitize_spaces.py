import models, database
from sqlalchemy import func

def sanitize():
    db = database.SessionLocal()
    try:
        print("Starting data sanitization (replacing \\u00a0 with space)...")
        
        # 1. Sanitize Works table
        works = db.query(models.Work).filter(
            models.Work.agency_name.ilike(f'%{chr(160)}%') |
            models.Work.block.ilike(f'%{chr(160)}%') |
            models.Work.panchayat.ilike(f'%{chr(160)}%')
        ).all()
        
        print(f"Found {len(works)} works with non-breaking spaces.")
        for w in works:
            if w.agency_name: w.agency_name = w.agency_name.replace(chr(160), ' ')
            if w.block: w.block = w.block.replace(chr(160), ' ')
            if w.panchayat: w.panchayat = w.panchayat.replace(chr(160), ' ')

        # 2. Sanitize Users table
        users = db.query(models.User).filter(
            models.User.allowed_agencies.ilike(f'%{chr(160)}%') |
            models.User.allowed_blocks.ilike(f'%{chr(160)}%') |
            models.User.allowed_panchayats.ilike(f'%{chr(160)}%')
        ).all()
        
        print(f"Found {len(users)} users with non-breaking spaces.")
        for u in users:
            if u.allowed_agencies: u.allowed_agencies = u.allowed_agencies.replace(chr(160), ' ')
            if u.allowed_blocks: u.allowed_blocks = u.allowed_blocks.replace(chr(160), ' ')
            if u.allowed_panchayats: u.allowed_panchayats = u.allowed_panchayats.replace(chr(160), ' ')

        db.commit()
        print("Sanitization complete.")
    except Exception as e:
        db.rollback()
        print(f"Error during sanitization: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    sanitize()
