
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import logging
import sys
import traceback
from datetime import datetime

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

@app.middleware("http")
async def catch_exceptions_middleware(request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        import traceback
        with open("/tmp/backend_error.log", "a") as f:
            f.write(f"\n\n--- ERROR AT {datetime.now()} ---\n")
            f.write(traceback.format_exc())
        raise e

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

@app.get("/api/debug/errors")
def get_errors():
    if os.path.exists("/tmp/backend_error.log"):
        with open("/tmp/backend_error.log", "r") as f:
            return {"log": f.read()}
    return {"message": "No error log found"}


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
    DATA_DIR = os.environ.get("DATA_DIR", ".")
    UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

    # Include Router (Priority over SPA catch-all)
    app.include_router(router, prefix="/api")

    # Mount frontend static files
    STATIC_DIR = os.path.join(os.getcwd(), "static")
    if os.path.exists(STATIC_DIR):
        # 1. Mount assets directory
        assets_path = os.path.join(STATIC_DIR, "assets")
        if os.path.exists(assets_path):
            app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

        from fastapi.responses import FileResponse

        # 2. Specific route for root index
        @app.get("/", include_in_schema=False)
        async def serve_index():
            return FileResponse(os.path.join(STATIC_DIR, "index.html"))

        # 3. Catch-all for everything else (SPA routing + Root assets)
        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str):
            # API & Uploads should have been handled by their respective mounts/routers
            if full_path.startswith("api/") or full_path.startswith("uploads/"):
                return {"error": "Not Found"}

            file_path = os.path.join(STATIC_DIR, full_path)
            if os.path.isfile(file_path):
                 return FileResponse(file_path)

            # --- PREVENT CRASH ---
            # If the path looks like a file (has an extension like .js, .css, .png, etc.)
            # and it wasn't found above, return a 404 instead of index.html.
            # This prevents the browser from trying to parse the login page as a script.
            if "." in full_path.split("/")[-1]:
                return {"error": f"File '{full_path}' not found"}

            # Otherwise, fallback to index.html for React Router
            idx_path = os.path.join(STATIC_DIR, "index.html")
            if os.path.exists(idx_path):
                return FileResponse(idx_path)

            return {"message": "Frontend not found, but API is alive"}

    # Scheduler
    scheduler = AsyncIOScheduler()

    async def run_scheduled_sync():
        logger.info("Starting Scheduled Sync...")
        db = SessionLocal()
        try:
            ingester.sync_from_google_sheet(db, ingester.DEFAULT_SHEET_URL)
            logger.info("Sync Complete.")
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


except Exception as e:
    STARTUP_ERROR = f"{str(e)}\n{traceback.format_exc()}"
    logger.critical(f"CRITICAL IMPORT ERROR: {STARTUP_ERROR}")
