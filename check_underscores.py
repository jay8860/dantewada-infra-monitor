import pandas as pd

file_path = 'Dmf works Dec 2025 updated.xlsx'

try:
    df = pd.read_excel(file_path)
    gp_col = 'Gram Panchayat'
    
    if gp_col in df.columns:
        gps_with_underscore = df[df[gp_col].astype(str).str.contains('_', na=False)][gp_col].unique()
        print(f"GPs with underscore found: {len(gps_with_underscore)}")
        for gp in gps_with_underscore:
            print(f"- {gp}")
    else:
        print("Column not found.")

except Exception as e:
    print(f"Error: {e}")
