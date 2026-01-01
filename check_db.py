
import sqlite3
import os

db_path = "backend/dantewada_works.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT count(*) FROM works WHERE latitude IS NOT NULL AND latitude != 0 AND longitude IS NOT NULL")
count = cursor.fetchone()[0]
print(f"Works with valid lat/lng in DB: {count}")
conn.close()
