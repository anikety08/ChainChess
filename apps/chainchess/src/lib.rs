//! ChainChess shared types used by both the contract and the service.

use async_graphql::{Enum, Request, Response, SimpleObject};
use linera_sdk::{
    graphql::GraphQLMutationRoot,
    linera_base_types::{ChainId, ContractAbi, ServiceAbi, Timestamp},
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// ABI marker for the ChainChess application.
pub struct ChainChessAbi;

impl ContractAbi for ChainChessAbi {
    type Operation = Operation;
    type Response = ChainChessResponse;
}

impl ServiceAbi for ChainChessAbi {
    type Query = Request;
    type QueryResponse = Response;
}

/// A mutation or action that can be applied to the application.
#[derive(Debug, Serialize, Deserialize, GraphQLMutationRoot)]
pub enum Operation {
    /// Create a new game lobby. The caller is white by default.
    CreateGame {
        /// Optional human readable title or context for the match.
        metadata: Option<String>,
        /// When true the black side is controlled by the built-in AI helper.
        play_vs_ai: bool,
    },
    /// Join an existing lobby as the black player.
    JoinGame { game_id: u64 },
    /// Submit a chess move in UCI format (e.g. "e2e4").
    SubmitMove {
        game_id: u64,
        uci: String,
        promotion: Option<String>,
    },
    /// Resign an active game.
    Resign { game_id: u64 },
}

/// Public information returned after each operation.
#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct ChainChessResponse {
    pub success: bool,
    pub message: String,
    pub game: Option<GameSummary>,
}

impl ChainChessResponse {
    pub fn ok(message: impl Into<String>, game: Option<GameSummary>) -> Self {
        Self {
            success: true,
            message: message.into(),
            game,
        }
    }

    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            message: message.into(),
            game: None,
        }
    }
}

/// Public view of a game.
#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct GameSummary {
    pub game_id: u64,
    pub white: ChainId,
    pub black: Option<ChainId>,
    pub ai_black: bool,
    pub board_fen: String,
    pub moves: Vec<MoveRecord>,
    pub turn: PlayerColor,
    pub status: GameStatus,
    pub winner: Option<PlayerColor>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub metadata: Option<String>,
}

/// Lightweight leaderboard entry.
#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct PlayerStats {
    pub chain_id: ChainId,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub games_played: u32,
    pub rating: i32,
}

impl PlayerStats {
    pub fn new(chain_id: ChainId) -> Self {
        Self {
            chain_id,
            wins: 0,
            losses: 0,
            draws: 0,
            games_played: 0,
            rating: 0,
        }
    }
}

/// Stored move plus metadata.
#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct MoveRecord {
    pub uci: String,
    pub san: Option<String>,
    pub played_by: PlayerColor,
    pub played_at: Timestamp,
}

/// Indicates whose turn it is or who played a move.
#[derive(Copy, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Enum)]
pub enum PlayerColor {
    White,
    Black,
}

impl PlayerColor {
    pub fn other(self) -> Self {
        match self {
            PlayerColor::White => PlayerColor::Black,
            PlayerColor::Black => PlayerColor::White,
        }
    }
}

/// High level status for a match.
#[derive(Copy, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Enum)]
pub enum GameStatus {
    Lobby,
    Active,
    Finished,
}

/// Domain errors bubbled up to the caller.
#[derive(Debug, Error, Serialize, Deserialize)]
pub enum ChainChessError {
    #[error("game {0} was not found")]
    GameNotFound(u64),
    #[error("game {0} is not joinable")]
    NotJoinable(u64),
    #[error("it is not your turn")]
    NotYourTurn,
    #[error("game is already finished")]
    AlreadyFinished,
    #[error("game is still waiting for an opponent")]
    MissingOpponent,
    #[error("invalid move: {0}")]
    InvalidMove(String),
    #[error("you are not a participant in this game")]
    NotParticipant,
    #[error("cannot create more than 64 concurrent games per chain")]
    LobbyLimitReached,
}

impl ChainChessResponse {
    pub fn from_error(err: ChainChessError) -> Self {
        Self::err(err.to_string())
    }
}
