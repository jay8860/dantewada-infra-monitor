import pandas as pd

file_path = 'Dmf_works_Dec_2025_updated_with_coords.xlsx'

try:
    df = pd.read_excel(file_path)
    print("Columns:", df.columns.tolist())
    print(f"Total Rows: {len(df)}")
    
    if 'latitude' in df.columns and 'longitude' in df.columns:
        valid_coords = df.dropna(subset=['latitude', 'longitude'])
        print(f"Rows with valid coordinates: {len(valid_coords)}")
        print(f"Completion Rate: {len(valid_coords)/len(df)*100:.2f}%")
        print("\nSample rows with coordinates:")
        print(valid_coords[['Gram Panchayat', 'latitude', 'longitude']].head())
    else:
        print("ERROR: Latitude/Longitude columns missing!")

except Exception as e:
    print(f"Error reading file: {e}")
