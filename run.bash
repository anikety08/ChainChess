#!/usr/bin/env bash

set -eu

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi

# Web-only mode
if [ "${SKIP_CHAIN:-}" = "yes" ]; then
  cd chainchess-web
  export CI=true
  npm install
  bash -lc 'if [ "${APP_MODE:-dev}" = "preview" ]; then npm run build && npm run preview -- --host 0.0.0.0 --port 5173 --strictPort; else npm run dev -- --host 0.0.0.0 --port 5173 --strictPort; fi'
  exit 0
fi

# Import linera net helper and spawn function
source /dev/stdin <<<"$(linera net helper 2>/dev/null)" || true

# Set environment to reduce I/O contention
export CARGO_BUILD_JOBS=2
export CARGO_NET_RETRY=10

# Start localnet + faucet in background using helper when available
if type linera_spawn >/dev/null 2>&1; then
  linera_spawn \
  linera net up --with-faucet --faucet-port 8080
else
  linera net up --with-faucet &
fi
NET_PID=$!
# Wait for faucet to be ready
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8080/") || code=0
  if [ "$code" = "200" ]; then
    break
  fi
  sleep 1
done

export LINERA_FAUCET_URL=http://localhost:8080
# Export wallet/keystore/storage paths based on helper's tmp dir if available
if [ -n "${LINERA_TMP_DIR:-}" ]; then
  export LINERA_WALLET="$LINERA_TMP_DIR/wallet_0.json"
  export LINERA_KEYSTORE="$LINERA_TMP_DIR/keystore_0.json"
  export LINERA_STORAGE="rocksdb:$LINERA_TMP_DIR/client_0.db"
fi

linera wallet init --faucet="$LINERA_FAUCET_URL" || true
CHAIN_INFO=($(linera wallet request-chain --faucet="$LINERA_FAUCET_URL"))
CHAIN_ID="${CHAIN_INFO[0]}"

APP_PATH=apps/chainchess

# Clean previous builds to avoid conflicts
echo "🧹 Cleaning previous build artifacts..."
rm -rf "$APP_PATH/target" 2>/dev/null || true

echo "📦 Building and publishing contract..."
echo "⏳ This may take 5-10 minutes (compiling Rust dependencies)..."

MAX_RETRIES=2
APP_ID=""
for i in $(seq 1 $MAX_RETRIES); do
  if cargo build --release --target wasm32-unknown-unknown -p chainchess 2>&1; then
    if OUTPUT=$(linera publish-and-create \
      target/wasm32-unknown-unknown/release/chainchess_{contract,service}.wasm \
      --json-argument "null" 2>&1); then
      APP_ID=$(echo "$OUTPUT" | grep -oP 'linera_app::[a-f0-9]+' | head -1 || echo "$OUTPUT")
      if [[ "$APP_ID" =~ linera_app:: ]]; then
        break
      fi
    fi
  fi
  if [ $i -lt $MAX_RETRIES ]; then
    echo "⚠️  Build failed (attempt $i/$MAX_RETRIES), cleaning and retrying..."
    rm -rf "$APP_PATH/target" 2>/dev/null || true
    sleep 3
  else
    echo "❌ Contract build/publish failed after $MAX_RETRIES attempts!"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Check Docker disk space: docker system df"
    echo "   2. Clean Docker: docker system prune -f"
    echo "   3. Rebuild: docker compose build --no-cache"
    exit 1
  fi
done

if [ -z "$APP_ID" ] || [[ ! "$APP_ID" =~ linera_app:: ]]; then
  echo "❌ Failed to get Application ID from output!"
  exit 1
fi

echo "🚀 ChainChess deployed"
echo "Chain ID: $CHAIN_ID"
echo "Application ID: $APP_ID"

GRAPH_PORT=8081
linera service --port "$GRAPH_PORT" &
SERVICE_PID=$!
# Wait for GraphQL service
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${GRAPH_PORT}/") || code=0
  if [ "$code" = "200" ]; then
    break
  fi
  sleep 1
done

cd chainchess-web
export CI=true
npm install
VITE_SERVICE_URL="http://localhost:${GRAPH_PORT}" \
  VITE_DEFAULT_CHAIN_ID="$CHAIN_ID" \
  VITE_DEFAULT_APP_ID="$APP_ID" \
  bash -lc 'if [ "${APP_MODE:-dev}" = "preview" ]; then npm run build && npm run preview -- --host 0.0.0.0 --port 5173 --strictPort; else npm run dev -- --host 0.0.0.0 --port 5173 --strictPort; fi'

# Keep background processes alive until dev server exits
kill -0 "$NET_PID" 2>/dev/null || true
kill -0 "$SERVICE_PID" 2>/dev/null || true
