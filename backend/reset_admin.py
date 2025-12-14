from database import SessionLocal
import models, auth

db = SessionLocal()
user = db.query(models.User).filter(models.User.username == "admin").first()
if user:
    user.hashed_password = auth.get_password_hash("admin123")
    user.role = "admin" # Ensure role
    db.commit()
    print("Admin password reset to admin123")
else:
    # Create if missing
    user = models.User(
        username="admin",
        hashed_password=auth.get_password_hash("admin123"),
        role="admin"
    )
    db.add(user)
    db.commit()
    print("Admin user created (admin/admin123)")

db.close()
