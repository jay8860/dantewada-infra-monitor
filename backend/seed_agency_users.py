import os
import sys

# Add the backend directory to sys.path so we can import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
import models
import auth

# Define the mapping based on the approved logic
AGENCY_MAPPING = {
    # Block-Level Officers (Janpads & Education)
    "CEO JANPAND PANCHAYAT DANTEWADA": "ceojanpaddnt",
    "CEO JANPAND PANCHAYAT GEEDAM": "ceojanpadgdm",
    "CEO JANPAND PANCHAYAT KATEKALYAN": "ceojanpadktk",
    "CEO JANPAND PANCHAYAT KUWAKONDA": "ceojanpadkua",
    "BEO/BRC Dantewada": "beodnt",
    "BEO/BRC GEEDAM": "beogdm",
    "BEO/BRC Katekalyan": "beoktk",
    "BEO/BRC KUWAKONDA ": "beokua",  # Handle trailing space if present in DB

    # Urban Local Bodies
    "CMO NAGAR PALIKA PARISHAD DANTEWADA": "cmonppdnt",
    "CMO NAGAR PALIKA PARISHAD KIRANDUL": "cmonppkir",
    "NAGAR PALIKA PARISHAD BHACHELI": "nppbhacheli",
    "Nagar Panchayat Barsur": "npbarsur",
    "Nagar Panchayat Geedam": "npgeedam",

    # Core Engineering & Infrastructure Departments
    "RES Dantewada": "resdnt",
    "PWD S.B. Div. Dantewada": "pwddnt",
    "EEPHEDDANTEWADA": "eephed",
    "E.E.W.R.D.Dantwada": "eewrd",
    "WATER RESOURCES DEPARTMENT JAGDALPUR": "wrdjagdalpur",
    "CGRRDA PIU-01 Dantewada": "cgrrda",
    "EE O and M CSPDCL Dantewada": "cspdcl",
    "CG S R EnergyDevlopment Agency": "creda",
    "E.E.P.W.D.(B/R) S.D.Sukma (CG)": "pwdsukma",
    "EEPWDBCD JAGDALPUR": "pwdjagdalpur",
    "Exe.Eng. PWD E/M Div.Jagdalpur": "pwdemjagdalpur",

    # Health, Women & Child, Social Welfare
    "CG Med.Ser.Corp.Limite": "cgmsc",
    "THE CHIEF MEDICAL & HEALTH OFFICER DANTEWADA": "cmhodnt",
    "Civil surgeon Dantewada": "csdnt",
    "MINISTRY OF WOMEN AND CHILD DEVELOPMENT DANTEWADA": "wcd",
    "Dep.Dir.SocialWelfareDantewada": "socialwel",

    # Agriculture & Allied
    "D.D.Agriculture Dantewada": "ddagri",
    "D.D.Agriculture Dantewada ": "ddagri", # Handle duplicate with space
    "Assistant Director Horticulture Dantewada": "adhorti",
    "Veterinary services Dantewada": "vetdnt",
    "FISHERIES DEPARTMENT DANTEWADA": "fisheries",
    "Krishi Vigyan Kendra Dantewada": "kvkdnt",

    # Education & Tribal
    "Dist.Edu.Officer Dantewada": "deodnt",
    "DPO SAMAGRA SHIKSHA D.S.B.DANT": "samagra",
    "Tribal Development Dantewada": "tribal",
    "Govt.Danteshwari PGCollege DNT": "pgcollege",

    # Administration & Others
    "JILA PAYNCHAYAT Dantewada": "zilapan",
    "Divisional Forest Officer Dantewada": "dfodnt",
    "SUPERINTEDENT OF POLICE DANTEWADA": "spdnt",
    "Jail Sup.Dist.Jail Dantewada ": "jaildnt",
    "Land Record Dantewada": "landrecord",
    "JILA KHEL ADHIKARI": "sportsdnt",
    "Livelihood coll.soci.Dantewada": "livelihood",
    "A.D.D.S.D.A.Dantewada": "addsda",

}

def seed_users():
    db = SessionLocal()
    try:
        # Get all distinct agencies directly from the Work table
        agencies_in_db = db.query(models.Work.agency_name)\
                           .filter(models.Work.agency_name != None)\
                           .distinct().all()
        agencies_in_db = [a[0] for a in agencies_in_db if a[0]]

        created_count = 0
        skipped_count = 0
        
        print(f"Starting to seed users for {len(agencies_in_db)} agencies...")

        # Build a mapping of username -> list of agency names
        user_to_agencies = {}
        
        for agency_name in agencies_in_db:
            username = AGENCY_MAPPING.get(agency_name)
            
            if not username and ("Jila nirman samiti" in agency_name or "Jilla nirman samiti" in agency_name):
                username = "jns"
                
            if not username:
                username = "".join([c for c in agency_name.lower() if c.isalnum()])[:12]
                print(f"Warning: Agency '{agency_name}' mapped to fallback username '{username}'")

            if username not in user_to_agencies:
                user_to_agencies[username] = []
            user_to_agencies[username].append(agency_name)

        # Now create one user per username with all their associated agencies
        for username, agency_list in user_to_agencies.items():
            password = f"{username}123"
            allowed_agencies_str = ",".join(agency_list)

            # Check if user already exists
            existing_user = db.query(models.User).filter(models.User.username == username).first()
            if existing_user:
                print(f"Skipping {username} - User already exists.")
                skipped_count += 1
                continue

            hashed_password = auth.get_password_hash(password)
            
            new_user = models.User(
                username=username,
                hashed_password=hashed_password,
                role="officer",
                is_active=True,
                allowed_agencies=allowed_agencies_str, 
                department=None, 
                allowed_blocks=None, 
                allowed_panchayats=None 
            )
            
            db.add(new_user)
            print(f"Created user: {username} for agencies: {allowed_agencies_str}")
            created_count += 1

        db.commit()
        print(f"\n--- Seeding Complete ---")
        print(f"Successfully created: {created_count} users")
        print(f"Skipped (already exist): {skipped_count} users")
        
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_users()
