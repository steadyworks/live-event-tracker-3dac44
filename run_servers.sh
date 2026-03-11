#!/bin/bash
set -e
# Backend
cd /app/backend
pip install -q -r requirements.txt 2>/dev/null || true
python main.py &

# Frontend
cd /app/frontend
npm install --silent
npm run dev &
