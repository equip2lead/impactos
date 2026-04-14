#!/bin/bash
# Collect all source files into a deployment payload
find src lib public -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.json" -o -name "*.svg" \) 2>/dev/null | head -40
echo "---"
ls -la
