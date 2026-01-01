
import pandas as pd
import json

def extract_coords():
    file_path = "Cleaned_DMF_Works.xlsx"
    df = pd.read_excel(file_path)
    
    # Normalize columns
    df.columns = df.columns.astype(str).str.strip()
    
    gp_coords = {}
    
    count = 0
    for idx, row in df.iterrows():
        lat = row.get('Latitude')
        lng = row.get('Longitude')
        gp = str(row.get('Panchayat') or '').strip()
        blk = str(row.get('Block') or '').strip()
        
        if pd.notna(lat) and pd.notna(lng) and gp and blk and gp.lower() != 'nan':
            key = f"{gp.upper()}_{blk.upper()}"
            if key not in gp_coords:
                gp_coords[key] = (float(lat), float(lng))
                count += 1
                
    print(f"Extracted {len(gp_coords)} GP locations.")
    
    with open("backend/gp_coordinates.json", "w") as f:
        json.dump(gp_coords, f)
        
if __name__ == "__main__":
    extract_coords()
