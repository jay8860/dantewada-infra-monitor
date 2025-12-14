import pandas as pd

file_path = 'Dmf_works_Dec_2025_updated_with_coords.xlsx'

try:
    df = pd.read_excel(file_path, engine='openpyxl')
    print("Checking for Badegadam...")
    # Badegadam might be in Gram Panchayat column
    matches = df[df['Gram Panchayat'].astype(str).str.contains('BADEGADAM', case=False, na=False)]
    
    if not matches.empty:
        print(f"Found {len(matches)} rows for Badegadam.")
        print(matches[['Gram Panchayat', 'latitude', 'longitude']].head())
    else:
        print("Badegadam NOT found in file.")

    # Check Badegudra
    matches2 = df[df['Gram Panchayat'].astype(str).str.contains('BADEGUDRA', case=False, na=False)]
    if not matches2.empty:
         print(f"Found {len(matches2)} rows for Badegudra.")
         print(matches2[['Gram Panchayat', 'latitude', 'longitude']].head())

except Exception as e:
    print(f"Error: {e}")
