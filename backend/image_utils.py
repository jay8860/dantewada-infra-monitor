"""
Image processing utilities for work photo uploads.
Compresses and creates thumbnails using Pillow.
"""

import os
import uuid
from datetime import datetime
from PIL import Image, ExifTags
import io

UPLOAD_DIR = "uploads"
FULL_DIR = os.path.join(UPLOAD_DIR, "photos")
THUMB_DIR = os.path.join(UPLOAD_DIR, "thumbnails")

# Compression settings
MAX_WIDTH = 1920       # Max pixel width for full-size
THUMB_WIDTH = 400      # Thumbnail width
JPEG_QUALITY = 85      # Good quality, reasonable size


def ensure_dirs():
    """Create upload directories if they don't exist."""
    os.makedirs(FULL_DIR, exist_ok=True)
    os.makedirs(THUMB_DIR, exist_ok=True)


def fix_orientation(img: Image.Image) -> Image.Image:
    """Auto-rotate image based on EXIF orientation tag (from phone cameras)."""
    try:
        exif = img._getexif()
        if exif is None:
            return img
        
        orientation_key = None
        for key, val in ExifTags.TAGS.items():
            if val == 'Orientation':
                orientation_key = key
                break
        
        if orientation_key and orientation_key in exif:
            orientation = exif[orientation_key]
            if orientation == 3:
                img = img.rotate(180, expand=True)
            elif orientation == 6:
                img = img.rotate(270, expand=True)
            elif orientation == 8:
                img = img.rotate(90, expand=True)
    except (AttributeError, KeyError, IndexError):
        pass
    return img


def process_upload(file_bytes: bytes, original_filename: str) -> tuple[str, str]:
    """
    Process an uploaded image:
    1. Fix orientation from EXIF
    2. Resize to max 1920px width (maintain aspect ratio)
    3. Save as JPEG at 85% quality
    4. Generate 400px thumbnail
    
    Returns:
        (full_image_relative_path, thumbnail_relative_path)
    """
    ensure_dirs()
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    ext = "jpg"  # Always save as JPEG
    base_name = f"{timestamp}_{unique_id}"
    
    full_filename = f"{base_name}.{ext}"
    thumb_filename = f"{base_name}_thumb.{ext}"
    
    full_path = os.path.join(FULL_DIR, full_filename)
    thumb_path = os.path.join(THUMB_DIR, thumb_filename)
    
    # Open and process
    img = Image.open(io.BytesIO(file_bytes))
    
    # Convert to RGB if needed (handles PNG with alpha, etc.)
    if img.mode in ('RGBA', 'LA', 'P'):
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if 'A' in img.mode else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Fix phone camera orientation
    img = fix_orientation(img)
    
    # Resize full-size (only if larger than MAX_WIDTH)
    w, h = img.size
    if w > MAX_WIDTH:
        ratio = MAX_WIDTH / w
        new_h = int(h * ratio)
        img_full = img.resize((MAX_WIDTH, new_h), Image.LANCZOS)
    else:
        img_full = img.copy()
    
    # Save full-size
    img_full.save(full_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
    
    # Generate thumbnail
    ratio = THUMB_WIDTH / img.size[0]
    thumb_h = int(img.size[1] * ratio)
    img_thumb = img.resize((THUMB_WIDTH, thumb_h), Image.LANCZOS)
    img_thumb.save(thumb_path, "JPEG", quality=80, optimize=True)
    
    # Return relative paths (for serving via static mount)
    return full_path, thumb_path


def get_file_size_kb(path: str) -> float:
    """Get file size in KB."""
    if os.path.exists(path):
        return os.path.getsize(path) / 1024
    return 0
