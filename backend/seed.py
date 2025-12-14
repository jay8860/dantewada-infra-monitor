from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
import models
import auth

# Create tables if not exist (though main.py does this on startup, this script is for explicit seeding)
Base.metadata.create_all(bind=engine)

db = SessionLocal()

def create_user(username, password, role, department=None):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        hashed_password = auth.get_password_hash(password)
        db_user = models.User(username=username, hashed_password=hashed_password, role=role, department=department)
        db.add(db_user)
        print(f"Created user: {username}")
    else:
        print(f"User {username} already exists")

# Seed Data
create_user("admin", "admin123", "admin")
create_user("officer1", "officer123", "officer", "RD (Rural Development)")
create_user("officer2", "officer123", "officer", "Education")

db.commit()
db.close()
