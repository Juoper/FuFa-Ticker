import { useState, useCallback } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/games";
import { requireUser } from "~/lib/session.server";
import { useWebSocket, type WebSocketMessage } from "~/hooks/useWebSocket";
import { OnlinePlayers } from "~/components/OnlinePlayers";
import { TicTacToeGame } from "~/components/TicTacToeGame";
import { HangmanGame } from "~/components/HangmanGame";
import { MillionaireGame } from "~/components/MillionaireGame";
import { GameStats } from "~/components/GameStats";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { user };
}

interface User {
  id: string;
  name: string;
}

interface Challenge {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string | string[];
  toUserIds?: string[];
  gameType: string;
}

interface Player {
  userId: string;
  userName: string;
  role: string;
}

interface GameState {
  gameId: string;
  gameType: string;
  players: Player[];
  state: any;
  currentTurn: string | null;
  disconnectedPlayers: string[];
}

export default function Games() {
  const { user } = useLoaderData<typeof loader>();
  
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [incomingChallenges, setIncomingChallenges] = useState<Challenge[]>([]);
  const [outgoingChallenges, setOutgoingChallenges] = useState<Challenge[]>([]);
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [gameMessage, setGameMessage] = useState<string>("");

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    console.log("Received message:", message.type, message.data);
    
    switch (message.type) {
      case "online_users":
        setOnlineUsers(message.data.users || []);
        break;

      case "challenge_sent":
        setOutgoingChallenges((prev) => [
          ...prev,
          {
            id: message.data.challengeId,
            fromUserId: user.id,
            fromUserName: user.name,
            toUserId: message.data.toUserIds || message.data.toUserId,
            toUserIds: message.data.toUserIds,
            gameType: message.data.gameType,
          },
        ]);
        break;

      case "challenge_received":
        setIncomingChallenges((prev) => [
          ...prev,
          {
            id: message.data.challengeId,
            fromUserId: message.data.fromUserId,
            fromUserName: message.data.fromUserName,
            toUserId: message.data.toUserIds || user.id,
            toUserIds: message.data.toUserIds,
            gameType: message.data.gameType,
          },
        ]);
        break;

      case "challenge_declined":
        setOutgoingChallenges((prev) =>
          prev.filter((c) => c.id !== message.data.challengeId)
        );
        setGameMessage("Challenge declined");
        setTimeout(() => setGameMessage(""), 3000);
        break;

      case "challenge_expired":
        setOutgoingChallenges((prev) =>
          prev.filter((c) => c.id !== message.data.challengeId)
        );
        setGameMessage("Challenge expired");
        setTimeout(() => setGameMessage(""), 3000);
        break;

      case "challenge_cancelled":
        setIncomingChallenges((prev) =>
          prev.filter((c) => c.id !== message.data.challengeId)
        );
        break;

      case "challenge_error":
        setGameMessage(message.data.message);
        setTimeout(() => setGameMessage(""), 3000);
        break;

      case "game_start":
        setCurrentGame({
          gameId: message.data.gameId,
          gameType: message.data.gameType,
          players: message.data.players,
          state: message.data.state,
          currentTurn: message.data.currentTurn,
          disconnectedPlayers: [],
        });
        setIncomingChallenges([]);
        setOutgoingChallenges([]);
        break;

      case "game_update":
        setCurrentGame((prev) => {
          if (prev && prev.gameId === message.data.gameId) {
            return {
              ...prev,
              state: message.data.state,
              currentTurn: message.data.currentTurn,
            };
          }
          return prev;
        });
        break;

      case "game_over":
        setCurrentGame((prev) => {
          if (prev && prev.gameId === message.data.gameId) {
            return {
              ...prev,
              state: message.data.state || prev.state,
            };
          }
          return prev;
        });
        break;

      case "game_state":
        // Reconnection - restore game state
        setCurrentGame({
          gameId: message.data.gameId,
          gameType: message.data.gameType,
          players: message.data.players,
          state: message.data.state,
          currentTurn: message.data.currentTurn || null,
          disconnectedPlayers: [],
        });
        break;

      case "player_disconnected":
        setCurrentGame((prev) => {
          if (prev && prev.gameId === message.data.gameId) {
            return {
              ...prev,
              disconnectedPlayers: [
                ...prev.disconnectedPlayers,
                message.data.userId,
              ],
            };
          }
          return prev;
        });
        break;

      case "player_reconnected":
        setCurrentGame((prev) => {
          if (prev && prev.gameId === message.data.gameId) {
            return {
              ...prev,
              disconnectedPlayers: prev.disconnectedPlayers.filter(
                (id) => id !== message.data.userId
              ),
            };
          }
          return prev;
        });
        break;

      case "game_error":
        setGameMessage(message.data.message);
        setTimeout(() => setGameMessage(""), 3000);
        break;
    }
  }, [user.id, user.name]);

  const { isConnected, sendMessage } = useWebSocket(
    handleWebSocketMessage,
    user.id,
    user.name
  );

  const handleSendChallenge = (toUserIds: string | string[], gameType: string) => {
    sendMessage("send_challenge", {
      fromUserId: user.id,
      fromUserName: user.name,
      toUserIds,
      gameType,
    });
  };

  const handleAcceptChallenge = (challengeId: string) => {
    sendMessage("challenge_response", {
      challengeId,
      accepted: true,
      userId: user.id,
    });
  };

  const handleDeclineChallenge = (challengeId: string) => {
    sendMessage("challenge_response", {
      challengeId,
      accepted: false,
      userId: user.id,
    });
    setIncomingChallenges((prev) => prev.filter((c) => c.id !== challengeId));
  };

  const handleGameMove = (position: number) => {
    if (currentGame) {
      sendMessage("game_move", {
        gameId: currentGame.gameId,
        userId: user.id,
        move: { position },
      });
    }
  };

  const handleSetWord = (word: string) => {
    if (currentGame) {
      sendMessage("set_word", {
        gameId: currentGame.gameId,
        userId: user.id,
        word,
      });
    }
  };

  const handleGuessLetter = (letter: string) => {
    if (currentGame) {
      sendMessage("guess_letter", {
        gameId: currentGame.gameId,
        userId: user.id,
        letter,
      });
    }
  };

  const handleMillionaireAnswer = (answer: string) => {
    if (currentGame) {
      sendMessage("millionaire_answer", {
        gameId: currentGame.gameId,
        userId: user.id,
        answer,
      });
    }
  };

  const handleUseLifeline = (lifeline: string) => {
    if (currentGame) {
      sendMessage("use_lifeline", {
        gameId: currentGame.gameId,
        userId: user.id,
        lifeline,
      });
    }
  };

  const handleMillionaireWalkAway = () => {
    if (currentGame) {
      sendMessage("millionaire_walk_away", {
        gameId: currentGame.gameId,
        userId: user.id,
      });
    }
  };

  const handleForfeit = () => {
    if (currentGame) {
      if (confirm("Are you sure you want to forfeit this game?")) {
        sendMessage("forfeit_game", {
          gameId: currentGame.gameId,
          userId: user.id,
        });
        setCurrentGame(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Game Lobby</h1>
              <p className="text-sm text-gray-600 mt-1">
                Welcome, <span className="font-medium">{user.name}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  isConnected ? "bg-green-50" : "bg-red-50"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full ${
                    isConnected ? "bg-green-500" : "bg-red-500"
                  }`}
                ></div>
                <span
                  className={`text-sm font-medium ${
                    isConnected ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      {gameMessage && (
        <div className="container mx-auto px-4 mt-4">
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
            {gameMessage}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {currentGame ? (
          /* In Game View */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {currentGame.gameType === "tictactoe" && (
                <TicTacToeGame
                  gameId={currentGame.gameId}
                  players={currentGame.players}
                  gameState={currentGame.state}
                  currentUserId={user.id}
                  currentTurn={currentGame.currentTurn}
                  onMove={handleGameMove}
                  onForfeit={handleForfeit}
                  disconnectedPlayers={currentGame.disconnectedPlayers}
                />
              )}
              {currentGame.gameType === "hangman" && (
                <HangmanGame
                  gameId={currentGame.gameId}
                  players={currentGame.players}
                  gameState={currentGame.state}
                  currentUserId={user.id}
                  onSetWord={handleSetWord}
                  onGuessLetter={handleGuessLetter}
                  onForfeit={handleForfeit}
                  disconnectedPlayers={currentGame.disconnectedPlayers}
                />
              )}
              {currentGame.gameType === "millionaire" && (
                <MillionaireGame
                  gameId={currentGame.gameId}
                  players={currentGame.players}
                  gameState={currentGame.state}
                  currentUserId={user.id}
                  onAnswer={handleMillionaireAnswer}
                  onUseLifeline={handleUseLifeline}
                  onWalkAway={handleMillionaireWalkAway}
                  onForfeit={handleForfeit}
                  disconnectedPlayers={currentGame.disconnectedPlayers}
                />
              )}
            </div>
            <div className="space-y-6">
              <GameStats userId={user.id} gameType={currentGame.gameType} />
            </div>
          </div>
        ) : (
          /* Lobby View */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <OnlinePlayers
                users={onlineUsers}
                currentUserId={user.id}
                currentUserName={user.name}
                incomingChallenges={incomingChallenges}
                outgoingChallenges={outgoingChallenges}
                onSendChallenge={handleSendChallenge}
                onAcceptChallenge={handleAcceptChallenge}
                onDeclineChallenge={handleDeclineChallenge}
                isInGame={!!currentGame}
              />
            </div>
            <div className="space-y-6">
              <GameStats userId={user.id} gameType="tictactoe" />
              <GameStats userId={user.id} gameType="hangman" />
              <GameStats userId={user.id} gameType="millionaire" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
