import requests
import os

def upload_to_production():
    print("\n--- Production Data Upload Tool ---")
    print("This script will upload your local Excel file to your live Railway server.")
    
    # 1. Ask for URL
    base_url = input("Enter your backend URL (e.g. https://web-production.up.railway.app): ").strip()
    if base_url.endswith("/"):
        base_url = base_url[:-1]
    
    if not base_url.startswith("http"):
        print("Invalid URL. Must start with http:// or https://")
        return

    login_url = f"{base_url}/api/token"
    upload_url = f"{base_url}/api/works/upload"

    # 2. Login
    print(f"\nLogging in to {login_url}...")
    try:
        auth_resp = requests.post(login_url, data={"username": "admin", "password": "admin123"}, timeout=10)
        if auth_resp.status_code != 200:
            print(f"❌ Login failed! Status: {auth_resp.status_code}")
            print(f"Response: {auth_resp.text}")
            print("\nDid the server just restart? It might take a moment.")
            return
        
        token = auth_resp.json()["access_token"]
        print("✅ Login successful.")

        # 3. Upload
        file_path = os.path.join(os.path.dirname(__file__), "../Dmf_works_Dec_2025_updated_with_coords.xlsx")
        file_path = os.path.abspath(file_path)
        
        if not os.path.exists(file_path):
            print(f"❌ File not found at {file_path}")
            return

        files = {"file": ("data.xlsx", open(file_path, "rb"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        headers = {"Authorization": f"Bearer {token}"}
        
        print(f"\nUploading file from: {file_path}...")
        print("This may take up to 30 seconds...")
        
        up_resp = requests.post(upload_url, headers=headers, files=files, timeout=60)
        
        if up_resp.status_code == 200:
            print(f"✅ Upload Successful!")
            print(f"Stats: {up_resp.text}")
            print("\nYour map should now be populated!")
        else:
            print(f"❌ Upload Failed. Status: {up_resp.status_code}")
            print(f"Response: {up_resp.text}")

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    upload_to_production()
