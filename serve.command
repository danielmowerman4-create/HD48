#!/bin/bash
cd "$(dirname "$0")"
echo "HD48 dashboard → http://localhost:8048/"
python3 -m http.server 8048
