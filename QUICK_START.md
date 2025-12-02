# 🚀 Quick Start Guide

## Build and Run with Docker

### Step 1: Rebuild (after contract changes)
```bash
docker compose build --no-cache
```

### Step 2: Run
```bash
docker compose up
```

### Step 3: Wait for startup
You'll see output like:
```
🚀 ChainChess deployed
Chain ID: 0x1234...
Application ID: linera_app::5678...
VITE vX ready in XXX ms
```

### Step 4: Open browser
Go to: **http://localhost:5173**

The connection details are automatically filled in!

## Manual Steps (if needed)

If Docker doesn't work, you can run manually:

### 1. Build the contract
```bash
cd apps/chainchess
linera project build
cd ../..
```

### 2. Start localnet
```bash
linera net up --with-faucet
```

### 3. Setup wallet
```bash
export LINERA_FAUCET_URL=http://localhost:8080
linera wallet init --faucet="$LINERA_FAUCET_URL"
CHAIN_ID=$(linera wallet request-chain --faucet="$LINERA_FAUCET_URL" | head -n1)
```

### 4. Deploy contract
```bash
APP_ID=$(linera project publish-and-create apps/chainchess)
echo "Chain ID: $CHAIN_ID"
echo "App ID: $APP_ID"
```

### 5. Start GraphQL service
```bash
linera service --port 8081
```

### 6. Start frontend (in another terminal)
```bash
cd chainchess-web
npm install
VITE_SERVICE_URL=http://localhost:8081 \
VITE_DEFAULT_CHAIN_ID="$CHAIN_ID" \
VITE_DEFAULT_APP_ID="$APP_ID" \
npm run dev
```

## Common Commands

```bash
# Rebuild everything
docker compose build --no-cache && docker compose up

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Clean rebuild
docker compose down -v && docker compose build --no-cache && docker compose up
```

