import { prisma as db } from "./db.server";

export interface HangmanState {
  word: string; // The word to guess (only known to word master)
  guessedLetters: string[]; // Letters that have been guessed
  wrongGuesses: number; // Number of incorrect guesses
  maxWrongGuesses: number; // Maximum wrong guesses before loss (typically 6)
  status: 'waiting_for_word' | 'in_progress' | 'won' | 'lost';
}

/**
 * Initialize a new hangman game state (before word is set)
 */
export function initializeGameState(): HangmanState {
  return {
    word: '', // Will be set by word master
    guessedLetters: [],
    wrongGuesses: 0,
    maxWrongGuesses: 6,
    status: 'waiting_for_word',
  };
}

/**
 * Set the word for the hangman game
 */
export function setWord(state: HangmanState, word: string): HangmanState {
  const normalizedWord = word.toUpperCase().trim();
  
  // Validate word (only letters and spaces allowed)
  if (!/^[A-Z\s]+$/.test(normalizedWord)) {
    throw new Error("Word can only contain letters and spaces");
  }
  
  if (normalizedWord.length < 2) {
    throw new Error("Word must be at least 2 characters long");
  }
  
  return {
    ...state,
    word: normalizedWord,
    status: 'in_progress',
  };
}

/**
 * Get the masked word (show guessed letters, hide others)
 */
export function getMaskedWord(state: HangmanState): string {
  if (!state.word) return '';
  
  return state.word
    .split('')
    .map(char => {
      if (char === ' ') return ' ';
      if (state.guessedLetters.includes(char)) return char;
      return '_';
    })
    .join('');
}

/**
 * Validate if a guess is legal
 */
export function validateGuess(state: HangmanState, letter: string): boolean {
  // Check if game is in progress
  if (state.status !== 'in_progress') {
    return false;
  }
  
  // Normalize letter
  const normalizedLetter = letter.toUpperCase().trim();
  
  // Check if single letter
  if (normalizedLetter.length !== 1) {
    return false;
  }
  
  // Check if it's a letter
  if (!/^[A-Z]$/.test(normalizedLetter)) {
    return false;
  }
  
  // Check if already guessed
  if (state.guessedLetters.includes(normalizedLetter)) {
    return false;
  }
  
  return true;
}

/**
 * Apply a letter guess to the game state
 */
export function applyGuess(state: HangmanState, letter: string): HangmanState {
  const normalizedLetter = letter.toUpperCase().trim();
  
  const newGuessedLetters = [...state.guessedLetters, normalizedLetter];
  const isCorrect = state.word.includes(normalizedLetter);
  const newWrongGuesses = isCorrect ? state.wrongGuesses : state.wrongGuesses + 1;
  
  const newState: HangmanState = {
    ...state,
    guessedLetters: newGuessedLetters,
    wrongGuesses: newWrongGuesses,
    status: state.status,
  };
  
  // Check game status
  newState.status = checkGameStatus(newState);
  
  return newState;
}

/**
 * Check if the game is won, lost, or still in progress
 */
export function checkGameStatus(state: HangmanState): HangmanState['status'] {
  // Check if lost
  if (state.wrongGuesses >= state.maxWrongGuesses) {
    return 'lost';
  }
  
  // Check if won (all letters guessed)
  const allLettersGuessed = state.word
    .split('')
    .filter(char => char !== ' ') // Ignore spaces
    .every(char => state.guessedLetters.includes(char));
  
  if (allLettersGuessed && state.word) {
    return 'won';
  }
  
  if (!state.word) {
    return 'waiting_for_word';
  }
  
  return 'in_progress';
}

/**
 * Save a completed game to the database
 */
export async function saveCompletedGame(
  gameId: string,
  wordMasterId: string,
  guesserIds: string[],
  finalState: HangmanState
): Promise<void> {
  const won = finalState.status === 'won';
  
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
  // Word master always gets placement based on if guessers won/lost
  // If guessers won, word master gets placement 2, guessers get 1
  // If guessers lost, word master gets placement 1, guessers get 2
  
  if (won) {
    // Guessers won
    await db.gamePlayer.updateMany({
      where: { gameId, userId: { in: guesserIds } },
      data: { placement: 1 },
    });
    
    await db.gamePlayer.updateMany({
      where: { gameId, userId: wordMasterId },
      data: { placement: 2 },
    });
  } else {
    // Guessers lost (word master wins)
    await db.gamePlayer.updateMany({
      where: { gameId, userId: { in: guesserIds } },
      data: { placement: 2 },
    });
    
    await db.gamePlayer.updateMany({
      where: { gameId, userId: wordMasterId },
      data: { placement: 1 },
    });
  }

  // Update game stats
  for (const guesserId of guesserIds) {
    await updateGameStats(guesserId, 'hangman', won ? 'win' : 'loss');
  }
  
  // Word master stats are inverse of guessers
  await updateGameStats(wordMasterId, 'hangman', won ? 'loss' : 'win');
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

