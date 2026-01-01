
import pandas as pd

def analyze_missing():
    file_path = "Cleaned_DMF_Works.xlsx"
    print(f"Reading {file_path}...")
    
    try:
        df = pd.read_excel(file_path)
    except Exception as e:
        print(f"Error reading Excel: {e}")
        return

    # Check headers
    print(f"Columns: {list(df.columns)}")
    
    # Identify missing coords
    # Assuming columns are 'Latitude' and 'Longitude' based on previous context
    # Adjust if necessary after seeing columns
    
    if 'Latitude' not in df.columns or 'Longitude' not in df.columns:
        print("Latitude/Longitude columns not found.")
        return

    # Filter missing
    missing = df[df['Latitude'].isna() | df['Longitude'].isna() | (df['Latitude'] == '')]
    
    total = len(df)
    missing_count = len(missing)
    print(f"Total Works: {total}")
    print(f"Works with Missing Coords: {missing_count}")
    
    if missing_count == 0:
        print("No missing coordinates found in file.")
        return

    # Group by Block and Panchayat
    # Normalize names
    if 'Block' in missing.columns and 'Panchayat' in missing.columns:
        summary = missing.groupby(['Block', 'Panchayat']).size().reset_index(name='Missing_to_count')
        summary = summary.sort_values(by='Missing_to_count', ascending=False)
        
        print("\n--- Top Missing Panchayats ---")
        print(summary.head(20).to_string(index=False))
        
        # Save detailed report
        missing_clean = missing[['Work Id Number', 'Work Name', 'Block', 'Panchayat']].copy()
        missing_clean.to_csv("works_missing_coords.csv", index=False)
        print("\nDetailed list saved to 'works_missing_coords.csv'")
        
        # Save summary
        summary.to_csv("missing_coords_summary.csv", index=False)
    else:
        print("Block/Panchayat columns missing. dumping top 5 rows.")
        print(missing.head().to_string())

if __name__ == "__main__":
    analyze_missing()
