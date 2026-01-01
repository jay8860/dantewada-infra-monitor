
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from database import SessionLocal
import ingester
import logging

app = FastAPI(title="Dantewada Work Monitoring System API")

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Scheduler
scheduler = AsyncIOScheduler()

async def run_scheduled_sync():
    logger.info("Starting Scheduled Google Sheet Sync...")
    db = SessionLocal()
    try:
        result = ingester.sync_from_google_sheet(db, ingester.DEFAULT_SHEET_URL)
        logger.info(f"Scheduled Sync Completed: {result}")
    except Exception as e:
        logger.error(f"Scheduled Sync Failed: {e}")
    finally:
        db.close()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"]
)

# Create logic for serving uploaded static files (photos)
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.on_event("startup")
def startup():
    from database import engine, Base
    Base.metadata.create_all(bind=engine)
    # Auto-create admin if missing (Essential for ephemeral DBs like Railway SQLite)
    import init_admin
    init_admin.create_admin_if_missing()
    
    # Start Scheduler
    scheduler.add_job(run_scheduled_sync, 'interval', hours=24)
    scheduler.start()
    logger.info("Scheduler started (Sync every 24h).")

from routes import router
app.include_router(router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to Dantewada Work Monitoring System API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
