# Docker Build & Run Guide

## Quick Start

### 1. Stop any running containers
```bash
docker compose down
```

### 2. Rebuild the Docker image (this compiles your updated contract)
```bash
docker compose build --no-cache
```

Or if you want to force a complete rebuild:
```bash
docker compose build --pull --no-cache
```

### 3. Start the application
```bash
docker compose up
```

Or to run in detached mode (background):
```bash
docker compose up -d
```

### 4. View logs
```bash
docker compose logs -f
```

### 5. Access the application
- **Web App**: http://localhost:5173
- **GraphQL Service**: http://localhost:8081
- **Faucet**: http://localhost:8080

## Complete Rebuild (Recommended after contract changes)

```bash
# Stop and remove containers, volumes, and images
docker compose down -v

# Remove the image to force rebuild
docker rmi chainchess-main-app 2>/dev/null || true

# Rebuild from scratch
docker compose build --no-cache

# Start everything
docker compose up
```

## What Happens During Build

1. **Rust Contract Compilation**: The contract is compiled to WASM
2. **Service Compilation**: The GraphQL service is built
3. **Frontend Dependencies**: Node modules are installed
4. **Linera Tools**: Linera service and storage service are installed

## What Happens During Run

1. **Linera Localnet**: Starts a local blockchain network
2. **Faucet**: Provides test tokens
3. **Wallet Setup**: Creates a wallet and requests a chain
4. **Contract Deployment**: Builds and publishes your contract
5. **GraphQL Service**: Starts the service on port 8081
6. **Frontend**: Starts the React app on port 5173

## Troubleshooting

### If build fails:
```bash
# Clean everything and rebuild
docker compose down -v
docker system prune -f
docker compose build --no-cache
```

### If contract doesn't update:
```bash
# Force rebuild without cache
docker compose build --no-cache app
docker compose up --force-recreate
```

### View container logs:
```bash
docker compose logs app
```

### Access container shell:
```bash
docker compose exec app bash
```

### Check if services are running:
```bash
# Check container status
docker compose ps

# Check if ports are accessible
curl http://localhost:8080  # Faucet
curl http://localhost:8081  # GraphQL
curl http://localhost:5173  # Web app
```

## Environment Variables

The application automatically uses these environment variables (set in run.bash):
- `VITE_SERVICE_URL`: http://localhost:8081
- `VITE_DEFAULT_CHAIN_ID`: Auto-filled from wallet
- `VITE_DEFAULT_APP_ID`: Auto-filled from contract deployment

## Production Build

To build for production:
```bash
APP_MODE=preview docker compose up --build
```

This will:
1. Build the contract
2. Deploy to localnet
3. Build the frontend (production bundle)
4. Serve the production build

