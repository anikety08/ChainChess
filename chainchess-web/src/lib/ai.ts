import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

interface MoveScore {
  move: string;
  score: number;
}

export class ChessAI {
  private difficulty: AIDifficulty;

  constructor(difficulty: AIDifficulty = 'medium') {
    this.difficulty = difficulty;
  }

  setDifficulty(difficulty: AIDifficulty) {
    this.difficulty = difficulty;
  }

  getBestMove(game: Chess): string | null {
    const legalMoves = game.moves({ verbose: true });
    if (legalMoves.length === 0) return null;

    switch (this.difficulty) {
      case 'easy':
        return this.getEasyMove(game, legalMoves);
      case 'medium':
        return this.getMediumMove(game, legalMoves);
      case 'hard':
        return this.getHardMove(game, legalMoves);
    }
  }

  private getEasyMove(game: Chess, moves: any[]): string {
    // Easy: Random move, sometimes makes mistakes
    if (Math.random() < 0.3) {
      // 30% chance to make a suboptimal move
      const badMoves = moves.filter((m) => {
        const testGame = new Chess(game.fen());
        testGame.move(m);
        return !this.isGoodMove(testGame, m);
      });
      if (badMoves.length > 0) {
        const randomBad = badMoves[Math.floor(Math.random() * badMoves.length)];
        return randomBad.san;
      }
    }
    const randomMove = moves[Math.floor(Math.random() * moves.length)];
    return randomMove.san;
  }

  private getMediumMove(game: Chess, moves: any[]): string {
    // Medium: Prefers captures and center control
    const scoredMoves: MoveScore[] = moves.map((m) => ({
      move: m.san,
      score: this.scoreMove(game, m),
    }));

    scoredMoves.sort((a, b) => b.score - a.score);
    const topMoves = scoredMoves.slice(0, Math.max(1, Math.floor(scoredMoves.length * 0.3)));
    const selected = topMoves[Math.floor(Math.random() * topMoves.length)];
    return selected.move;
  }

  private getHardMove(game: Chess, moves: any[]): string {
    // Hard: Minimax with depth 3
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      const testGame = new Chess(game.fen());
      testGame.move(move);
      const score = this.minimax(testGame, 3, false, -Infinity, Infinity);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove.san;
  }

  private minimax(game: Chess, depth: number, maximizing: boolean, alpha: number, beta: number): number {
    if (depth === 0 || game.isGameOver()) {
      return this.evaluatePosition(game);
    }

    const moves = game.moves({ verbose: true });
    if (moves.length === 0) {
      return this.evaluatePosition(game);
    }

    if (maximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const testGame = new Chess(game.fen());
        testGame.move(move);
        const evaluation = this.minimax(testGame, depth - 1, false, alpha, beta);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const testGame = new Chess(game.fen());
        testGame.move(move);
        const evaluation = this.minimax(testGame, depth - 1, true, alpha, beta);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  private evaluatePosition(game: Chess): number {
    if (game.isCheckmate()) {
      return game.turn() === 'w' ? -10000 : 10000;
    }
    if (game.isDraw() || game.isStalemate()) {
      return 0;
    }

    let score = 0;
    const board = game.board();

    // Piece values
    const pieceValues: { [key: string]: number } = {
      p: 1,
      n: 3,
      b: 3,
      r: 5,
      q: 9,
      k: 100,
    };

    // Evaluate material
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (piece) {
          const value = pieceValues[piece.type] || 0;
          score += piece.color === 'w' ? value : -value;
        }
      }
    }

    // Center control bonus
    const centerSquares: Square[] = ['e4', 'e5', 'd4', 'd5'];
    for (const square of centerSquares) {
      const piece = game.get(square);
      if (piece) {
        score += piece.color === 'w' ? 0.5 : -0.5;
      }
    }

    // Mobility bonus
    const currentTurn = game.turn();
    const whiteMoves = currentTurn === 'w' ? game.moves().length : 0;
    const blackMoves = currentTurn === 'b' ? game.moves().length : 0;
    score += (whiteMoves - blackMoves) * 0.1;

    return score;
  }

  private scoreMove(game: Chess, move: any): number {
    let score = 0;
    const testGame = new Chess(game.fen());
    const captured = testGame.get(move.to);
    testGame.move(move);

    // Capture bonus
    if (captured) {
      const pieceValues: { [key: string]: number } = {
        p: 1,
        n: 3,
        b: 3,
        r: 5,
        q: 9,
      };
      score += (pieceValues[captured.type] || 0) * 10;
    }

    // Center control
    const centerSquares = ['e4', 'e5', 'd4', 'd5'];
    if (centerSquares.includes(move.to)) {
      score += 2;
    }

    // Check bonus
    if (testGame.isCheck()) {
      score += 5;
    }

    // Checkmate bonus
    if (testGame.isCheckmate()) {
      score += 1000;
    }

    return score;
  }

  private isGoodMove(game: Chess, move: any): boolean {
    const testGame = new Chess(game.fen());
    testGame.move(move);
    return !testGame.isCheckmate() && !testGame.isCheck();
  }
}

