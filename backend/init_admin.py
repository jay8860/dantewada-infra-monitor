from database import SessionLocal, engine
import models, auth
from seed_agency_users import AGENCY_MAPPING

def create_admin_if_missing():
    db = SessionLocal()
    try:
        # 1. Create Admin
        if not db.query(models.User).filter(models.User.username == "admin").first():
            admin = models.User(
                username="admin",
                hashed_password=auth.get_password_hash("admin123"),
                role="admin"
            )
            db.add(admin)
            print("Admin user created (admin/admin123)")

        # 2. Create DMF Civil Engineers
        dmf_officers = ["DMFcivil1", "DMFcivil2", "DMFcivil3"]
        for username in dmf_officers:
            if not db.query(models.User).filter(models.User.username == username).first():
                new_user = models.User(
                    username=username,
                    hashed_password=auth.get_password_hash(f"{username}123"),
                    role="officer"
                )
                db.add(new_user)
                print(f"Created DMF user: {username}")

        # 3. Create Agency Users (from AGENCY_MAPPING)
        # We need to unique-ify the usernames from the mapping
        user_to_agencies = {}
        
        # Get all distinct agencies from DB if possible, or just the mapping keys
        # For a fresh DB, we'll use the mapping keys to ensure we have the basic set
        # But wait, the seed_agency_users.py logic is better as it uses actual Works in DB
        # However, if we want them to exist BEFORE any works are uploaded, we should use the mapping
        
        for agency_name, username in AGENCY_MAPPING.items():
            if username not in user_to_agencies:
                user_to_agencies[username] = []
            user_to_agencies[username].append(agency_name)
            
        # Add JNS explicitly as it has special logic in seed script
        if "jns" not in user_to_agencies:
             user_to_agencies["jns"] = ["Jila nirman samiti Dantewada(PWD)"] # Placeholder to ensure it's created

        for username, agencies in user_to_agencies.items():
            if not db.query(models.User).filter(models.User.username == username).first():
                new_user = models.User(
                    username=username,
                    hashed_password=auth.get_password_hash(f"{username}123"),
                    role="officer",
                    allowed_agencies=",".join(agencies)
                )
                db.add(new_user)
                print(f"Created Agency user: {username}")

        db.commit()
        print("Backend seeding check complete.")
    except Exception as e:
        db.rollback()
        print(f"Error in init_admin: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    create_admin_if_missing()
