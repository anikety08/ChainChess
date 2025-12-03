#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use std::str::FromStr;

use chainchess::{
    ChainChessAbi, ChainChessError, ChainChessResponse, GameStatus, MoveRecord, Operation,
    PlayerColor, PlayerStats,
};
use chess::{Board, BoardStatus, ChessMove, Color, MoveGen, Piece, Square};
use linera_sdk::{
    linera_base_types::{ChainId, WithContractAbi},
    views::{RootView, View},
    Contract, ContractRuntime,
};
use state::{ChainChessState, StoredGame};

const DEFAULT_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MAX_OPEN_GAMES_PER_CHAIN: usize = 64;

pub struct ChainChessContract {
    state: ChainChessState,
    runtime: ContractRuntime<Self>,
}

linera_sdk::contract!(ChainChessContract);

impl WithContractAbi for ChainChessContract {
    type Abi = ChainChessAbi;
}

impl Contract for ChainChessContract {
    type Message = ();
    type InstantiationArgument = ();
    type Parameters = ();
    type EventValue = ();

    async fn load(runtime: ContractRuntime<Self>) -> Self {
        let state = ChainChessState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        Self { state, runtime }
    }

    async fn instantiate(&mut self, _argument: ()) {
        // Ensure parameters are accessed to validate that they are empty.
        self.runtime.application_parameters();
        if *self.state.next_game_id.get() == 0 {
            self.state.next_game_id.set(1);
        }
    }

    async fn execute_operation(&mut self, operation: Operation) -> ChainChessResponse {
        let result = match operation {
            Operation::CreateGame {
                metadata,
                play_vs_ai,
            } => self.create_game(metadata, play_vs_ai).await,
            Operation::JoinGame { game_id } => self.join_game(game_id).await,
            Operation::SubmitMove {
                game_id,
                uci,
                promotion,
            } => self.submit_move(game_id, uci, promotion).await,
            Operation::Resign { game_id } => self.resign(game_id).await,
        };

        match result {
            Ok(response) => response,
            Err(err) => ChainChessResponse::from_error(err),
        }
    }

    async fn store(mut self) {
        self.state.save().await.expect("Failed to save state");
    }

    async fn execute_message(&mut self, _message: Self::Message) {
        // This application currently does not use cross-chain messages.
    }
}

impl ChainChessContract {
    async fn create_game(
        &mut self,
        metadata: Option<String>,
        play_vs_ai: bool,
    ) -> Result<ChainChessResponse, ChainChessError> {
        let creator = self.runtime.chain_id();
        let pending_games = self.list_games_for_chain(creator, false).await;
        if pending_games >= MAX_OPEN_GAMES_PER_CHAIN {
            return Err(ChainChessError::LobbyLimitReached);
        }

        let game_id = *self.state.next_game_id.get();
        self.state.next_game_id.set(game_id + 1);
        let now = self.runtime.system_time();
        let game = StoredGame {
            game_id,
            white: creator,
            black: None,
            ai_black: play_vs_ai,
            board_fen: DEFAULT_FEN.to_string(),
            moves: Vec::new(),
            turn: PlayerColor::White,
            status: if play_vs_ai {
                GameStatus::Active
            } else {
                GameStatus::Lobby
            },
            winner: None,
            created_at: now,
            updated_at: now,
            metadata,
        };
        self.state
            .active_games
            .insert(&game_id, game.clone())
            .expect("insert should not fail");
        Ok(ChainChessResponse::ok(
            "Game lobby created",
            Some(game.to_summary()),
        ))
    }

    async fn join_game(&mut self, game_id: u64) -> Result<ChainChessResponse, ChainChessError> {
        let mut game = self.load_game(game_id).await?;
        if game.ai_black {
            return Err(ChainChessError::NotJoinable(game_id));
        }
        if game.status != GameStatus::Lobby || game.black.is_some() {
            return Err(ChainChessError::NotJoinable(game_id));
        }
        let caller = self.runtime.chain_id();
        if caller == game.white {
            return Err(ChainChessError::NotJoinable(game_id));
        }
        game.black = Some(caller);
        game.status = GameStatus::Active;
        game.updated_at = self.runtime.system_time();
        self.save_game(&game)?;
        Ok(ChainChessResponse::ok(
            "Joined game successfully",
            Some(game.to_summary()),
        ))
    }

