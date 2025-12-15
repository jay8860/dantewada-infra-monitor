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

    # Create Default Officers (1, 2, 3)
    officers = [
        {"username": "officer1", "dept": "Education"},
        {"username": "officer2", "dept": "Health"},
        {"username": "officer3", "dept": "Rural Dev"}
    ]
    
    for off in officers:
        if not db.query(models.User).filter(models.User.username == off["username"]).first():
            new_officer = models.User(
                username=off["username"],
                hashed_password=auth.get_password_hash("officer123"),
                role="officer",
                department=off["dept"]
            )
            db.add(new_officer)
            print(f"Created {off['username']}")
    
    db.commit() # Commit all
    print("Default users check complete.")
    db.close()

if __name__ == "__main__":
    create_admin_if_missing()
