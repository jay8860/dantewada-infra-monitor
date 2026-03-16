from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models

# CHANGE THIS IN PRODUCTION
SECRET_KEY = "supersecretkey_dev_only"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 3000 # Long expiry for prototype

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    # Ensure bytes
    if isinstance(hashed_password, str):
        hashed_password = hashed_password.encode('utf-8')
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password)

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    # Reject inactive users
    if hasattr(user, 'is_active') and not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    return user


def check_work_access(user, work) -> bool:
    """
    Check if a user has access to a specific work based on their scope.
    Admins have access to everything.
    Officers are scoped by department, allowed_blocks, allowed_panchayats, and allowed_agencies.
    """
    if user.role == "admin":
        return True
    
    # Check department
    if user.department and work.department:
        if user.department.strip().lower() != work.department.strip().lower():
            return False
    
    # Check block scope
    if user.allowed_blocks:
        allowed = [b.strip().lower() for b in user.allowed_blocks.split(",") if b.strip()]
        if allowed and work.block:
            if work.block.strip().lower() not in allowed:
                return False
    
    # Check panchayat scope
    if user.allowed_panchayats:
        allowed = [p.strip().lower() for p in user.allowed_panchayats.split(",") if p.strip()]
        if allowed and work.panchayat:
            if work.panchayat.strip().lower() not in allowed:
                return False
    
    # Check agency scope
    if hasattr(user, 'allowed_agencies') and user.allowed_agencies:
        allowed = [a.strip().lower() for a in user.allowed_agencies.split(",") if a.strip()]
        if allowed and work.agency_name:
            if work.agency_name.strip().lower() not in allowed:
                return False
    
    return True
