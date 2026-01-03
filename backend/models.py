
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Text
from database import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import relationship
import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="officer") 
    department = Column(String, nullable=True)

class Work(Base):
    __tablename__ = "works"

    id = Column(Integer, primary_key=True, index=True)
    work_code = Column(String, unique=True, index=True) 
    
    department = Column(String, index=True, nullable=True) 
    financial_year = Column(String, index=True, nullable=True)
    block = Column(String, index=True, nullable=True)
    panchayat = Column(String, index=True, nullable=True)
    work_name = Column(Text, nullable=True)
    work_name_brief = Column(Text, nullable=True) # Added for Hindi Brief Name
    
    unique_id = Column(String, nullable=True)
    as_number = Column(String, nullable=True)
    sanctioned_amount = Column(Float, nullable=True)
    sanctioned_date = Column(DateTime, nullable=True)
    
    tender_date = Column(DateTime, nullable=True)
    evaluation_amount = Column(Float, nullable=True)
    agency_release_details = Column(Text, nullable=True)
    
    total_released_amount = Column(Float, nullable=True)
    amount_pending = Column(Float, nullable=True) 
    
    agency_name = Column(String, index=True, nullable=True)
    completion_timelimit_days = Column(Integer, nullable=True)
    probable_completion_date = Column(DateTime, nullable=True)
    
    current_status = Column(String, index=True, default="Not Started")
    work_percentage = Column(String, nullable=True)
    verified_on_ground = Column(String, nullable=True) 
    inspection_date = Column(DateTime, nullable=True)
    remark = Column(Text, nullable=True)
    admin_remarks = Column(Text, nullable=True) # New Field for Admin Notes
    csv_photo_info = Column(Text, nullable=True)

    # Coordinates
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Assignment Logic
    assigned_officer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assignment_status = Column(String, default="Pending") # Pending, Completed
    inspection_deadline = Column(DateTime, nullable=True) 
    assigned_officer = relationship("User")
    inspections = relationship("Inspection", back_populates="work")

class Inspection(Base):
    __tablename__ = "inspections"
    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id"))
    inspector_name = Column(String)
    status_at_time = Column(String)
    remarks = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    inspection_date = Column(DateTime, default=datetime.datetime.utcnow)
    
    work = relationship("Work", back_populates="inspections")
    photos = relationship("InspectionPhoto", back_populates="inspection")

class InspectionPhoto(Base):
    __tablename__ = "inspection_photos"
    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"))
    image_path = Column(String)
    
    inspection = relationship("Inspection", back_populates="photos")

# New Model for System-wide settings/metadata
class SystemMetadata(Base):
    __tablename__ = "system_metadata"
    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)
