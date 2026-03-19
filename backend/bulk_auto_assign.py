import os
import sys
import datetime
from sqlalchemy.orm import Session
# Add parent directory to path to allow importing from database/models if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models

def bulk_auto_assign():
    db = SessionLocal()
    try:
        # 1. Get all users who have allowed_agencies defined (and are not admins)
        officers = db.query(models.User).filter(
            models.User.role == "officer",
            models.User.allowed_agencies.isnot(None),
            models.User.allowed_agencies != ""
        ).all()

        print(f"Found {len(officers)} officer accounts with designated agencies.")
        
        total_assigned = 0
        for officer in officers:
            # Get list of agencies for this officer
            agency_list = [a.strip() for a in officer.allowed_agencies.split(",") if a.strip()]
            if not agency_list:
                continue

            # 2. Find works belonging to these agencies, sanctioned_amount >= 10, and NOT Completed
            # Also exclude works already marked as Completed in their current_status
            works = db.query(models.Work).filter(
                models.Work.agency_name.in_(agency_list),
                models.Work.sanctioned_amount >= 10,
                models.Work.current_status != "Completed"
            ).all()

            if not works:
                continue

            print(f"Assigning {len(works)} works to '{officer.username}'...")

            deadline = datetime.datetime.utcnow() + datetime.timedelta(days=30)

            for work in works:
                # 3. Clear existing assignments for this work to ensure clean state
                db.query(models.WorkAssignment).filter(models.WorkAssignment.work_id == work.id).delete()

                # 4. Update Work table primary reference
                work.assigned_officer_id = officer.id
                work.assignment_status = "Assigned"
                work.inspection_deadline = deadline

                # 5. Create WorkAssignment entry
                new_assign = models.WorkAssignment(
                    work_id=work.id,
                    user_id=officer.id,
                    deadline=deadline
                )
                db.add(new_assign)
                total_assigned += 1

        db.commit()
        print(f"\nSUCCESS: Automated bulk assignment complete.")
        print(f"Total works assigned/updated: {total_assigned}")

    except Exception as e:
        db.rollback()
        print(f"CRITICAL ERROR during bulk assignment: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    # Ensure we point to the right data directory if needed
    if "DATA_DIR" not in os.environ:
        os.environ["DATA_DIR"] = "."
    bulk_auto_assign()
