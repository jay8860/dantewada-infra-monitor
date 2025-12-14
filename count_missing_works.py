import pandas as pd
import collections

# Read Final Output
file_path = 'Dmf_works_Dec_2025_updated_with_coords.xlsx'
df = pd.read_excel(file_path)

total = len(df)
with_coords = df.dropna(subset=['latitude', 'longitude'])
missing = df[df['latitude'].isna() | df['longitude'].isna()]

print(f"Total Works: {total}")
print(f"Works with Coords: {len(with_coords)}")
print(f"Missing Coords: {len(missing)}")

# Group missing by GP (dropna=False to see NaNs)
missing_counts = missing.groupby(['Gram Panchayat', 'Block Name '], dropna=False).size().reset_index(name='count')
missing_counts = missing_counts.sort_values('count', ascending=False)

# Fill NaNs for display
missing_counts['Gram Panchayat'] = missing_counts['Gram Panchayat'].fillna('(Blank)')
missing_counts['Block Name '] = missing_counts['Block Name '].fillna('(Blank)')

print("\n--- Top Missing GPs ---")
print(missing_counts.head(50).to_string(index=False))

# Export full missing list to file for user
missing_counts.to_csv('missing_gps_report.csv', index=False)
