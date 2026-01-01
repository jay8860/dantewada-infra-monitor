
import pandas as pd
df = pd.read_excel("Cleaned_DMF_Works.xlsx")
# Count non-null Latitude AND Longitude
count = df.dropna(subset=['Latitude', 'Longitude']).shape[0]
print(f"Total rows: {len(df)}")
print(f"Rows with coords: {count}")
