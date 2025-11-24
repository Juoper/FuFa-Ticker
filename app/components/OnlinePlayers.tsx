interface User {
  id: string;
  name: string;
}

interface Challenge {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  gameType: string;
}

interface OnlinePlayersProps {
  users: User[];
  currentUserId: string;
  currentUserName: string;
  incomingChallenges: Challenge[];
  outgoingChallenges: Challenge[];
  onSendChallenge: (toUserId: string, gameType: string) => void;
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
  // Filter out current user
  const otherUsers = users.filter((user) => user.id !== currentUserId);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Online Players</h2>

      {/* Incoming Challenges */}
      {incomingChallenges.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-yellow-800 mb-2">
            Incoming Challenges
          </h3>
          {incomingChallenges.map((challenge) => (
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
          ))}
        </div>
      )}

      {/* Outgoing Challenges */}
      {outgoingChallenges.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">
            Pending Challenges
          </h3>
          {outgoingChallenges.map((challenge) => {
            const targetUser = users.find((u) => u.id === challenge.toUserId);
            return (
              <div
                key={challenge.id}
                className="flex items-center justify-between bg-white p-3 rounded mb-2"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    Challenged {targetUser?.name || "Unknown"}
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
              (c) => c.toUserId === user.id
            );
            const hasIncomingChallenge = incomingChallenges.some(
              (c) => c.fromUserId === user.id
            );

            return (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="font-medium text-gray-800">{user.name}</span>
                </div>
                
                {!isInGame && !hasPendingChallenge && !hasIncomingChallenge && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSendChallenge(user.id, "tictactoe")}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium"
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