    async fn submit_move(
        &mut self,
        game_id: u64,
        uci: String,
        promotion: Option<String>,
    ) -> Result<ChainChessResponse, ChainChessError> {
        let mut game = self.load_game(game_id).await?;
        if game.status == GameStatus::Finished {
            return Err(ChainChessError::AlreadyFinished);
        }
        if game.status == GameStatus::Lobby {
            return Err(ChainChessError::MissingOpponent);
        }

        let caller = self.runtime.chain_id();
        let player_color = if caller == game.white {
            PlayerColor::White
        } else if game.black == Some(caller) {
            PlayerColor::Black
        } else if game.ai_black && game.black.is_none() && caller == game.white {
            PlayerColor::White
        } else {
            return Err(ChainChessError::NotParticipant);
        };

        if player_color != game.turn {
            return Err(ChainChessError::NotYourTurn);
        }

        let move_outcome = Self::apply_uci_move(&game.board_fen, &uci, promotion.as_deref())
            .map_err(|_| {
                ChainChessError::InvalidMove("move is illegal in current position".into())
            })?;

        let now = self.runtime.system_time();
        game.board_fen = move_outcome.fen;
        game.turn = player_color.other();
        game.moves.push(MoveRecord {
            uci: move_outcome.uci,
            san: move_outcome.san,
            played_by: player_color,
            played_at: now,
        });
        game.updated_at = now;

        if let Some(result) = move_outcome.result {
            self.apply_result(&mut game, result).await?;
        }

        if game.ai_black && game.status == GameStatus::Active && game.turn == PlayerColor::Black {
            if let Some(ai_move) = Self::pick_ai_move(&game.board_fen) {
                if let Ok(ai_outcome) = Self::apply_uci_move(&game.board_fen, &ai_move, None) {
                    let ai_time = self.runtime.system_time();
                    game.board_fen = ai_outcome.fen;
                    game.turn = PlayerColor::White;
                    game.moves.push(MoveRecord {
                        uci: ai_outcome.uci,
                        san: ai_outcome.san,
                        played_by: PlayerColor::Black,
                        played_at: ai_time,
                    });
                    game.updated_at = ai_time;
                    if let Some(result) = ai_outcome.result {
                        self.apply_result(&mut game, result).await?;
                    }
                }
            }
        }

        self.save_game(&game)?;
        Ok(ChainChessResponse::ok(
            "Move accepted",
            Some(game.to_summary()),
        ))
    }

    async fn resign(&mut self, game_id: u64) -> Result<ChainChessResponse, ChainChessError> {
        let mut game = self.load_game(game_id).await?;
        if game.status == GameStatus::Finished {
            return Err(ChainChessError::AlreadyFinished);
        }

        let caller = self.runtime.chain_id();
        let player_color = if caller == game.white {
            PlayerColor::White
        } else if game.black == Some(caller) {
            PlayerColor::Black
        } else {
            return Err(ChainChessError::NotParticipant);
        };

        self.apply_result(&mut game, MatchResult::Winner(player_color.other()))
            .await?;
        self.save_game(&game)?;
        Ok(ChainChessResponse::ok(
            "Resigned successfully",
            Some(game.to_summary()),
        ))
    }

    async fn load_game(&self, game_id: u64) -> Result<StoredGame, ChainChessError> {
        self.state
            .active_games
            .get(&game_id)
            .await
            .map_err(|_| ChainChessError::GameNotFound(game_id))?
            .ok_or(ChainChessError::GameNotFound(game_id))
    }

    fn save_game(&mut self, game: &StoredGame) -> Result<(), ChainChessError> {
        self.state
            .active_games
            .insert(&game.game_id, game.clone())
            .map_err(|_| ChainChessError::GameNotFound(game.game_id))
    }

