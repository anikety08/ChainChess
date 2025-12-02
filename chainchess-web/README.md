# ChainChess Web UI

This is the React + TypeScript + Vite frontend for **ChainChess**, a Linera microchain chess dApp.
It provides a rich dashboard for on-chain games and a local "play both sides" practice board that
runs entirely in your browser.

## Features

- **On-chain dashboard** – connect to a Linera service URL, browse lobbies on your microchain,
  join games, submit moves, and see live leaderboards powered by GraphQL.
- **Local self-play mode** – spin up a standalone chess board in your browser and move pieces for
  both sides. Great for demos, analysis, or playing against yourself without any wallet or
  validator.
- **Responsive, themed UI** – glassmorphism-style layout, move log, and per-game status badges.

## Getting started

### Prerequisites

- Node.js 18+ and npm (or pnpm, if you prefer)

### Install dependencies

From the `chainchess-web` directory:

```bash
npm install
```

### Run the dev server (local UI only)

This will start the Vite dev server on port 5173. The **Local self-play** tab works immediately
without any backend.

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

## On-chain mode (talking to Linera)

To use the full on-chain dashboard you need a running Linera service and a deployed ChainChess
application. The recommended path is to use the root project `docker compose` setup, which will
build and publish everything for you.

Once you have a service URL, chain ID, and app ID:

1. Open the app in your browser.
2. In **On-chain multiplayer** view, fill in:
   - **Service URL** – e.g. `http://localhost:8081`
   - **Chain ID** – your chain identifier
   - **Application ID** – the published ChainChess app ID
3. Click **Save connection**.
4. Create a lobby and start playing.

Connection details are stored in `localStorage` so you don’t need to re-enter them every time.

## Local self-play mode

The **Local self-play** view exposes a second board backed only by `chess.js`. You can:

- Drag pieces for **both** white and black.
- Flip the board orientation.
- Reset the board to start a new game.

Game rules and end conditions (checkmate, stalemate, common draw cases) are handled in the browser;
no network calls are made in this mode.

## Build and preview

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Linting

```bash
npm run lint
```
