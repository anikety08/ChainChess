#!/bin/bash

# ChainChess Build and Run Script
# This script rebuilds and runs the Docker container with your updated contract

set -e

echo "🛑 Stopping any running containers..."
docker compose down

echo "🔨 Rebuilding Docker image (this will compile your updated contract)..."
docker compose build --no-cache

echo "🚀 Starting ChainChess..."
docker compose up

