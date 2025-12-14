#!/bin/bash

# 1. Login and get token
RESPONSE=$(curl -s -X POST "http://localhost:8000/api/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=admin123")

echo "Login Response: $RESPONSE"

TOKEN=$(echo $RESPONSE | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')

if [ -z "$TOKEN" ]; then
  echo "Failed to get token"
  exit 1
fi

echo "Token: $TOKEN"

# 2. Upload File
# We need to point to the correct path of csv
CSV_PATH="../sample_works_v3.csv"

curl -X POST "http://localhost:8000/api/works/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$CSV_PATH"
