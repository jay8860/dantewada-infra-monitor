import pandas as pd
import os

file_path = 'Dmf works Dec 2025 updated.xlsx'
output_path = 'Dmf_works_Dec_2025_updated_with_coords_PARTIAL.xlsx'
cache_file = 'gp_coords_cache.csv'

def create_partial():
    print("Reading Excel...")
    df = pd.read_excel(file_path)
    
    if os.path.exists(cache_file):
        print("Reading cache...")
        coords_df = pd.read_csv(cache_file)
        
        print("Merging...")
        
        # Manual Overrides applied here too for immediate result
        manual_overrides = {
            'BADEGADAM_KATEKALYAN': (18.71118, 81.66386)
        }
        manual_df = pd.DataFrame(
            [{'location_key': k, 'latitude': v[0], 'longitude': v[1]} for k, v in manual_overrides.items()]
        )
        # Concatenate manual to coords_df (prefer manual if dupe)
        # Actually simplest is to append and deduplicate keeping last
        coords_df = pd.concat([coords_df, manual_df], ignore_index=True)
        # drop duplicates on key, keeping LAST (manual)
        coords_df.drop_duplicates(subset=['location_key'], keep='last', inplace=True)

        # Recreate keys in df
        # Identify columns
        gp_col = 'Gram Panchayat'
        block_col = 'Block Name '
        
        df['location_key'] = df[gp_col].astype(str).str.strip() + '_' + df[block_col].astype(str).str.strip()
        
        final_df = df.merge(coords_df, on='location_key', how='left')
        final_df.drop(columns=['location_key'], inplace=True)
        
        print(f"Saving to {output_path}...")
        final_df.to_excel(output_path, index=False)
        print("Done.")
    else:
        print("No cache found.")

if __name__ == "__main__":
    create_partial()
