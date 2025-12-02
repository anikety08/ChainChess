import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  AlertTriangle,
  Bot,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Zap,
  Lightbulb,
  RotateCcw,
  Volume2,
  VolumeX,
  Settings,
  History,
} from 'lucide-react';
import clsx from 'clsx';
import './App.css';
import { ChainChessApi } from './lib/api';
import type { ChainConfig, ChainStateResponse, GameSummary } from './lib/types';
import { ChessAI, type AIDifficulty } from './lib/ai';
import { SoundManager } from './components/SoundManager';

const STORAGE_KEY = 'chainchess-config-v1';
const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChainChessDashboard />
    </QueryClientProvider>
  );
}

function ChainChessDashboard() {
  const envDefaults = {
    serviceUrl: import.meta.env.VITE_SERVICE_URL as string | undefined,
    chainId: import.meta.env.VITE_DEFAULT_CHAIN_ID as string | undefined,
    applicationId: import.meta.env.VITE_DEFAULT_APP_ID as string | undefined,
  };
  const initialConfig = useMemo(() => readStoredConfig(), []);
  const [config, setConfig] = useState<ChainConfig | null>(initialConfig);
  const [form, setForm] = useState<ChainConfig>(() => ({
    serviceUrl: initialConfig?.serviceUrl ?? envDefaults.serviceUrl ?? 'http://localhost:8081',
    chainId: initialConfig?.chainId ?? envDefaults.chainId ?? '',
    applicationId: initialConfig?.applicationId ?? envDefaults.applicationId ?? '',
  }));
  const [activeView, setActiveView] = useState<'onchain' | 'local' | 'ai'>('onchain');
  const [filter, setFilter] = useState<'all' | 'active' | 'lobby' | 'finished'>('all');
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [showHints, setShowHints] = useState(false);
  
  useEffect(() => {
    const soundManager = SoundManager.getInstance();
    soundManager.setEnabled(soundsEnabled);
  }, [soundsEnabled]);

  const api = useMemo(() => (config ? new ChainChessApi(config) : null), [config]);
  const rqClient = useQueryClient();

  const stateQuery = useQuery<ChainStateResponse>({
    queryKey: ['chain-state', config],
    queryFn: async () => {
      if (!api) {
        throw new Error('Missing connection settings');
      }
      return api.fetchState();
    },
    enabled: Boolean(api),
    refetchInterval: 4000,
  });
  const queryErrorMessage =
    stateQuery.error instanceof Error
      ? stateQuery.error.message
      : 'Unable to read chain state. Is the service running?';

  const selectedGame = useMemo(() => {
    if (!stateQuery.data || selectedGameId === null) {
      return stateQuery.data?.games[0] ?? null;
    }
    return stateQuery.data.games.find((game) => game.gameId === selectedGameId) ?? null;
  }, [stateQuery.data, selectedGameId]);

  useEffect(() => {
    if (!selectedGameId && stateQuery.data?.games.length) {
      setSelectedGameId(stateQuery.data.games[0].gameId);
    }
  }, [stateQuery.data, selectedGameId]);

  const createGame = useMutation({
    mutationFn: async (payload: { metadata?: string; playVsAi: boolean }) => {
      if (!api) throw new Error('Connect to chain first');
      const result = await api.createGame(payload);
      if (!result.success) {
        throw new Error(result.message);
      }
      return result;
    },
    onSuccess: (res) => {
      pushStatus(res.message);
      rqClient.invalidateQueries({ queryKey: ['chain-state'] });
    },
    onError: (error: Error) => {
      pushStatus(error.message || 'Failed to create game');
    },
  });

  const joinGame = useMutation({
    mutationFn: async (payload: { gameId: number }) => {
      if (!api) throw new Error('Connect to chain first');
      const result = await api.joinGame(payload);
      if (!result.success) {
        throw new Error(result.message);
      }
      return result;
    },
    onSuccess: (res) => {
      pushStatus(res.message);
      rqClient.invalidateQueries({ queryKey: ['chain-state'] });
    },
    onError: (error: Error) => {
      pushStatus(error.message || 'Failed to join game');
    },
  });

  const submitMove = useMutation({
    mutationFn: async (payload: { gameId: number; uci: string; promotion?: string }) => {
      if (!api) throw new Error('Connect to chain first');
      const result = await api.submitMove(payload);
      if (!result.success) {
        throw new Error(result.message);
      }
      return result;
    },
    onSuccess: (res) => {
      pushStatus(res.message);
      rqClient.invalidateQueries({ queryKey: ['chain-state'] });
    },
    onError: (error: Error) => {
      pushStatus(error.message || 'Invalid move or connection error');
    },
  });

  const resign = useMutation({
    mutationFn: async (payload: { gameId: number }) => {
      if (!api) throw new Error('Connect to chain first');
      const result = await api.resign(payload);
      if (!result.success) {
        throw new Error(result.message);
      }
      return result;
    },
    onSuccess: (res) => {
      pushStatus(res.message);
      rqClient.invalidateQueries({ queryKey: ['chain-state'] });
    },
    onError: (error: Error) => {
      pushStatus(error.message || 'Failed to resign');
    },
  });

  const filteredGames = useMemo(() => {
    if (!stateQuery.data) return [];
    return stateQuery.data.games.filter((game) => {
      if (filter === 'all') return true;
      return game.status.toLowerCase() === filter;
    });
  }, [stateQuery.data, filter]);

  const [testingConnection, setTestingConnection] = useState(false);

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.chainId || !form.applicationId) {
      pushStatus('Chain ID and Application ID are required');
      return;
    }
    
    // Test connection before saving
    setTestingConnection(true);
    const testApi = new ChainChessApi(form);
    const isConnected = await testApi.testConnection();
    setTestingConnection(false);
    
    if (isConnected) {
      setConfig(form);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      pushStatus('✓ Connected successfully! Ready to play.');
    } else {
      pushStatus('⚠ Connection failed. Check your service URL and chain details.');
    }
  };

  const handlePieceDrop = useCallback(
    (source: string, target: string, piece: string) => {
      if (!selectedGame || !config) return false;
      const playerColor = resolvePlayerColor(selectedGame, config.chainId);
      const canMove =
        selectedGame.status === 'Active' &&
        !!playerColor &&
        playerColor === selectedGame.turn &&
        !submitMove.isPending;
      if (!canMove) return false;

      const chess = initChess(selectedGame);
      if (!chess) return false;

      let move = chess.move({ from: source, to: target });
      if (!move && isPawn(piece)) {
        move = chess.move({ from: source, to: target, promotion: 'q' });
      }

      if (!move) {
        return false;
      }

      // Play sound
      const soundManager = SoundManager.getInstance();
      if (chess.isCheckmate()) {
        soundManager.playCheckmate();
      } else if (chess.isCheck()) {
        soundManager.playCheck();
      } else if (move.captured) {
        soundManager.playCapture();
      } else {
        soundManager.playMove();
      }

      // Fix UCI format - should be lowercase and proper format
      const promotion = move.promotion ? move.promotion.toLowerCase() : '';
      const uci = `${source}${target}${promotion}`;

      submitMove.mutate({
        gameId: selectedGame.gameId,
        uci: uci,
        promotion: move.promotion ?? undefined,
      });
      return true;
    },
    [config, selectedGame, submitMove],
  );

  const canSubmitMove = useMemo(() => {
    if (!selectedGame || !config) return false;
    const player = resolvePlayerColor(selectedGame, config.chainId);
    return (
      selectedGame.status === 'Active' &&
      !!player &&
      player === selectedGame.turn &&
      !submitMove.isPending
    );
  }, [selectedGame, config, submitMove.isPending]);

  const handleFilterChange = (value: typeof filter) => setFilter(value);

  const pushStatus = (message: string) => {
    setStatusBanner(message);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const onCreateGame = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createGame.mutate({
      metadata: String(data.get('metadata') ?? '') || undefined,
      playVsAi: data.get('ai') === 'on',
    });
  };

  const onJoinSelected = () => {
    if (selectedGame) {
      joinGame.mutate({ gameId: selectedGame.gameId });
    }
  };

  const onResign = () => {
    if (selectedGame) {
      resign.mutate({ gameId: selectedGame.gameId });
    }
  };

  const orientation =
    selectedGame && config && resolvePlayerColor(selectedGame, config.chainId) === 'Black'
      ? 'black'
      : 'white';

  return (
    <div className="app-shell">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">♟️ ChainChess · Decentralized Chess Platform</p>
          <h1>
            ChainChess
            <span className="hero-accent">Play on-chain. Play anywhere.</span>
          </h1>
          <p className="lead">
            Play chess on-chain with instant finality. Create games, challenge AI opponents, or
            practice locally. Every move is validated and stored on the Linera blockchain. Experience
            the future of decentralized gaming.
          </p>
          <div className="hero-actions">
            <a href="https://linera.dev" target="_blank" rel="noreferrer" className="ghost-btn">
              <Zap size={16} />
              Linera docs
            </a>
            <button
              className="solid-btn"
              type="button"
              onClick={() => stateQuery.refetch()}
              disabled={!api}
            >
              <RefreshCw size={16} />
              Sync state
            </button>
            <button className="ghost-btn" type="button" onClick={() => setShowAbout(true)}>
              <ShieldCheck size={16} />
              About app
            </button>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => {
                const newState = !soundsEnabled;
                setSoundsEnabled(newState);
                SoundManager.getInstance().setEnabled(newState);
              }}
            >
              {soundsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {soundsEnabled ? 'Sound On' : 'Sound Off'}
            </button>
          </div>
        </div>
        <div className="highlight-card">
          <div className="highlight-copy">
            <ShieldCheck size={24} />
            <div>
              <p className="title">Wave-ready</p>
              <p>Backend contract + frontend orchestrator bundled in this repo.</p>
            </div>
          </div>
          <span className="tag">App ID aware UI</span>
        </div>
      </header>

      <nav className="mode-toggle">
        <button
          type="button"
          className={clsx('mode-chip', activeView === 'onchain' && 'active')}
          onClick={() => setActiveView('onchain')}
        >
          <Zap size={14} />
          On-chain
        </button>
        <button
          type="button"
          className={clsx('mode-chip', activeView === 'ai' && 'active')}
          onClick={() => setActiveView('ai')}
        >
          <Bot size={14} />
          Play vs AI
        </button>
        <button
          type="button"
          className={clsx('mode-chip', activeView === 'local' && 'active')}
          onClick={() => setActiveView('local')}
        >
          <Settings size={14} />
          Practice
        </button>
      </nav>

      {activeView === 'onchain' && (
        <>
          {stateQuery.isError && (
            <div className="status-banner error">
              <AlertTriangle size={16} />
              <span>{queryErrorMessage}</span>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => stateQuery.refetch()}
                style={{ marginLeft: 'auto' }}
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          {config && stateQuery.isSuccess && (
            <div className="status-banner success">
              <ShieldCheck size={16} />
              <span>Connected to chain {shorten(config.chainId)}</span>
            </div>
          )}

          {statusBanner && (
            <div className="status-banner">
              <AlertTriangle size={16} />
              <span>{statusBanner}</span>
            </div>
          )}

          {showAbout && (
            <div className="status-banner">
              <span>
                ChainChess runs on Linera microchains. The UI connects to the GraphQL service at
                {` ${form.serviceUrl} `} and reads state for chain {shorten(form.chainId)} and app
                {` ${form.applicationId} `}. Create lobbies, join games, and submit moves; results
                are persisted on-chain and streamed back to the board.
              </span>
              <button className="ghost-btn" type="button" onClick={() => setShowAbout(false)}>
                Close
              </button>
            </div>
          )}

          <section className="dashboard-grid">
            <aside className="panel stack">
              <h2>Connect to Chain</h2>
              <p className="muted">
                Connect to your Linera localnet. If using Docker, the connection details are
                automatically filled from environment variables.
              </p>
              <form className="form-grid" onSubmit={handleConnect}>
                <label>
                  <span>Service URL</span>
                  <input
                    name="serviceUrl"
                    value={form.serviceUrl}
                    onChange={(evt) =>
                      setForm((prev) => ({ ...prev, serviceUrl: evt.target.value }))
                    }
                    placeholder="http://localhost:8081"
                  />
                </label>
                <label>
                  <span>Chain ID</span>
                  <input
                    name="chainId"
                    value={form.chainId}
                    onChange={(evt) =>
                      setForm((prev) => ({ ...prev, chainId: evt.target.value }))
                    }
                    placeholder="0xabc..."
                    required
                  />
                </label>
                <label>
                  <span>Application ID</span>
                  <input
                    name="applicationId"
                    value={form.applicationId}
                    onChange={(evt) =>
                      setForm((prev) => ({ ...prev, applicationId: evt.target.value }))
                    }
                    placeholder="linera_app::1234"
                    required
                  />
                </label>
                <button className="solid-btn" type="submit" disabled={testingConnection}>
                  {testingConnection ? (
                    <>
                      <Loader2 className="spin" size={16} />
                      Testing...
                    </>
                  ) : (
                    <>
                      <PlugZap size={16} />
                      {config ? 'Update Connection' : 'Connect'}
                    </>
                  )}
                </button>
                {config && !testingConnection && (
                  <div className="connection-status">
                    <div className="status-indicator active" />
                    <span className="muted tiny">Connected to chain</span>
                  </div>
                )}
              </form>

              <div className="divider" />

              <form className="form-grid" onSubmit={onCreateGame}>
                <h3>Launch a lobby</h3>
                <label>
                  <span>Game label (optional)</span>
                  <input name="metadata" placeholder="e.g. My chess match" />
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="ai" defaultChecked />
                  <span>
                    <Bot size={14} />
                    Play against AI
                  </span>
                </label>
                <button
                  className="solid-btn"
                  type="submit"
                  disabled={createGame.isPending || !api}
                >
                  {createGame.isPending ? (
                    <>
                      <Loader2 className="spin" size={16} />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      Create Game
                    </>
                  )}
                </button>
                {!api && (
                  <p className="muted tiny" style={{ marginTop: '-0.5rem' }}>
                    Connect to chain first to create games
                  </p>
                )}
              </form>

              <div className="deployment-card">
                <h3>Quick Start</h3>
                <ul>
                  <li>✓ Connect to your Linera localnet</li>
                  <li>✓ Create or join a game</li>
                  <li>✓ Make moves by dragging pieces</li>
                  <li>✓ Play against AI or other players</li>
                </ul>
                <p className="muted tiny" style={{ marginTop: '1rem' }}>
                  For Docker: Run `docker compose up --force-recreate`
                </p>
              </div>
            </aside>

            <section className="panel board-panel">
              <header className="panel-header">
                <div>
                  <p className="eyebrow">Board control</p>
                  <h2>{selectedGame ? gameTitle(selectedGame) : 'Select a game'}</h2>
                </div>
                <div className="status-group">
                  {selectedGame && (
                    <span className={clsx('badge', selectedGame.status.toLowerCase())}>
                      {selectedGame.status}
                    </span>
                  )}
                  {selectedGame?.aiBlack && (
                    <span className="badge ghost">
                      <Bot size={12} /> AI ally
                    </span>
                  )}
                </div>
              </header>

              <div className="board-wrapper">
                <Chessboard
                  options={{
                    position: selectedGame?.boardFen ?? 'start',
                    boardOrientation: orientation as 'white' | 'black',
                    allowDragging: canSubmitMove,
                    darkSquareStyle: { backgroundColor: '#1f233d' },
                    lightSquareStyle: { backgroundColor: '#f2f5ff' },
                    boardStyle: {
                      borderRadius: '32px',
                      boxShadow: '0 20px 60px rgba(5, 7, 13, 0.35)',
                      transition: 'all 0.3s ease',
                    },
                    onPieceDrop: ({ sourceSquare, targetSquare, piece }) =>
                      sourceSquare && targetSquare
                        ? handlePieceDrop(sourceSquare, targetSquare, piece.pieceType)
                        : false,
                  }}
                />
                {!canSubmitMove && (
                  <div className="board-overlay">
                    <p>{getOverlayMessage(selectedGame, config)}</p>
                  </div>
                )}
                {showHints && selectedGame && canSubmitMove && (
                  <div className="hint-banner">
                    <Lightbulb size={16} />
                    <span>Drag pieces to make your move</span>
                  </div>
                )}
              </div>

              <div className="actions-row">
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={onJoinSelected}
                  disabled={!selectedGame || joinGame.isPending}
                >
                  {joinGame.isPending ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Trophy size={16} />
                  )}
                  Join game
                </button>
                <button
                  className="ghost-btn danger"
                  type="button"
                  onClick={onResign}
                  disabled={!selectedGame || resign.isPending || selectedGame?.status !== 'Active'}
                >
                  {resign.isPending ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  Resign
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => setShowHints(!showHints)}
                >
                  <Lightbulb size={16} />
                  {showHints ? 'Hide' : 'Show'} Hints
                </button>
              </div>

              <div className="moves-log">
                <h3>Latest moves</h3>
                <div className="move-stream">
                  {selectedGame && selectedGame.moves.length > 0 ? (
                    selectedGame.moves
                      .slice(-8)
                      .reverse()
                      .map((move, idx) => (
                        <div key={`${move.uci}-${idx}`} className="move-pill">
                          <span
                            className={clsx(
                              'dot',
                              move.playedBy === 'White' ? 'white' : 'black',
                            )}
                          />
                          <span className="uci">{move.uci}</span>
                          <span className="time">{formatTimestamp(move.playedAt)}</span>
                        </div>
                      ))
                  ) : (
                    <p className="muted">No moves yet. Be the first!</p>
                  )}
                </div>
              </div>
            </section>
          </section>

          <section className="lower-grid">
            <div className="panel">
              <header className="panel-header">
                <div>
                  <p className="eyebrow">Games on this microchain</p>
                  <h2>Browse lobbies</h2>
                </div>
                <div className="filter-toggle">
                  {(['all', 'active', 'lobby', 'finished'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={clsx('filter-chip', option === filter && 'active')}
                      onClick={() => handleFilterChange(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </header>
              <div className="game-grid">
                {stateQuery.isLoading && <Loader2 className="spin" />}
                {filteredGames.map((game) => (
                  <article
                    key={game.gameId}
                    className={clsx(
                      'game-card',
                      selectedGame?.gameId === game.gameId && 'selected',
                    )}
                    onClick={() => setSelectedGameId(game.gameId)}
                  >
                    <div className="game-card-header">
                      <span className="badge ghost">{game.status}</span>
                      <span className="game-id">#{game.gameId}</span>
                    </div>
                    <p className="players">
                      {shorten(game.white)} vs{' '}
                      {game.black ? shorten(game.black) : game.aiBlack ? 'AI' : '—'}
                    </p>
                    <p className="muted tiny">Updated {formatTimestamp(game.updatedAt)}</p>
                  </article>
                ))}
                {!stateQuery.isLoading && filteredGames.length === 0 && (
                  <p className="muted">No games yet. Create one to get started.</p>
                )}
              </div>
            </div>

            <div className="panel">
              <header className="panel-header">
                <div>
                  <p className="eyebrow">Leaderboard</p>
                  <h2>Top chains</h2>
                </div>
                <Trophy size={24} />
              </header>
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>Chain</th>
                    <th>W</th>
                    <th>L</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {stateQuery.data?.topPlayers && stateQuery.data.topPlayers.length > 0 ? (
                    stateQuery.data.topPlayers.map((player) => (
                      <tr key={player.chainId}>
                        <td>{shorten(player.chainId)}</td>
                        <td>{player.wins}</td>
                        <td>{player.losses}</td>
                        <td>{player.rating}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="muted">
                        No stats yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeView === 'ai' && <AIPlayPanel soundsEnabled={soundsEnabled} />}
      {activeView === 'local' && <LocalPlayPanel soundsEnabled={soundsEnabled} />}
    </div>
  );
}

function AIPlayPanel({ soundsEnabled }: { soundsEnabled: boolean }) {
  const [game] = useState(() => new Chess());
  const [fen, setFen] = useState(game.fen());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [status, setStatus] = useState<string>(() => describeLocalStatus(game));
  const [aiDifficulty, setAIDifficulty] = useState<AIDifficulty>('medium');
  const [aiThinking, setAiThinking] = useState(false);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [ai] = useState(() => new ChessAI('medium'));
  const [showHint, setShowHint] = useState<string | null>(null);

  useEffect(() => {
    ai.setDifficulty(aiDifficulty);
  }, [aiDifficulty, ai]);

  const resetGame = () => {
    game.reset();
    setFen(game.fen());
    setStatus(describeLocalStatus(game));
    setMoveHistory([]);
    setShowHint(null);
  };

  const flipBoard = () => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  };

  const getHint = () => {
    const bestMove = ai.getBestMove(game);
    if (bestMove) {
      setShowHint(bestMove);
      setTimeout(() => setShowHint(null), 3000);
    }
  };

  const makeAIMove = useCallback(async () => {
    if (game.isGameOver() || game.turn() === 'w') return;

    setAiThinking(true);
    // Simulate thinking time
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

    const bestMove = ai.getBestMove(game);
    if (bestMove) {
      const move = game.move(bestMove);
      if (move) {
        const soundManager = SoundManager.getInstance();
        soundManager.setEnabled(soundsEnabled);
        if (game.isCheckmate()) {
          soundManager.playCheckmate();
        } else if (game.isCheck()) {
          soundManager.playCheck();
        } else if (move.captured) {
          soundManager.playCapture();
        } else {
          soundManager.playMove();
        }

        setFen(game.fen());
        setStatus(describeLocalStatus(game));
        setMoveHistory((prev) => [...prev, bestMove]);
      }
    }
    setAiThinking(false);
  }, [game, ai, soundsEnabled]);

  const handleLocalDrop = useCallback(
    (source: string, target: string, piece: string) => {
      if (game.turn() !== 'w' || aiThinking) return false;

      const move = game.move({
        from: source,
        to: target,
        promotion: isPawn(piece) ? 'q' : undefined,
      });

      if (!move) return false;

      const soundManager = SoundManager.getInstance();
      soundManager.setEnabled(soundsEnabled);
      if (game.isCheckmate()) {
        soundManager.playCheckmate();
      } else if (game.isCheck()) {
        soundManager.playCheck();
      } else if (move.captured) {
        soundManager.playCapture();
      } else {
        soundManager.playMove();
      }

      setFen(game.fen());
      setStatus(describeLocalStatus(game));
      setMoveHistory((prev) => [...prev, move.san]);

      // AI makes move after a short delay
      setTimeout(() => {
        makeAIMove();
      }, 300);

      return true;
    },
    [game, aiThinking, soundsEnabled, makeAIMove],
  );

  useEffect(() => {
    setStatus(describeLocalStatus(game));
  }, [game, fen]);

  return (
    <section className="panel board-panel ai-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">AI Opponent</p>
          <h2>Play against AI</h2>
        </div>
        <div className="status-group">
          <select
            className="difficulty-select"
            value={aiDifficulty}
            onChange={(e) => setAIDifficulty(e.target.value as AIDifficulty)}
            disabled={aiThinking}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </header>

      <div className="board-wrapper">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: !aiThinking && game.turn() === 'w' && !game.isGameOver(),
            darkSquareStyle: { backgroundColor: '#1f233d' },
            lightSquareStyle: { backgroundColor: '#f2f5ff' },
            boardStyle: {
              borderRadius: '32px',
              boxShadow: '0 20px 60px rgba(5, 7, 13, 0.35)',
            },
            onPieceDrop: ({ sourceSquare, targetSquare, piece }) =>
              sourceSquare && targetSquare
                ? handleLocalDrop(sourceSquare, targetSquare, piece.pieceType)
                : false,
          }}
        />
        {aiThinking && (
          <div className="board-overlay">
            <div className="thinking-indicator">
              <Loader2 className="spin" size={32} />
              <p>AI is thinking...</p>
            </div>
          </div>
        )}
        {showHint && (
          <div className="hint-banner">
            <Lightbulb size={16} />
            <span>Hint: {showHint}</span>
          </div>
        )}
      </div>

      <div className="local-controls">
        <p className={clsx('status-text', game.isCheckmate() && 'checkmate', game.isCheck() && 'check')}>
          {status}
        </p>
        <div className="actions-row">
          <button className="ghost-btn" type="button" onClick={resetGame} disabled={aiThinking}>
            <RotateCcw size={16} />
            New Game
          </button>
          <button className="ghost-btn" type="button" onClick={flipBoard}>
            Flip Board
          </button>
          <button className="ghost-btn" type="button" onClick={getHint} disabled={aiThinking || game.turn() !== 'w'}>
            <Lightbulb size={16} />
            Hint
          </button>
        </div>
      </div>

      {moveHistory.length > 0 && (
        <div className="moves-log">
          <h3>Move History</h3>
          <div className="move-stream">
            {moveHistory.slice(-10).map((move, idx) => (
              <div key={idx} className="move-pill">
                <span className="move-number">{idx + 1}.</span>
                <span className="uci">{move}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function LocalPlayPanel({ soundsEnabled }: { soundsEnabled: boolean }) {
  const [localGame] = useState(() => new Chess());
  const [fen, setFen] = useState(localGame.fen());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [status, setStatus] = useState<string>(() => describeLocalStatus(localGame));
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [, setHistoryIndex] = useState(-1);

  const resetGame = () => {
    localGame.reset();
    setFen(localGame.fen());
    setStatus(describeLocalStatus(localGame));
    setMoveHistory([]);
    setHistoryIndex(-1);
  };

  const flipBoard = () => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  };

  const undoMove = () => {
    if (moveHistory.length === 0) return;
    localGame.undo();
    setFen(localGame.fen());
    setStatus(describeLocalStatus(localGame));
    const newHistory = moveHistory.slice(0, -1);
    setMoveHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleLocalDrop = useCallback(
    (source: string, target: string, piece: string) => {
      const move = localGame.move({
        from: source,
        to: target,
        promotion: isPawn(piece) ? 'q' : undefined,
      });

      if (!move) return false;

      const soundManager = SoundManager.getInstance();
      soundManager.setEnabled(soundsEnabled);
      if (localGame.isCheckmate()) {
        soundManager.playCheckmate();
      } else if (localGame.isCheck()) {
        soundManager.playCheck();
      } else if (move.captured) {
        soundManager.playCapture();
      } else {
        soundManager.playMove();
      }

      setFen(localGame.fen());
      setStatus(describeLocalStatus(localGame));
      setMoveHistory((prev) => [...prev, move.san]);
      setHistoryIndex((prev) => prev + 1);
      return true;
    },
    [localGame, soundsEnabled],
  );

  useEffect(() => {
    setStatus(describeLocalStatus(localGame));
  }, [localGame]);

  return (
    <section className="panel board-panel local-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Local sandbox</p>
          <h2>Practice board (play both sides)</h2>
        </div>
      </header>

      <div className="board-wrapper">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: true,
            darkSquareStyle: { backgroundColor: '#1f233d' },
            lightSquareStyle: { backgroundColor: '#f2f5ff' },
            boardStyle: {
              borderRadius: '32px',
              boxShadow: '0 20px 60px rgba(5, 7, 13, 0.35)',
            },
            onPieceDrop: ({ sourceSquare, targetSquare, piece }) =>
              sourceSquare && targetSquare
                ? handleLocalDrop(sourceSquare, targetSquare, piece.pieceType)
                : false,
          }}
        />
      </div>

      <div className="local-controls">
        <p className={clsx('status-text', localGame.isCheckmate() && 'checkmate', localGame.isCheck() && 'check')}>
          {status}
        </p>
        <div className="actions-row">
          <button className="ghost-btn" type="button" onClick={resetGame}>
            <RotateCcw size={16} />
            Reset
          </button>
          <button className="ghost-btn" type="button" onClick={flipBoard}>
            Flip Board
          </button>
          <button className="ghost-btn" type="button" onClick={undoMove} disabled={moveHistory.length === 0}>
            <History size={16} />
            Undo
          </button>
        </div>
      </div>

      {moveHistory.length > 0 && (
        <div className="moves-log">
          <h3>Move History</h3>
          <div className="move-stream">
            {moveHistory.map((move, idx) => (
              <div key={idx} className="move-pill">
                <span className="move-number">{idx + 1}.</span>
                <span className="uci">{move}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="muted tiny">
        Practice mode: play both sides. No wallet, chain ID, or service URL required.
      </p>
    </section>
  );
}

function describeLocalStatus(game: Chess) {
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Black' : 'White';
    return `${winner} wins by checkmate`;
  }
  if (game.isStalemate()) return 'Draw by stalemate';
  if (game.isThreefoldRepetition()) return 'Draw by repetition';
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material';
  if (game.isDraw()) return 'Draw';

  return game.turn() === 'w' ? 'White to move' : 'Black to move';
}

function readStoredConfig(): ChainConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChainConfig) : null;
  } catch {
    return null;
  }
}

function resolvePlayerColor(game: GameSummary, chainId?: string | null) {
  if (!chainId) return null;
  if (game.white === chainId) return 'White';
  if (game.black === chainId) return 'Black';
  if (game.aiBlack && game.white === chainId) return 'White';
  return null;
}

function initChess(game: GameSummary) {
  try {
    const chess = new Chess();
    chess.load(game.boardFen);
    return chess;
  } catch {
    return null;
  }
}

function isPawn(piece: string) {
  return piece.toLowerCase().includes('p');
}



function formatTimestamp(value?: number | string | null) {
  if (!value) return 'just now';
  const asNumber = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(asNumber)) return 'just now';
  const date = new Date(Number(asNumber) / 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function gameTitle(game: GameSummary) {
  if (game.metadata) return game.metadata;
  if (game.black) return `${shorten(game.white)} vs ${shorten(game.black)}`;
  if (game.aiBlack) return `${shorten(game.white)} vs AI`;
  return `Game #${game.gameId}`;
}

function shorten(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function getOverlayMessage(game: GameSummary | null, config: ChainConfig | null) {
  if (!game) return 'Select a game to begin';
  if (!config) return 'Save your connection details to interact';
  if (game.status === 'Lobby') return 'Waiting for an opponent';
  if (game.status === 'Finished') return game.winner ? `${game.winner} won this match` : 'Game concluded';
  return "It's not your turn yet";
}
