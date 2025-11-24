interface Player {
  userId: string;
  userName: string;
  role: string;
}

interface TicTacToeState {
  board: string[];
  currentTurn: 'X' | 'O';
  winner: 'X' | 'O' | 'draw' | null;
}

interface TicTacToeGameProps {
  gameId: string;
  players: Player[];
  gameState: TicTacToeState;
  currentUserId: string;
  currentTurn: string | null;
  onMove: (position: number) => void;
  onForfeit: () => void;
  disconnectedPlayers?: string[];
}

export function TicTacToeGame({
  gameId,
  players,
  gameState,
  currentUserId,
  currentTurn,
  onMove,
  onForfeit,
  disconnectedPlayers = [],
}: TicTacToeGameProps) {
  const currentPlayer = players.find((p) => p.userId === currentUserId);
  const opponent = players.find((p) => p.userId !== currentUserId);
  const isMyTurn = currentTurn === currentUserId;
  const mySymbol = currentPlayer?.role || '';
  const opponentSymbol = opponent?.role || '';

  const isOpponentDisconnected = opponent && disconnectedPlayers.includes(opponent.userId);

  const renderCell = (index: number) => {
    const value = gameState.board[index];
    const isEmpty = value === '';

    return (
      <button
        key={index}
        onClick={() => {
          if (isEmpty && isMyTurn && !gameState.winner) {
            onMove(index);
          }
        }}
        disabled={!isEmpty || !isMyTurn || !!gameState.winner}
        className={`
          w-24 h-24 border-2 border-gray-300 text-4xl font-bold
          flex items-center justify-center
          transition-all duration-200
          ${isEmpty && isMyTurn && !gameState.winner
            ? 'hover:bg-blue-50 cursor-pointer hover:border-blue-400'
            : 'cursor-not-allowed'
          }
          ${value === 'X' ? 'text-blue-600' : 'text-red-600'}
        `}
      >
        {value}
      </button>
    );
  };

  const getStatusMessage = () => {
    if (gameState.winner) {
      if (gameState.winner === 'draw') {
        return <span className="text-yellow-600 font-semibold">It's a draw!</span>;
      }
      const winnerPlayer = players.find((p) => p.role === gameState.winner);
      const isWinner = winnerPlayer?.userId === currentUserId;
      return (
        <span className={`font-semibold ${isWinner ? 'text-green-600' : 'text-red-600'}`}>
          {isWinner ? '🎉 You won!' : `${winnerPlayer?.userName} won!`}
        </span>
      );
    }

    if (isOpponentDisconnected) {
      return (
        <span className="text-orange-600 font-semibold">
          {opponent?.userName} disconnected. Waiting for reconnection...
        </span>
      );
    }

    if (isMyTurn) {
      return <span className="text-blue-600 font-semibold">Your turn ({mySymbol})</span>;
    }

    return (
      <span className="text-gray-600 font-semibold">
        Waiting for {opponent?.userName} ({opponentSymbol})...
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Tic-Tac-Toe</h2>
        
        {/* Players Info */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${disconnectedPlayers.includes(currentUserId) ? 'bg-orange-500' : 'bg-green-500'}`}></div>
            <span className="font-medium text-gray-700">
              {currentPlayer?.userName} ({mySymbol})
            </span>
          </div>
          <span className="text-gray-400 font-bold">VS</span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">
              {opponent?.userName} ({opponentSymbol})
            </span>
            <div className={`w-3 h-3 rounded-full ${isOpponentDisconnected ? 'bg-orange-500' : 'bg-green-500'}`}></div>
          </div>
        </div>

        {/* Status Message */}
        <div className="text-center py-3 bg-gray-50 rounded-lg">
          {getStatusMessage()}
        </div>
      </div>

      {/* Game Board */}
      <div className="flex justify-center mb-6">
        <div className="grid grid-cols-3 gap-2">
          {gameState.board.map((_, index) => renderCell(index))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        {gameState.winner && (
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium"
          >
            Back to Lobby
          </button>
        )}
        
        {!gameState.winner && (
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
