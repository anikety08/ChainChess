use std::cmp::Reverse;

use async_graphql::ComplexObject;
use linera_sdk::{
    linera_base_types::{ChainId, Timestamp},
    views::{linera_views, MapView, RegisterView, RootView, ViewStorageContext},
};
use serde::{Deserialize, Serialize};

use chainchess::{GameStatus, GameSummary, MoveRecord, PlayerColor, PlayerStats};

/// Application level state that lives on each microchain.
#[derive(RootView, async_graphql::SimpleObject)]
#[graphql(complex)]
#[view(context = ViewStorageContext)]
pub struct ChainChessState {
    /// Monotonically increasing identifier for new games.
    pub next_game_id: RegisterView<u64>,
    /// All games created on this chain.
    pub active_games: MapView<u64, StoredGame>,
    /// Basic Elo-style scores per participant.
    pub leaderboard: MapView<ChainId, PlayerStats>,
}

/// Internal representation kept inside storage.
#[derive(Clone, Debug, Serialize, Deserialize, async_graphql::SimpleObject)]
pub struct StoredGame {
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

impl StoredGame {
    pub fn to_summary(&self) -> GameSummary {
        GameSummary {
            game_id: self.game_id,
            white: self.white,
            black: self.black,
            ai_black: self.ai_black,
            board_fen: self.board_fen.clone(),
            moves: self.moves.clone(),
            turn: self.turn,
            status: self.status,
            winner: self.winner,
            created_at: self.created_at,
            updated_at: self.updated_at,
            metadata: self.metadata.clone(),
        }
    }
}

#[ComplexObject]
impl ChainChessState {
    /// Returns all games stored locally; useful for dashboards and explorers.
    pub async fn games(&self) -> Vec<GameSummary> {
        let mut results = Vec::new();
        if let Ok(indices) = self.active_games.indices().await {
            for id in indices {
                if let Ok(Some(game)) = self.active_games.get(&id).await {
                    results.push(game.to_summary());
                }
            }
        }
        results.sort_by_key(|g| g.game_id);
        results
    }

    /// Top leaderboard entries sorted by rating desc.
    pub async fn top_players(&self, limit: Option<usize>) -> Vec<PlayerStats> {
        let mut players = Vec::new();
        if let Ok(indices) = self.leaderboard.indices().await {
            for id in indices {
                if let Ok(Some(stats)) = self.leaderboard.get(&id).await {
                    players.push(stats);
                }
            }
        }
        players.sort_by_key(|p| Reverse(p.rating));
        players.truncate(limit.unwrap_or(10));
        players
    }
}