    async fn apply_result(
        &mut self,
        game: &mut StoredGame,
        result: MatchResult,
    ) -> Result<(), ChainChessError> {
        game.status = GameStatus::Finished;
        game.winner = match result {
            MatchResult::Winner(color) => Some(color),
            MatchResult::Draw => None,
        };
        game.updated_at = self.runtime.system_time();

        if let Some(winner) = game.winner {
            if let Some(winner_chain) = self.player_chain(game, winner) {
                self.bump_stats(winner_chain, |stats| {
                    stats.wins += 1;
                    stats.games_played += 1;
                    stats.rating += 10;
                })
                .await;
            }
            if let Some(loser_chain) = self.player_chain(game, winner.other()) {
                self.bump_stats(loser_chain, |stats| {
                    stats.losses += 1;
                    stats.games_played += 1;
                    stats.rating -= 5;
                })
                .await;
            }
        } else {
            for color in [PlayerColor::White, PlayerColor::Black] {
                if let Some(chain) = self.player_chain(game, color) {
                    self.bump_stats(chain, |stats| {
                        stats.draws += 1;
                        stats.games_played += 1;
                        stats.rating += 1;
                    })
                    .await;
                }
            }
        }

        Ok(())
    }

    async fn bump_stats<F>(&mut self, chain_id: ChainId, mut f: F)
    where
        F: FnMut(&mut PlayerStats),
    {
        let mut stats = self
            .state
            .leaderboard
            .get(&chain_id)
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| PlayerStats::new(chain_id));
        f(&mut stats);
        self.state
            .leaderboard
            .insert(&chain_id, stats)
            .expect("leaderboard insert should succeed");
    }

    fn player_chain(&self, game: &StoredGame, color: PlayerColor) -> Option<ChainId> {
        match color {
            PlayerColor::White => Some(game.white),
            PlayerColor::Black => game.black,
        }
    }

    async fn list_games_for_chain(&self, chain: ChainId, finished: bool) -> usize {
        match self.state.active_games.indices().await {
            Ok(indices) => {
                let mut count = 0;
                for id in indices {
                    if let Ok(Some(game)) = self.state.active_games.get(&id).await {
                        if game.white == chain && (finished || game.status != GameStatus::Finished)
                        {
                            count += 1;
                        }
                    }
                }
                count
            }
            Err(_) => 0,
        }
    }

    fn apply_uci_move(
        current_fen: &str,
        raw_uci: &str,
        promotion: Option<&str>,
    ) -> Result<MoveComputation, ()> {
        let fen_board = Board::from_str(current_fen).map_err(|_| ())?;
        let mut uci = raw_uci.to_lowercase();
        if uci.len() == 4 {
            if let Some(promo) = promotion {
                uci.push(promo.chars().next().unwrap_or('q'));
            }
        }
        let chess_move = Self::parse_uci_move(&uci)?;
        if !MoveGen::new_legal(&fen_board).any(|legal| legal == chess_move) {
            return Err(());
        }
        let board_after = fen_board.make_move_new(chess_move);
        let status = board_after.status();
        let result = match status {
            BoardStatus::Ongoing => None,
            BoardStatus::Stalemate => Some(MatchResult::Draw),
            BoardStatus::Checkmate => {
                // In the resulting board it's the opponent's turn but already checkmated.
                let winner = fen_board.side_to_move();
                let player_color = if winner == Color::White {
                    PlayerColor::White
                } else {
                    PlayerColor::Black
                };
                Some(MatchResult::Winner(player_color))
            }
        };
        // Generate SAN notation
        let san = Self::generate_san(&fen_board, chess_move);
        
        Ok(MoveComputation {
            fen: board_after.to_string(),
            uci,
            san: Some(san),
            result,
        })
    }

    fn parse_uci_move(uci: &str) -> Result<ChessMove, ()> {
        if uci.len() < 4 {
            return Err(());
        }
        let from = Square::from_str(&uci[0..2]).map_err(|_| ())?;
        let to = Square::from_str(&uci[2..4]).map_err(|_| ())?;
        let promo_piece = if uci.len() > 4 {
            Some(Self::promotion_piece(uci.chars().last().unwrap_or('q'))?)
        } else {
            None
        };
        Ok(ChessMove::new(from, to, promo_piece))
    }

    fn promotion_piece(letter: char) -> Result<Piece, ()> {
        match letter.to_ascii_lowercase() {
            'q' => Ok(Piece::Queen),
            'r' => Ok(Piece::Rook),
            'b' => Ok(Piece::Bishop),
            'n' => Ok(Piece::Knight),
            _ => Err(()),
        }
    }

    fn pick_ai_move(fen: &str) -> Option<String> {
        let board = Board::from_str(fen).ok()?;
        let mut best_move = None;
        let mut best_score = i32::MIN;
        for mv in MoveGen::new_legal(&board) {
            let score = Self::score_move(&board, mv);
            if score > best_score {
                best_score = score;
                best_move = Some(mv);
            }
        }
        best_move.map(|mv| Self::move_to_uci_string(mv))
    }

    fn score_move(board: &Board, mv: ChessMove) -> i32 {
        let mut score = 0;
        if let Some(piece) = board.piece_on(mv.get_dest()) {
            score += Self::piece_value(piece);
        }
        if mv.get_promotion().is_some() {
            score += 5;
        }
        score += Self::square_bonus(mv.get_dest());
        score
    }

    fn piece_value(piece: Piece) -> i32 {
        match piece {
            Piece::Pawn => 1,
            Piece::Knight | Piece::Bishop => 3,
            Piece::Rook => 5,
            Piece::Queen => 9,
            Piece::King => 0,
        }
    }

    fn square_bonus(square: Square) -> i32 {
        let file = square.get_file().to_index() as i32;
        let rank = square.get_rank().to_index() as i32;
        if (file == 3 || file == 4) && (rank == 3 || rank == 4) {
            2
        } else if (2..=5).contains(&file) && (2..=5).contains(&rank) {
            1
        } else {
            0
        }
    }

    fn move_to_uci_string(mv: ChessMove) -> String {
        let mut result = format!("{}{}", mv.get_source(), mv.get_dest());
        if let Some(promo) = mv.get_promotion() {
            let letter = match promo {
                Piece::Queen => 'q',
                Piece::Rook => 'r',
                Piece::Bishop => 'b',
                Piece::Knight => 'n',
                _ => 'q',
            };
            result.push(letter);
        }
        result
    }

    fn generate_san(board: &Board, mv: ChessMove) -> String {
        // Simple SAN generation - in a production system you'd use a proper chess library
        let from = mv.get_source();
        let to = mv.get_dest();
        let piece = board.piece_on(from);
        
        let piece_char = match piece {
            Some(Piece::King) => 'K',
            Some(Piece::Queen) => 'Q',
            Some(Piece::Rook) => 'R',
            Some(Piece::Bishop) => 'B',
            Some(Piece::Knight) => 'N',
            _ => ' ',
        };
        
        let from_sq = format!("{}", from);
        let to_sq = format!("{}", to);
        
        if let Some(_captured) = board.piece_on(to) {
            if piece_char == ' ' {
                format!("{}{}", from_sq.chars().next().unwrap(), to_sq)
            } else {
                format!("{}x{}", piece_char, to_sq)
            }
        } else if let Some(promo) = mv.get_promotion() {
            let promo_char = match promo {
                Piece::Queen => 'Q',
                Piece::Rook => 'R',
                Piece::Bishop => 'B',
                Piece::Knight => 'N',
                _ => 'Q',
            };
            format!("{}{}={}", from_sq, to_sq, promo_char)
        } else if piece_char != ' ' {
            format!("{}{}", piece_char, to_sq)
        } else {
            format!("{}{}", from_sq, to_sq)
        }
    }
}

enum MatchResult {
    Winner(PlayerColor),
    Draw,
}

struct MoveComputation {
    fen: String,
    uci: String,
    san: Option<String>,
    result: Option<MatchResult>,
}
