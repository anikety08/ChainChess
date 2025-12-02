export type PlayerColor = 'White' | 'Black';

export interface MoveRecord {
  uci: string;
  san?: string | null;
  playedBy: PlayerColor;
  playedAt: number | string;
}

export interface GameSummary {
  gameId: number;
  white: string;
  black?: string | null;
  aiBlack: boolean;
  boardFen: string;
  moves: MoveRecord[];
  turn: PlayerColor;
  status: 'Lobby' | 'Active' | 'Finished';
  winner?: PlayerColor | null;
  createdAt: number | string;
  updatedAt: number | string;
  metadata?: string | null;
}

export interface PlayerStats {
  chainId: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  rating: number;
}

export interface ChainStateResponse {
  games: GameSummary[];
  topPlayers: PlayerStats[];
}

export interface ChainChessResponse {
  success: boolean;
  message: string;
  game?: GameSummary | null;
}

export interface ChainConfig {
  serviceUrl: string;
  chainId: string;
  applicationId: string;
}

export interface CreateGameInput {
  metadata?: string;
  playVsAi: boolean;
}

export interface JoinGameInput {
  gameId: number;
}

export interface SubmitMoveInput {
  gameId: number;
  uci: string;
  promotion?: string;
}

export interface ResignInput {
  gameId: number;
}

