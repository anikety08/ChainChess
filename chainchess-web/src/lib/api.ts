import { GraphQLClient, gql } from 'graphql-request';
import type {
  ChainChessResponse,
  ChainConfig,
  ChainStateResponse,
  CreateGameInput,
  JoinGameInput,
  ResignInput,
  SubmitMoveInput,
} from './types';

const STATE_QUERY = gql`
  query ChainChessState {
    games {
      gameId
      white
      black
      aiBlack
      boardFen
      metadata
      moves {
        uci
        san
        playedBy
        playedAt
      }
      status
      turn
      winner
      createdAt
      updatedAt
    }
    topPlayers {
      chainId
      wins
      losses
      draws
      gamesPlayed
      rating
    }
  }
`;

const CREATE_GAME_MUTATION = gql`
  mutation CreateGame($metadata: String, $playVsAi: Boolean!) {
    createGame(metadata: $metadata, playVsAi: $playVsAi) {
      success
      message
      game {
        gameId
        boardFen
        status
        turn
        white
        black
        aiBlack
      }
    }
  }
`;

const JOIN_GAME_MUTATION = gql`
  mutation JoinGame($gameId: Long!) {
    joinGame(gameId: $gameId) {
      success
      message
      game {
        gameId
        status
        turn
        white
        black
      }
    }
  }
`;

const SUBMIT_MOVE_MUTATION = gql`
  mutation SubmitMove($gameId: Long!, $uci: String!, $promotion: String) {
    submitMove(gameId: $gameId, uci: $uci, promotion: $promotion) {
      success
      message
      game {
        gameId
        boardFen
        status
        turn
        moves {
          uci
          san
          playedBy
          playedAt
        }
        winner
      }
    }
  }
`;

const RESIGN_MUTATION = gql`
  mutation Resign($gameId: Long!) {
    resign(gameId: $gameId) {
      success
      message
      game {
        gameId
        status
        winner
        turn
      }
    }
  }
`;

export class ChainChessApi {
  private readonly config: ChainConfig;
  private client: GraphQLClient;

  constructor(config: ChainConfig) {
    this.config = config;
    this.client = new GraphQLClient(buildEndpoint(config));
  }

  async fetchState(): Promise<ChainStateResponse> {
    return await this.client.request<ChainStateResponse>(STATE_QUERY);
  }

  async createGame(variables: CreateGameInput): Promise<ChainChessResponse> {
    try {
      const { createGame } = await this.client.request<{ createGame: ChainChessResponse }>(
        CREATE_GAME_MUTATION,
        variables,
      );
      return createGame;
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Failed to create game. Check your connection.',
        game: null,
      };
    }
  }

  async joinGame(variables: JoinGameInput): Promise<ChainChessResponse> {
    try {
      const { joinGame } = await this.client.request<{ joinGame: ChainChessResponse }>(
        JOIN_GAME_MUTATION,
        variables,
      );
      return joinGame;
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Failed to join game. Check your connection.',
        game: null,
      };
    }
  }

  async submitMove(variables: SubmitMoveInput): Promise<ChainChessResponse> {
    try {
      const { submitMove } = await this.client.request<{ submitMove: ChainChessResponse }>(
        SUBMIT_MOVE_MUTATION,
        variables,
      );
      return submitMove;
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Failed to submit move. Check your connection.',
        game: null,
      };
    }
  }

  async resign(variables: ResignInput): Promise<ChainChessResponse> {
    try {
      const { resign } = await this.client.request<{ resign: ChainChessResponse }>(
        RESIGN_MUTATION,
        variables,
      );
      return resign;
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Failed to resign. Check your connection.',
        game: null,
      };
    }
  }

  get endpoint(): string {
    return buildEndpoint(this.config);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.request<ChainStateResponse>(STATE_QUERY);
      return true;
    } catch (error) {
      return false;
    }
  }
}

function buildEndpoint(config: ChainConfig): string {
  const base = config.serviceUrl.replace(/\/$/, '');
  return `${base}/chains/${config.chainId}/applications/${config.applicationId}`;
}

