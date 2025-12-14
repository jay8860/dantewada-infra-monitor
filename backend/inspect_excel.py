
import pandas as pd

file_path = "../Dmf works Dec 2025 updated.xlsx"
try:
    df = pd.read_excel(file_path)
    print("Columns found:")
    for col in df.columns:
        print(f"'{col}'")
    
    print(f"\nTotal rows: {len(df)}")
    print(f"First row sample: {df.iloc[0].to_dict()}")
except Exception as e:
    print(f"Error reading excel: {e}")
