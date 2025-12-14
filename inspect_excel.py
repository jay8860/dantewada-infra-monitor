import pandas as pd

file_path = '/Users/jayantnahata/Desktop/Gemini Anti Gravity/dantewada_work_monitoring/Dmf works Dec 2025 updated.xlsx'

try:
    df = pd.read_excel(file_path)
    print(f"Total Rows: {len(df)}")
    
    gp_col = 'Gram Panchayat'
    if gp_col in df.columns:
        unique_gps = df[gp_col].unique()
        print(f"Unique Gram Panchayats: {len(unique_gps)}")
        print("First 20 unique GPs:")
        print(unique_gps[:20])
    else:
        print(f"Column '{gp_col}' not found.")
except Exception as e:
    print(f"Error: {e}")
