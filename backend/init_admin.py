from database import SessionLocal, engine
import models, auth

def create_admin_if_missing():
    # models.Base.metadata.create_all(bind=engine) # Handled in main.py startup now

    db = SessionLocal()
    # Create Admin
    if not db.query(models.User).filter(models.User.username == "admin").first():
        admin = models.User(
            username="admin",
            hashed_password=auth.get_password_hash("admin123"),
            role="admin"
        )
        db.add(admin)
        print("Admin user created (admin/admin123)")

    # Create Default Officer
    if not db.query(models.User).filter(models.User.username == "officer").first():
        officer = models.User(
            username="officer",
            hashed_password=auth.get_password_hash("officer123"),
            role="officer",
            department="Edu" # Example department
        )
        db.add(officer)
        print("Officer user created (officer/officer123)")
    
    db.commit() # Commit all
    print("Default users check complete.")
    db.close()

if __name__ == "__main__":
    create_admin_if_missing()
