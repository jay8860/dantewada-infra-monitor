from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
import models
import auth
import bcrypt

db = SessionLocal()

print("--- Checking Users ---")
users = db.query(models.User).all()
for u in users:
    print(f"User: {u.username}, Role: {u.role}")
    
    # Test password
    password = f"{u.username}123" # assuming pattern
    is_valid = auth.verify_password(password, u.hashed_password)
    print(f"  Password '{password}' valid? {is_valid}")

print("----------------------")
db.close()
