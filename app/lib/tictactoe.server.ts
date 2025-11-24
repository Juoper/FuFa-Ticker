import { prisma as db } from "./db.server";

export type TicTacToeBoard = string[]; // 9 elements: 'X', 'O', or ''
export type TicTacToeSymbol = 'X' | 'O';

export interface TicTacToeState {
  board: TicTacToeBoard;
  currentTurn: TicTacToeSymbol;
  winner: TicTacToeSymbol | 'draw' | null;
}

/**
 * Initialize an empty tic-tac-toe board
 */
export function initializeBoard(): TicTacToeBoard {
  return Array(9).fill('');
}

/**
 * Initialize a new tic-tac-toe game state
 */
export function initializeGameState(): TicTacToeState {
  return {
    board: initializeBoard(),
    currentTurn: 'X', // X always goes first
    winner: null,
  };
}

/**
 * Validate if a move is legal
 */
export function validateMove(
  board: TicTacToeBoard,
  position: number,
  symbol: TicTacToeSymbol
): boolean {
  // Check if position is valid (0-8)
  if (position < 0 || position > 8) {
    return false;
  }

  // Check if position is empty
  if (board[position] !== '') {
    return false;
  }

  return true;
}

/**
 * Apply a move to the board
 */
export function applyMove(
  board: TicTacToeBoard,
  position: number,
  symbol: TicTacToeSymbol
): TicTacToeBoard {
  const newBoard = [...board];
  newBoard[position] = symbol;
  return newBoard;
}

/**
 * Check if there's a winner or draw
 * Returns 'X', 'O', 'draw', or null
 */
export function checkWinner(board: TicTacToeBoard): TicTacToeSymbol | 'draw' | null {
  // All possible winning combinations
  const winPatterns = [
    [0, 1, 2], // Top row
    [3, 4, 5], // Middle row
    [6, 7, 8], // Bottom row
    [0, 3, 6], // Left column
    [1, 4, 7], // Middle column
    [2, 5, 8], // Right column
    [0, 4, 8], // Diagonal top-left to bottom-right
    [2, 4, 6], // Diagonal top-right to bottom-left
  ];

  // Check each winning pattern
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as TicTacToeSymbol;
    }
  }

  // Check for draw (board is full with no winner)
  if (board.every(cell => cell !== '')) {
    return 'draw';
  }

  // Game is still in progress
  return null;
}

/**
 * Get the opposite symbol
 */
export function getOppositeSymbol(symbol: TicTacToeSymbol): TicTacToeSymbol {
  return symbol === 'X' ? 'O' : 'X';
}

/**
 * Save a completed game to the database
 */
export async function saveCompletedGame(
  gameId: string,
  player1Id: string,
  player2Id: string,
  finalState: TicTacToeState,
  moveCount: number
): Promise<void> {
  const winnerId = finalState.winner === 'X' ? player1Id : 
                   finalState.winner === 'O' ? player2Id : null;
  
  // Update the game record
  await db.game.update({
    where: { id: gameId },
    data: {
      status: 'completed',
      gameState: JSON.stringify(finalState),
      currentTurn: null,
      completedAt: new Date(),
    },
  });

  // Update player placements
  if (finalState.winner !== 'draw') {
    // Winner gets placement 1, loser gets placement 2
    const loserId = winnerId === player1Id ? player2Id : player1Id;
    
    await db.gamePlayer.updateMany({
      where: { gameId, userId: winnerId! },
      data: { placement: 1 },
    });
    
    await db.gamePlayer.updateMany({
      where: { gameId, userId: loserId },
      data: { placement: 2 },
    });
  } else {
    // Draw - both get placement 1
    await db.gamePlayer.updateMany({
      where: { gameId },
      data: { placement: 1 },
    });
  }

  // Update game stats for both players
  await updateGameStats(player1Id, 'tictactoe', finalState.winner === 'X' ? 'win' : finalState.winner === 'draw' ? 'draw' : 'loss');
  await updateGameStats(player2Id, 'tictactoe', finalState.winner === 'O' ? 'win' : finalState.winner === 'draw' ? 'draw' : 'loss');
}

/**
 * Update game statistics for a player
 */
export async function updateGameStats(
  userId: string,
  gameType: string,
  result: 'win' | 'loss' | 'draw'
): Promise<void> {
  const existing = await db.gameStats.findUnique({
    where: { userId_gameType: { userId, gameType } },
  });

  if (existing) {
    await db.gameStats.update({
      where: { userId_gameType: { userId, gameType } },
      data: {
        wins: result === 'win' ? existing.wins + 1 : existing.wins,
        losses: result === 'loss' ? existing.losses + 1 : existing.losses,
        draws: result === 'draw' ? existing.draws + 1 : existing.draws,
        totalGames: existing.totalGames + 1,
      },
    });
  } else {
    await db.gameStats.create({
      data: {
        userId,
        gameType,
        wins: result === 'win' ? 1 : 0,
        losses: result === 'loss' ? 1 : 0,
        draws: result === 'draw' ? 1 : 0,
        totalGames: 1,
      },
    });
  }
}

/**
 * Get game statistics for a player
 */
export async function getGameStats(userId: string, gameType: string) {
  const stats = await db.gameStats.findUnique({
    where: { userId_gameType: { userId, gameType } },
  });

  if (!stats) {
    return {
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      winRate: 0,
    };
  }

  const winRate = stats.totalGames > 0 
    ? (stats.wins / stats.totalGames) * 100 
    : 0;

  return {
    ...stats,
    winRate: Math.round(winRate * 10) / 10, // Round to 1 decimal place
  };
}
