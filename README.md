# ChainChess – Real-Time On-Chain Chess for WaveHack

ChainChess is a Linera microchain application where every chess move is validated, stored, and streamed in real time.

- **On-chain chess** – all moves are validated and persisted on a Linera microchain with instant finality.
- **Deterministic AI** – the contract can instantly answer as black using a capture-first heuristic, so solo players still get a complete match.
- **Per-chain leaderboards** – wins/losses/draws and an Elo-lite rating are kept per chain ID.
- **Local self-play mode** – a browser-only practice board where you can move for both sides without any wallet or validator.
- **GraphQL-first UX** – the React control room talks directly to the Linera service endpoint (no bespoke backend).
- **One-command demo** – `docker compose up --force-recreate` launches localnet, publishes the contract, starts the service, and boots the Vite frontend with the right env defaults.

## Prerequisites

- Docker + Docker Compose
- Ports 5173, 8080 (faucet), 8081 (GraphQL service), 9001, 13001 available
- (Optional) Rust toolchain + pnpm if you want to run things outside Docker

Everything else (linera-service, pnpm, node, etc.) is installed inside the container defined by `Dockerfile`.

## Quickstart (recommended)

### Start everything (fresh build)

```bash
# Stop any running containers
docker compose down

# Rebuild the Docker image (compiles your updated contract)
docker compose build --no-cache

# Start everything (after a fresh build)
docker compose up --force-recreate
```

### Or in one command:

```bash
docker compose down && docker compose build --no-cache && docker compose up
```

What `docker compose up` + `run.bash` do for you:

1. Spins up a Linera localnet with faucet access.
2. Initializes a wallet, requests a fresh chain, and prints the `CHAIN_ID`.
3. Builds and publishes the ChainChess application (`APP_ID` is logged).
4. Starts `linera service --port 8081` (GraphQL service).
5. Installs frontend deps and launches the Vite UI on `http://localhost:5173`.

Open `http://localhost:5173` once the log shows `VITE vX ready`. The UI will pre-fill the service URL,
chain ID, and app ID from the values that `run.bash` exports.

Demo video: [`https://youtu.be/xlaFmEmFcYA`](https://youtu.be/xlaFmEmFcYA)

## Screenshots

<p align="center">
  <img src="chainchess-web/public/Screenshot%202025-11-28%20171239.png" alt="Dashboard" width="250">
  <img src="chainchess-web/public/Screenshot%202025-11-28%20171253.png" alt="Lobby" width="250">
  <img src="chainchess-web/public/Screenshot%202025-11-28%20180055.png" alt="Game Board" width="250">
  
</p>

<p align="center"><i>Compact preview — three key screens side by side.</i></p>

## Manual run (advanced / full control)

```bash
# 1. start localnet + faucet
eval "$(linera net helper)"
linera_spawn linera net up --with-faucet

# 2. wallet + chain
export LINERA_FAUCET_URL=http://localhost:8080
linera wallet init --faucet "$LINERA_FAUCET_URL"
CHAIN_INFO=($(linera wallet request-chain --faucet "$LINERA_FAUCET_URL"))
CHAIN_ID="${CHAIN_INFO[0]}"

# 3. build + publish the app
APP_ID=$(linera project publish-and-create apps/chainchess)

# 4. start a service (GraphQL endpoint)
linera service --port 8081

# 5. frontend
cd chainchess-web
pnpm install
VITE_SERVICE_URL=http://localhost:8081 \
VITE_DEFAULT_CHAIN_ID="$CHAIN_ID" \
VITE_DEFAULT_APP_ID="$APP_ID" \
pnpm run dev --host 0.0.0.0 --port 5173
```

## Using the dashboard

1. **Connect** – if you ran the quickstart, the form is already populated. Otherwise paste your service URL, chain ID, and application ID, then hit “Save connection”.
2. **Create a lobby** – choose a label and decide whether the embedded AI should play as black.
3. **Share the lobby** – any other chain owner can join by selecting the lobby card and pressing “Join game”.
4. **Play** – drag pieces; the UI validates moves via `chess.js`, then calls `submitMove` on the contract.
   When AI is enabled, the contract auto-generates the black move and updates the board instantly.
5. **Spectate** – anyone can connect with the service URL to see board state, move history, and leaderboard metrics.
6. **Local self-play** – switch to the “Local self-play” tab in the UI to play a full game in your browser, moving for both sides (no chain connection required).

Tips:

- Status banners tell you when it’s not your turn or when a lobby is waiting for players.
- Leaderboard entries update when a game finishes (checkmates or resignations).
- Need multiple chains? run `linera --with-wallet 2 wallet request-chain ...` and paste the second chain ID into the UI.

## Contract & service highlights

- `Operation::CreateGame` – creates a lobby, optionally flagging AI for black.
- `Operation::JoinGame` – sets the challenger and opens the lobby.
- `Operation::SubmitMove` – validates UCI moves with the `chess` crate, toggles turns, and (if applicable) asks the AI helper to respond immediately.
- `Operation::Resign` – awards the match to the opponent.
- Leaderboard math is simple but deterministic (`+10/-5/+1` adjustments).
- The GraphQL service exposes:
  - `games` – list of stored games.
  - `topPlayers(limit)` – rating table.
  - `mutation` root generated automatically from the operations enum.

## Deployment targets

- **Localnet (default)** – via `docker compose up`.
- **Remote validator** – point `LINERA_FAUCET_URL` + `linera service --port` to the validator you control.
- **Testnet** – replace the faucet URL in `run.bash` with the Conway faucet, then redeploy. The frontend simply needs a reachable service URL.

## Production build

```bash
# Build the frontend
cd chainchess-web
npm install
npm run build

# Serve the production build locally
npm run preview -- --host 0.0.0.0 --port 5173

# Or inside Docker
docker compose up --force-recreate
```

The UI reads `VITE_SERVICE_URL`, `VITE_DEFAULT_CHAIN_ID`, and `VITE_DEFAULT_APP_ID` to prefill connection details. For different environments, set these before launching the server.

## Testing & linting

```bash
# Rust
cargo fmt
cargo clippy --workspace --all-targets

# Frontend
cd chainchess-web
pnpm lint
pnpm build
```

## Submission checklist

- [x] Functional Linera contract (apps/chainchess)
- [x] GraphQL service exposing state + mutations
- [x] Live frontend hitting the Linera service endpoint
- [x] README with deployment + usage docs
- [x] `project` + `wavehack` files describing how it fits the judging rubric

Questions? Ping @ChainChess in the WaveHack Discord or open an issue. Happy hacking! 🚀♟️
