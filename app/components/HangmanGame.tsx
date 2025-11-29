import { useState } from "react";

interface Player {
  userId: string;
  userName: string;
  role: string;
}

interface HangmanState {
  word: string;
  guessedLetters: string[];
  wrongGuesses: number;
  maxWrongGuesses: number;
  status: 'waiting_for_word' | 'in_progress' | 'won' | 'lost';
}

interface HangmanGameProps {
  gameId: string;
  players: Player[];
  gameState: HangmanState;
  currentUserId: string;
  onGuessLetter?: (letter: string) => void;
  onSetWord?: (word: string) => void;
  onForfeit: () => void;
  disconnectedPlayers?: string[];
}

export function HangmanGame({
  gameId,
  players,
  gameState,
  currentUserId,
  onGuessLetter,
  onSetWord,
  onForfeit,
  disconnectedPlayers = [],
}: HangmanGameProps) {
  const [wordInput, setWordInput] = useState("");
  const currentPlayer = players.find((p) => p.userId === currentUserId);
  const isWordMaster = currentPlayer?.role === "word_master";
  const wordMaster = players.find((p) => p.role === "word_master");
  const guessers = players.filter((p) => p.role === "guesser");

  // Get masked word (show guessed letters, hide others)
  const getMaskedWord = () => {
    if (!gameState.word) return '';
    
    return gameState.word
      .split('')
      .map(char => {
        if (char === ' ') return '   '; // Show spaces
        if (gameState.guessedLetters.includes(char)) return char;
        return '_';
      })
      .join(' ');
  };

  // Render hangman figure based on wrong guesses
  const renderHangman = () => {
    const stages = [
      // Stage 0: Empty
      `
   +---+
   |   |
       |
       |
       |
       |
  =========`,
      // Stage 1: Head
      `
   +---+
   |   |
   O   |
       |
       |
       |
  =========`,
      // Stage 2: Body
      `
   +---+
   |   |
   O   |
   |   |
       |
       |
  =========`,
      // Stage 3: Left arm
      `
   +---+
   |   |
   O   |
  /|   |
       |
       |
  =========`,
      // Stage 4: Right arm
      `
   +---+
   |   |
   O   |
  /|\\  |
       |
       |
  =========`,
      // Stage 5: Left leg
      `
   +---+
   |   |
   O   |
  /|\\  |
  /    |
       |
  =========`,
      // Stage 6: Right leg (dead)
      `
   +---+
   |   |
   O   |
  /|\\  |
  / \\  |
       |
  =========`,
    ];

    const stageIndex = Math.min(gameState.wrongGuesses, stages.length - 1);
    return stages[stageIndex];
  };

  // Generate alphabet for letter buttons
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const handleLetterClick = (letter: string) => {
    if (onGuessLetter && !gameState.guessedLetters.includes(letter) && gameState.status === 'in_progress') {
      onGuessLetter(letter);
    }
  };

  const handleSubmitWord = () => {
    if (onSetWord && wordInput.trim()) {
      onSetWord(wordInput.trim());
      setWordInput("");
    }
  };

  // Word Master waiting to set word
  if (isWordMaster && gameState.status === 'waiting_for_word') {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Hangman - Word Master</h2>
          
          {/* Players Info */}
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">Players:</p>
            <div className="flex flex-wrap gap-2">
              {players.map((player) => (
                <div key={player.userId} className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded">
                  <div className={`w-2 h-2 rounded-full ${disconnectedPlayers.includes(player.userId) ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {player.userName} {player.role === 'word_master' ? '(You - Word Master)' : '(Guesser)'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Word Input */}
          <div className="bg-blue-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Choose a word for the guessers</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter a word or phrase (letters and spaces only). The guessers will try to guess it!
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={wordInput}
                onChange={(e) => setWordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitWord()}
                placeholder="Enter word or phrase..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-500"
                autoFocus
              />
              <button
                onClick={handleSubmitWord}
                disabled={!wordInput.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Start Game
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onForfeit}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
          >
            Cancel Game
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Game ID: {gameId.substring(0, 8)}...</p>
        </div>
      </div>
    );
  }

  // Guesser waiting for word
  if (!isWordMaster && gameState.status === 'waiting_for_word') {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Hangman - Guesser</h2>
          
          {/* Players Info */}
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">Players:</p>
            <div className="flex flex-wrap gap-2">
              {players.map((player) => (
                <div key={player.userId} className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded">
                  <div className={`w-2 h-2 rounded-full ${disconnectedPlayers.includes(player.userId) ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {player.userName} {player.userId === currentUserId ? '(You)' : ''} - {player.role === 'word_master' ? 'Word Master' : 'Guesser'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-yellow-50 p-6 rounded-lg text-center">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Waiting for Word Master</h3>
            <p className="text-gray-600">
              {wordMaster?.userName} is choosing a word for you to guess...
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onForfeit}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
          >
            Leave Game
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Game ID: {gameId.substring(0, 8)}...</p>
        </div>
      </div>
    );
  }

  // Game in progress or finished
  const getStatusMessage = () => {
    if (gameState.status === 'won') {
      return (
        <span className="text-green-600 font-semibold text-lg">
          🎉 Guessers won! The word was: {gameState.word}
        </span>
      );
    }
    
    if (gameState.status === 'lost') {
      return (
        <span className="text-red-600 font-semibold text-lg">
          💀 Game Over! The word was: {gameState.word}
        </span>
      );
    }

    if (isWordMaster) {
      return (
        <span className="text-gray-600 font-semibold">
          Watching guessers play... The word is: <span className="text-blue-600">{gameState.word}</span>
        </span>
      );
    }

    return (
      <span className="text-blue-600 font-semibold">
        Guess the word! ({gameState.wrongGuesses}/{gameState.maxWrongGuesses} wrong guesses)
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Hangman</h2>
        
        {/* Players Info */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">Players:</p>
          <div className="flex flex-wrap gap-2">
            {players.map((player) => (
              <div key={player.userId} className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded">
                <div className={`w-2 h-2 rounded-full ${disconnectedPlayers.includes(player.userId) ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                <span className="text-sm font-medium text-gray-700">
                  {player.userName} {player.userId === currentUserId ? '(You)' : ''} - {player.role === 'word_master' ? '👑 Word Master' : '🎮 Guesser'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Status Message */}
        <div className="text-center py-3 bg-gray-50 rounded-lg mb-6">
          {getStatusMessage()}
        </div>

        {/* Game Board */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Hangman Figure */}
          <div className="flex flex-col items-center">
            <pre className="font-mono text-sm bg-gray-50 p-4 rounded-lg text-gray-800 whitespace-pre">
              {renderHangman()}
            </pre>
            <p className="mt-2 text-sm text-gray-600">
              Wrong guesses: {gameState.wrongGuesses} / {gameState.maxWrongGuesses}
            </p>
          </div>

          {/* Word and Letters */}
          <div className="flex flex-col items-center justify-center">
            <div className="mb-6">
              <p className="text-3xl font-mono font-bold tracking-wider text-gray-800 text-center">
                {getMaskedWord() || 'Waiting for word...'}
              </p>
            </div>

            {/* Guessed Letters */}
            <div className="w-full">
              <p className="text-sm text-gray-600 mb-2">Guessed letters:</p>
              <div className="flex flex-wrap gap-1">
                {gameState.guessedLetters.length > 0 ? (
                  gameState.guessedLetters.sort().map((letter) => {
                    const isCorrect = gameState.word.includes(letter);
                    return (
                      <span
                        key={letter}
                        className={`px-2 py-1 rounded text-sm font-mono ${
                          isCorrect
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {letter}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-sm text-gray-400 italic">None yet</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Letter Buttons - Only for guessers during active game */}
        {!isWordMaster && gameState.status === 'in_progress' && (
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-3 text-center">Select a letter:</p>
            <div className="grid grid-cols-13 gap-1 max-w-3xl mx-auto">
              {alphabet.map((letter) => {
                const isGuessed = gameState.guessedLetters.includes(letter);
                const isCorrect = isGuessed && gameState.word.includes(letter);
                const isWrong = isGuessed && !gameState.word.includes(letter);

                return (
                  <button
                    key={letter}
                    onClick={() => handleLetterClick(letter)}
                    disabled={isGuessed}
                    className={`
                      px-2 py-2 text-sm font-bold rounded transition
                      ${isGuessed
                        ? isCorrect
                          ? 'bg-green-200 text-green-800 cursor-not-allowed'
                          : 'bg-red-200 text-red-800 cursor-not-allowed'
                        : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
                      }
                    `}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Word Master View During Game */}
        {isWordMaster && gameState.status === 'in_progress' && (
          <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-center text-purple-800">
              You are the Word Master. Watch as the guessers try to solve your word!
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        {(gameState.status === 'won' || gameState.status === 'lost') && (
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium"
          >
            Back to Lobby
          </button>
        )}
        
        {gameState.status === 'in_progress' && (
          <button
            onClick={onForfeit}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
          >
            Forfeit
          </button>
        )}
      </div>

      {/* Game Info */}
      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Game ID: {gameId.substring(0, 8)}...</p>
      </div>
    </div>
  );
}



