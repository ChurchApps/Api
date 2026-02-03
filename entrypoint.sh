#!/bin/sh
# entrypoint.sh

# Exit immediately if a command fails
set -e

echo "Starting DB initialization..."
# Run the initdb script once
npm run initdb || echo "DB already initialized or failed, continuing..."

echo "Starting the API server..."
# Start the app
npm run start
