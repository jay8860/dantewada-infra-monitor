# Deployment Guide: Dantewada Work Monitor

This guide will help you deploy your application to [Railway](https://railway.app/).
We will deploy two separate services:
1.  **Backend (Python/FastAPI)**
2.  **Frontend (React/Vite)**

## Prerequisites
1.  **GitHub Account**: Your code must be pushed to a GitHub repository.
2.  **Railway Account**: Login at [railway.app](https://railway.app/).

---

## Step 1: Push Code to GitHub
If you haven't already, push your project to a new GitHub repository.
Ensure your folder structure is like this:
```
Your-Repo/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── ...
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── ...
└── ...
```

---

## Step 2: Deploy Backend

1.  **New Project**: In Railway, click **+ New Project** -> **Deploy from GitHub repo**.
2.  **Select Repo**: Choose your repository.
3.  **Configure Service**:
    *   Railway usually detects the `backend` folder if it sees `requirements.txt`. If it detects the root, you might need to configure the **Root Directory**.
    *   Go to **Settings** -> **General** -> **Root Directory**: Set this to `/backend`.
    *   Railway will re-build.
4.  **Start Command**:
    *   Go to **Settings** -> **Deploy** -> **Start Command**.
    *   Set it to: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5.  **Generate Domain**:
    *   Go to **Settings** -> **Networking**.
    *   Click **Generate Domain**. You will get a URL like `web-production-1234.up.railway.app`.
    *   **Copy this URL**. You need it for the frontend.

> [!WARNING]
> **Data Persistence**: Since we are using SQLite (`dantewada_works.db`), your database will reset every time you deploy or restart. For a permanent solution, consider adding a Postgres database later.

---

## Step 3: Deploy Frontend

1.  **Add Service**: In the same Railway project, click **+ New** -> **GitHub Repo**.
2.  **Select Repo**: Choose the **same repository** again.
3.  **Configure Service**:
    *   Go to **Settings** -> **General** -> **Root Directory**: Set this to `/frontend`.
    *   Railway will detect it's a Node/Vite app.
4.  **Environment Variables**:
    *   Go to **Variables**.
    *   Add a new variable:
        *   **Name**: `VITE_API_URL`
        *   **Value**: `https://<YOUR-BACKEND-URL>/api` (Paste the backend URL you copied in Step 2, and add `/api` at the end).
        *   *Example*: `https://web-production-1234.up.railway.app/api`
5.  **Build Command** (Optional check):
    *   Railway defaults usually work (`npm install && npm run build`).
6.  **Generate Domain**:
    *   Go to **Settings** -> **Networking**.
    *   Click **Generate Domain**.
    *   This is your live website URL!

---

## Step 4: Final Checks

1.  Open your **Frontend URL**.
2.  Try logging in (`admin` / `admin123`).
    *   *Note: If login fails, you may need to re-upload data or reset the password via the backend console because the DB is fresh.*
3.  Check the Map.

### How to Upload Data on Production
Since your local DB is not uploaded to Railway:
1.  You will start with an empty or default database.
2.  Open your local terminal.
3.  In `backend/upload_geocoded.py`, change the URL:
    ```python
    # API_URL = "http://localhost:8000/api"
    API_URL = "https://<YOUR-BACKEND-URL>/api"
    ```
4.  Run the script: `python backend/upload_geocoded.py`.
5.  This will populate your production site with the data.
