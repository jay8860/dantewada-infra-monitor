
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import logging
import sys
import traceback

# Setup Logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Dantewada Work Monitoring System API")

# Global Error Capture
STARTUP_ERROR = None

# CORS (Always apply)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"]
)

# Debug Endpoint - ALWAYS AVAILABLE
@app.get("/api/debug")
def debug_info():
    import glob
    return {
        "status": "Alive",
        "startup_error": STARTUP_ERROR,
        "cwd": os.getcwd(),
        "files": glob.glob("*"),
        "env_keys": list(os.environ.keys())
    }

@app.get("/")
def read_root():
    if STARTUP_ERROR:
        return {"status": "Critical Startup Error", "error": STARTUP_ERROR}
    return {"message": "Welcome to Dantewada Work Monitoring System API"}

@app.get("/api/health")
def health_check():
    if STARTUP_ERROR:
        return {"status": "error", "detail": STARTUP_ERROR}
    return {"status": "ok"}


# Try to Import Core Logic
try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from database import SessionLocal, engine, Base
    import ingester
    import init_admin
    from routes import router

    # Mount Uploads
    UPLOAD_DIR = "uploads"
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

    # Scheduler
    scheduler = AsyncIOScheduler()

    async def run_scheduled_sync():
        logger.info("Starting Scheduled Sync...")
        db = SessionLocal()
        try:
            ingester.sync_from_google_sheet(db, ingester.DEFAULT_SHEET_URL)
        except Exception as e:
            logger.error(f"Sync Failed: {e}")
        finally:
            db.close()

    @app.on_event("startup")
    def startup():
        try:
            Base.metadata.create_all(bind=engine)
            init_admin.create_admin_if_missing()
            scheduler.add_job(run_scheduled_sync, 'interval', hours=24)
            scheduler.start()
            logger.info("Startup Complete.")
        except Exception as e:
            logger.critical(f"Startup Event Error: {e}")

    # Include Router
    app.include_router(router, prefix="/api")

except Exception as e:
    STARTUP_ERROR = f"{str(e)}\n{traceback.format_exc()}"
    logger.critical(f"CRITICAL IMPORT ERROR: {STARTUP_ERROR}")
