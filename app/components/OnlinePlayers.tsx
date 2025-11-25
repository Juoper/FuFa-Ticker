import { useState } from "react";

interface User {
  id: string;
  name: string;
}

interface Challenge {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string | string[]; // Can be single user or array for multiplayer
  toUserIds?: string[]; // For multiplayer challenges
  gameType: string;
}

interface OnlinePlayersProps {
  users: User[];
  currentUserId: string;
  currentUserName: string;
  incomingChallenges: Challenge[];
  outgoingChallenges: Challenge[];
  onSendChallenge: (toUserIds: string | string[], gameType: string) => void;
  onAcceptChallenge: (challengeId: string) => void;
  onDeclineChallenge: (challengeId: string) => void;
  isInGame: boolean;
}

export function OnlinePlayers({
  users,
  currentUserId,
  currentUserName,
  incomingChallenges,
  outgoingChallenges,
  onSendChallenge,
  onAcceptChallenge,
  onDeclineChallenge,
  isInGame,
}: OnlinePlayersProps) {
  const [selectedGameType, setSelectedGameType] = useState<'tictactoe' | 'hangman' | 'millionaire'>('tictactoe');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [isSelectingPlayers, setIsSelectingPlayers] = useState(false);
  
  // Filter out current user
  const otherUsers = users.filter((user) => user.id !== currentUserId);

  const handleGameTypeChange = (gameType: 'tictactoe' | 'hangman' | 'millionaire') => {
    setSelectedGameType(gameType);
    setSelectedPlayers([]);
    setIsSelectingPlayers(false);
  };

  const togglePlayerSelection = (userId: string) => {
    setSelectedPlayers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSendMultiplayerChallenge = () => {
    if (selectedPlayers.length > 0) {
      onSendChallenge(selectedPlayers, selectedGameType);
      setSelectedPlayers([]);
      setIsSelectingPlayers(false);
    }
  };

  const handleQuickChallenge = (userId: string) => {
    if (selectedGameType === 'hangman' || selectedGameType === 'millionaire') {
      // For multiplayer games, go into selection mode
      setIsSelectingPlayers(true);
      setSelectedPlayers([userId]);
    } else {
      // For tictactoe, send immediately (1v1)
      onSendChallenge(userId, selectedGameType);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Online Players</h2>

      {/* Game Type Selector */}
      {!isInGame && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 mb-2">Select Game Type:</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleGameTypeChange('tictactoe')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedGameType === 'tictactoe'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              Tic-Tac-Toe (1v1)
            </button>
            <button
              onClick={() => handleGameTypeChange('hangman')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedGameType === 'hangman'
                  ? 'bg-purple-500 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              Hangman (2-8)
            </button>
            <button
              onClick={() => handleGameTypeChange('millionaire')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedGameType === 'millionaire'
                  ? 'bg-yellow-500 text-blue-950'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              Millionär (2-10)
            </button>
          </div>
          
          {/* Multiplayer Selection Mode - Hangman */}
          {isSelectingPlayers && selectedGameType === 'hangman' && (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-purple-800">
                  Select 1-7 players for Hangman ({selectedPlayers.length} selected)
                </p>
                <button
                  onClick={() => {
                    setIsSelectingPlayers(false);
                    setSelectedPlayers([]);
                  }}
                  className="text-xs text-purple-600 hover:text-purple-800"
                >
                  Cancel
                </button>
              </div>
              <button
                onClick={handleSendMultiplayerChallenge}
                disabled={selectedPlayers.length === 0 || selectedPlayers.length > 7}
                className="w-full px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Send Challenge to {selectedPlayers.length} Player{selectedPlayers.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}
          
          {/* Multiplayer Selection Mode - Millionaire */}
          {isSelectingPlayers && selectedGameType === 'millionaire' && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-400 rounded">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-yellow-900">
                  Select 1-10 players for Millionär ({selectedPlayers.length} selected)
                </p>
                <button
                  onClick={() => {
                    setIsSelectingPlayers(false);
                    setSelectedPlayers([]);
                  }}
                  className="text-xs text-yellow-700 hover:text-yellow-900"
                >
                  Cancel
                </button>
              </div>
              <button
                onClick={handleSendMultiplayerChallenge}
                disabled={selectedPlayers.length === 0 || selectedPlayers.length > 10}
                className="w-full px-4 py-2 bg-yellow-500 text-blue-950 rounded-lg hover:bg-yellow-600 transition font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Send Challenge to {selectedPlayers.length} Player{selectedPlayers.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Incoming Challenges */}
      {incomingChallenges.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-yellow-800 mb-2">
            Incoming Challenges
          </h3>
          {incomingChallenges.map((challenge) => {
            const isMultiplayer = Array.isArray(challenge.toUserIds) && challenge.toUserIds.length > 1;
            const otherPlayers = isMultiplayer 
              ? users.filter(u => challenge.toUserIds?.includes(u.id) && u.id !== currentUserId)
              : [];
            
            return (
              <div
                key={challenge.id}
                className="flex items-center justify-between bg-white p-3 rounded mb-2"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {challenge.fromUserName}
                  </p>
                  <p className="text-sm text-gray-600">
                    wants to play {challenge.gameType}
                    {isMultiplayer && otherPlayers.length > 0 && (
                      <span className="text-xs ml-1">
                        (with {otherPlayers.map(u => u.name).join(', ')})
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAcceptChallenge(challenge.id)}
                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => onDeclineChallenge(challenge.id)}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                  >
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Outgoing Challenges */}
      {outgoingChallenges.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">
            Pending Challenges
          </h3>
          {outgoingChallenges.map((challenge) => {
            const isMultiplayer = Array.isArray(challenge.toUserIds) && challenge.toUserIds.length > 1;
            const targetUsers = isMultiplayer
              ? users.filter(u => challenge.toUserIds?.includes(u.id))
              : [users.find((u) => u.id === challenge.toUserId)].filter(Boolean);
            
            return (
              <div
                key={challenge.id}
                className="flex items-center justify-between bg-white p-3 rounded mb-2"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    Challenged {targetUsers.map(u => u?.name).join(', ') || "Unknown"}
                  </p>
                  <p className="text-sm text-gray-600">
                    {challenge.gameType} - Waiting for response...
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Online Users List */}
      <div className="space-y-2">
        {otherUsers.length === 0 ? (
          <p className="text-gray-500 italic">No other players online</p>
        ) : (
          otherUsers.map((user) => {
            const hasPendingChallenge = outgoingChallenges.some(
              (c) => c.toUserId === user.id || c.toUserIds?.includes(user.id)
            );
            const hasIncomingChallenge = incomingChallenges.some(
              (c) => c.fromUserId === user.id
            );
            const isSelected = selectedPlayers.includes(user.id);

            return (
              <div
                key={user.id}
                className={`flex items-center justify-between p-3 rounded-lg transition ${
                  isSelectingPlayers && (selectedGameType === 'hangman' || selectedGameType === 'millionaire')
                    ? isSelected
                      ? selectedGameType === 'millionaire'
                        ? 'bg-yellow-100 border-2 border-yellow-500'
                        : 'bg-purple-100 border-2 border-purple-500'
                      : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
                onClick={() => {
                  if (isSelectingPlayers && (selectedGameType === 'hangman' || selectedGameType === 'millionaire') && !hasPendingChallenge && !hasIncomingChallenge) {
                    togglePlayerSelection(user.id);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  {isSelectingPlayers && (selectedGameType === 'hangman' || selectedGameType === 'millionaire') && !hasPendingChallenge && !hasIncomingChallenge ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePlayerSelection(user.id)}
                      className={`w-4 h-4 cursor-pointer ${
                        selectedGameType === 'millionaire' ? 'text-yellow-600' : 'text-purple-600'
                      }`}
                    />
                  ) : (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  )}
                  <span className="font-medium text-gray-800">{user.name}</span>
                </div>
                
                {!isInGame && !hasPendingChallenge && !hasIncomingChallenge && !isSelectingPlayers && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleQuickChallenge(user.id)}
                      className={`px-4 py-2 rounded hover:opacity-90 transition text-sm font-medium ${
                        selectedGameType === 'tictactoe'
                          ? 'bg-blue-500 text-white'
                          : selectedGameType === 'hangman'
                          ? 'bg-purple-500 text-white'
                          : 'bg-yellow-500 text-blue-950'
                      }`}
                    >
                      Challenge
                    </button>
                  </div>
                )}

                {hasPendingChallenge && (
                  <span className="text-sm text-gray-500 italic">
                    Challenge sent
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {isInGame && (
        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm text-purple-800 text-center">
            You're currently in a game. Finish it before challenging others.
          </p>
        </div>
      )}
    </div>
  );
}
