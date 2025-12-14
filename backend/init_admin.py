
from database import SessionLocal, engine
import models, auth

models.Base.metadata.create_all(bind=engine)

db = SessionLocal()
if not db.query(models.User).filter(models.User.username == "admin").first():
    admin = models.User(
        username="admin",
        hashed_password=auth.get_password_hash("admin123"),
        role="admin"
    )
    db.add(admin)
    db.commit()
    print("Admin user created (admin/admin123)")
else:
    print("Admin user already exists")
db.close()
