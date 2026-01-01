
import pandas as pd
import os

file_path = "../Cleaned_DMF_Works.xlsx"
try:
    df = pd.read_excel(file_path)
    print("Columns in file:", df.columns.tolist())
    # Print first row to see data sample
    print("First row sample:", df.iloc[0].to_dict())
except Exception as e:
    print(f"Error reading file: {e}")
