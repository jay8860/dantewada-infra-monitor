# Build stage for Frontend
FROM node:18-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
# Note: VITE_API_URL should be empty so it uses relative paths for the consolidated service
RUN VITE_API_URL= npm run build

# Final stage
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (sqlite, for volume check)
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy built frontend from stage 1
RUN mkdir -p /app/static
COPY --from=frontend-builder /app/frontend/dist /app/static/

# Create data directory for volume mount
RUN mkdir -p /app/data

# Environment variables
ENV DATA_DIR=/app/data
ENV PORT=8000

# Start command
# We use shell form to allow environment variable expansion (like $PORT)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
