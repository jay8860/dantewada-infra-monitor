from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String) # "admin", "officer", "user"
    department = Column(String, nullable=True) # For officers

class Work(Base):
    __tablename__ = "works"

    id = Column(Integer, primary_key=True, index=True)
    work_code = Column(String, unique=True, index=True, nullable=True) # Unique identifier from CSV
    department = Column(String, index=True)
    financial_year = Column(String)
    block = Column(String, index=True)
    panchayat = Column(String)
    work_name = Column(String)
    sanctioned_amount = Column(Float)
    
    # Status
    current_status = Column(String, default="Not Started") # Not Started, In Progress, Completed
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)
    sanctioned_date = Column(DateTime, nullable=True) # AS Date
    
    # New Fields
    work_name_brief = Column(String, nullable=True)
    unique_id = Column(String, nullable=True)
    as_number = Column(String, nullable=True)
    tender_date = Column(DateTime, nullable=True)
    evaluation_amount = Column(Float, default=0.0)
    agency_release_details = Column(String, nullable=True)
    total_released_amount = Column(Float, default=0.0)
    amount_pending = Column(Float, default=0.0)
    agency_name = Column(String, nullable=True)
    completion_timelimit_days = Column(Integer, nullable=True) # in days
    probable_completion_date = Column(DateTime, nullable=True)
    work_percentage = Column(String, nullable=True) # e.g. "50%" or "50"
    verified_on_ground = Column(String, nullable=True) # Yes/No
    inspection_date = Column(DateTime, nullable=True)
    remark = Column(String, nullable=True)
    csv_photo_info = Column(String, nullable=True) # From "Photo with Date"

    # Location (Sanctioned location, might differ from actual)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    photos = relationship("Photo", back_populates="work")

class Photo(Base):
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id"))
    image_path = Column(String)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    
    # GPS coords from the photo/upload
    gps_lat = Column(Float)
    gps_long = Column(Float)
    
    uploaded_by = Column(String) # Username
    
    work = relationship("Work", back_populates="photos")
