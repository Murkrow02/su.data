#!/bin/bash
set -e

# Build dist/ with only what Firebase needs
rm -rf dist
mkdir -p dist/data/content dist/data/scores

# Dashboard files (flat, so index.html paths work from /)
cp -r dashboard/* dist/

# Only JSON/CSV data — skip media files
rsync -a --include="*/" --include="*.json" --include="*.csv" --exclude="*" \
  data/content/ dist/data/content/

cp data/scores/* dist/data/scores/

if [ -f data/topics.json ]; then
  cp data/topics.json dist/data/topics.json
fi

firebase deploy --only hosting
