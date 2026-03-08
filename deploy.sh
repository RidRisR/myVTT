#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "Building and starting containers..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
echo "Done! View logs: docker compose logs -f"
