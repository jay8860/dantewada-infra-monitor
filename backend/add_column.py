import sqlite3
import os

DB_PATH = "dantewada_works.db"

def add_column():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE works ADD COLUMN admin_remarks TEXT")
        conn.commit()
        print("Successfully added 'admin_remarks' column to 'works' table.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e):
            print("Column 'admin_remarks' already exists.")
        else:
            print(f"Error adding column: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_column()
