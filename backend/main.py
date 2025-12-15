from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(title="Dantewada Work Monitoring System API")

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

from routes import router
app.include_router(router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to Dantewada Work Monitoring System API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
