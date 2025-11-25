import { useState, useEffect } from "react";

interface Player {
  userId: string;
  userName: string;
  role: string;
}

interface Question {
  question: string;
  answers: string[];
  correctAnswer: string;
  level: number;
}

interface PlayerAnswer {
  answer: string | null;
  isCorrect: boolean | null;
  isEliminated: boolean;
  currentLevel: number;
  prizeWon: number;
}

interface MillionaireState {
  currentLevel: number;
  currentQuestion: Question | null;
  usedLifelines: string[];
  lifelineResults: {
    type: string | null;
    data: any;
  } | null;
  playerAnswers: {
    [userId: string]: PlayerAnswer;
  };
  status: "waiting" | "in_progress" | "completed";
  winnerId: string | null;
}

interface MillionaireGameProps {
  gameId: string;
  players: Player[];
  gameState: MillionaireState;
  currentUserId: string;
  onAnswer?: (answer: string) => void;
  onUseLifeline?: (lifeline: string) => void;
  onWalkAway?: () => void;
  onForfeit: () => void;
  disconnectedPlayers?: string[];
}

const PRIZE_LADDER = [
  50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000,
  500000, 1000000,
];

const SAFETY_NETS = [5, 10]; // Indices (€1,000 and €32,000)

const formatPrize = (amount: number) => {
  return `€${amount.toLocaleString("de-DE")}`;
};

export function MillionaireGame({
  gameId,
  players,
  gameState,
  currentUserId,
  onAnswer,
  onUseLifeline,
  onWalkAway,
  onForfeit,
  disconnectedPlayers = [],
}: MillionaireGameProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showLifelineResult, setShowLifelineResult] = useState(false);

  const currentPlayer = gameState.playerAnswers[currentUserId];
  const isEliminated = currentPlayer?.isEliminated || false;
  const hasAnswered = currentPlayer?.answer !== null;

  useEffect(() => {
    if (gameState.lifelineResults) {
      setShowLifelineResult(true);
    }
  }, [gameState.lifelineResults]);

  useEffect(() => {
    // Reset selected answer when new question appears
    if (!hasAnswered) {
      setSelectedAnswer(null);
    }
  }, [gameState.currentQuestion, hasAnswered]);

  const handleAnswerSelect = (answer: string) => {
    if (isEliminated || hasAnswered) return;
    setSelectedAnswer(answer);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer && onAnswer && !hasAnswered) {
      onAnswer(selectedAnswer);
    }
  };

  const handleLifelineClick = (lifeline: string) => {
    if (onUseLifeline && !gameState.usedLifelines.includes(lifeline)) {
      onUseLifeline(lifeline);
    }
  };

  const handleWalkAway = () => {
    if (onWalkAway && !isEliminated) {
      if (confirm("Are you sure you want to walk away with your current winnings?")) {
        onWalkAway();
      }
    }
  };

  // Filter answers based on 50:50 lifeline
  const getAvailableAnswers = () => {
    if (!gameState.currentQuestion) return [];

    if (
      gameState.lifelineResults?.type === "50:50" &&
      Array.isArray(gameState.lifelineResults.data)
    ) {
      const removed = gameState.lifelineResults.data;
      return gameState.currentQuestion.answers.filter((a) => !removed.includes(a));
    }

    return gameState.currentQuestion.answers;
  };

  const availableAnswers = getAvailableAnswers();
  const answerLabels = ["A", "B", "C", "D"];

  // Render audience poll
  const renderAudiencePoll = () => {
    if (
      !showLifelineResult ||
      gameState.lifelineResults?.type !== "audience" ||
      !gameState.currentQuestion
    ) {
      return null;
    }

    const votes = gameState.lifelineResults.data as { [answer: string]: number };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="bg-gradient-to-b from-blue-900 to-blue-950 p-8 rounded-lg shadow-2xl max-w-2xl w-full border-4 border-yellow-500">
          <h3 className="text-3xl font-bold text-yellow-400 mb-6 text-center">
            Publikums-Joker
          </h3>
          <div className="space-y-4">
            {gameState.currentQuestion.answers.map((answer, idx) => {
              const vote = votes[answer] || 0;
              return (
                <div key={idx} className="flex items-center gap-4">
                  <span className="text-2xl font-bold text-yellow-400 w-8">
                    {answerLabels[idx]}:
                  </span>
                  <div className="flex-1">
                    <div className="bg-blue-950 rounded-full h-8 overflow-hidden border-2 border-blue-700">
                      <div
                        className="bg-gradient-to-r from-yellow-500 to-orange-500 h-full flex items-center justify-end pr-2 transition-all duration-1000"
                        style={{ width: `${vote}%` }}
                      >
                        <span className="text-white font-bold text-sm">
                          {vote}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setShowLifelineResult(false)}
            className="mt-6 w-full px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-blue-950 font-bold rounded-lg transition"
          >
            Schließen
          </button>
        </div>
      </div>
    );
  };

  // Render phone-a-friend result
  const renderPhoneResult = () => {
    if (
      !showLifelineResult ||
      gameState.lifelineResults?.type !== "phone" ||
      !gameState.lifelineResults.data
    ) {
      return null;
    }

    const { answer, confidence } = gameState.lifelineResults.data;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="bg-gradient-to-b from-blue-900 to-blue-950 p-8 rounded-lg shadow-2xl max-w-md w-full border-4 border-yellow-500">
          <h3 className="text-3xl font-bold text-yellow-400 mb-6 text-center">
            Telefon-Joker
          </h3>
          <div className="bg-blue-950 p-6 rounded-lg border-2 border-blue-700 mb-6">
            <p className="text-white text-lg mb-4">
              "Also, ich bin {confidence}, dass die Antwort..."
            </p>
            <p className="text-yellow-400 text-2xl font-bold text-center">
              {answer}
            </p>
            <p className="text-white text-lg mt-4">"...ist."</p>
          </div>
          <button
            onClick={() => setShowLifelineResult(false)}
            className="w-full px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-blue-950 font-bold rounded-lg transition"
          >
            Schließen
          </button>
        </div>
      </div>
    );
  };

  // Game over screen
  if (gameState.status === "completed") {
    const sortedPlayers = Object.entries(gameState.playerAnswers)
      .map(([userId, data]) => ({
        userId,
        userName: players.find((p) => p.userId === userId)?.userName || "Unknown",
        ...data,
      }))
      .sort((a, b) => b.currentLevel - a.currentLevel || b.prizeWon - a.prizeWon);

    const winner = sortedPlayers[0];
    const isWinner = winner?.userId === currentUserId;

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-black flex items-center justify-center p-6">
        <div className="bg-gradient-to-b from-blue-900 to-blue-950 p-8 rounded-lg shadow-2xl max-w-4xl w-full border-4 border-yellow-500">
          <h2 className="text-4xl font-bold text-center mb-8 text-yellow-400">
            {isWinner ? "🏆 Glückwunsch! 🏆" : "Spiel beendet"}
          </h2>

          <div className="space-y-4 mb-8">
            {sortedPlayers.map((player, idx) => (
              <div
                key={player.userId}
                className={`p-4 rounded-lg border-2 ${
                  idx === 0
                    ? "bg-yellow-500 bg-opacity-20 border-yellow-500"
                    : "bg-blue-950 bg-opacity-50 border-blue-700"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span
                    className={`text-xl font-bold ${
                      idx === 0 ? "text-yellow-400" : "text-white"
                    }`}
                  >
                    {idx === 0 ? "👑 " : `${idx + 1}. `}
                    {player.userName}
                    {player.userId === currentUserId ? " (Du)" : ""}
                  </span>
                  <div className="text-right">
                    <div
                      className={`text-2xl font-bold ${
                        idx === 0 ? "text-yellow-400" : "text-orange-400"
                      }`}
                    >
                      {formatPrize(player.prizeWon)}
                    </div>
                    <div className="text-sm text-gray-400">
                      Frage {player.currentLevel + 1}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition"
            >
              Zurück zur Lobby
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-gray-400">
            <p>Spiel ID: {gameId.substring(0, 8)}...</p>
          </div>
        </div>
      </div>
    );
  }

  // Main game view
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-black p-6">
      {renderAudiencePoll()}
      {renderPhoneResult()}

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Money Ladder - Sidebar */}
          <div className="lg:col-span-1 order-2 lg:order-1">
            <div className="bg-gradient-to-b from-blue-900 to-blue-950 rounded-lg shadow-2xl p-4 border-2 border-yellow-500">
              <h3 className="text-xl font-bold text-yellow-400 mb-4 text-center">
                Gewinnstufen
              </h3>
              <div className="space-y-1">
                {PRIZE_LADDER.slice()
                  .reverse()
                  .map((prize, idx) => {
                    const level = PRIZE_LADDER.length - 1 - idx;
                    const isCurrent = level === gameState.currentLevel;
                    const isPassed = level < gameState.currentLevel;
                    const isSafetyNet = SAFETY_NETS.includes(level);

                    return (
                      <div
                        key={level}
                        className={`p-2 rounded transition-all ${
                          isCurrent
                            ? "bg-yellow-500 text-blue-950 font-bold scale-105 shadow-lg"
                            : isPassed
                            ? "bg-green-600 bg-opacity-30 text-green-300"
                            : isSafetyNet
                            ? "bg-orange-600 bg-opacity-20 text-orange-300 border border-orange-500"
                            : "bg-blue-950 bg-opacity-50 text-gray-400"
                        }`}
                      >
                        <div className="flex justify-between items-center text-sm">
                          <span>{level + 1}</span>
                          <span className="font-bold">{formatPrize(prize)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Players Status */}
            <div className="mt-4 bg-gradient-to-b from-blue-900 to-blue-950 rounded-lg shadow-2xl p-4 border-2 border-blue-700">
              <h3 className="text-lg font-bold text-yellow-400 mb-3">Spieler</h3>
              <div className="space-y-2">
                {players.map((player) => {
                  const playerData = gameState.playerAnswers[player.userId];
                  return (
                    <div
                      key={player.userId}
                      className={`p-2 rounded text-sm ${
                        playerData?.isEliminated
                          ? "bg-red-900 bg-opacity-30 text-red-300"
                          : "bg-blue-950 bg-opacity-50 text-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              disconnectedPlayers.includes(player.userId)
                                ? "bg-orange-500"
                                : "bg-green-500"
                            }`}
                          ></div>
                          <span className="font-medium">
                            {player.userName}
                            {player.userId === currentUserId ? " (Du)" : ""}
                          </span>
                        </div>
                        {playerData && (
                          <span className="text-xs">
                            {playerData.isEliminated
                              ? `${formatPrize(playerData.prizeWon)}`
                              : `Frage ${playerData.currentLevel + 1}`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Game Area */}
          <div className="lg:col-span-3 order-1 lg:order-2">
            <div className="bg-gradient-to-b from-blue-900 to-blue-950 rounded-lg shadow-2xl p-8 border-4 border-yellow-500">
              {/* Status Message */}
              <div className="mb-6 text-center">
                {isEliminated ? (
                  <div className="bg-red-900 bg-opacity-50 border-2 border-red-500 rounded-lg p-4">
                    <p className="text-red-300 text-xl font-bold">
                      Du bist ausgeschieden!
                    </p>
                    <p className="text-orange-300 text-2xl font-bold mt-2">
                      Gewinn: {formatPrize(currentPlayer.prizeWon)}
                    </p>
                  </div>
                ) : hasAnswered ? (
                  <div className="bg-yellow-900 bg-opacity-50 border-2 border-yellow-500 rounded-lg p-4">
                    <p className="text-yellow-300 text-xl font-bold">
                      Antwort abgegeben! Warte auf andere Spieler...
                    </p>
                  </div>
                ) : (
                  <div className="bg-blue-950 bg-opacity-50 border-2 border-blue-500 rounded-lg p-4">
                    <p className="text-blue-300 text-lg">
                      Frage {gameState.currentLevel + 1} von {PRIZE_LADDER.length}
                    </p>
                    <p className="text-yellow-400 text-3xl font-bold mt-2">
                      {formatPrize(PRIZE_LADDER[gameState.currentLevel])}
                    </p>
                  </div>
                )}
              </div>

              {/* Question */}
              {gameState.currentQuestion && (
                <div className="mb-8">
                  <div className="bg-blue-950 rounded-lg p-6 border-2 border-blue-700 mb-6">
                    <p className="text-white text-2xl font-semibold text-center">
                      {gameState.currentQuestion.question}
                    </p>
                  </div>

                  {/* Answer Options */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availableAnswers.map((answer, idx) => {
                      const originalIdx = gameState.currentQuestion!.answers.indexOf(
                        answer
                      );
                      const label = answerLabels[originalIdx];
                      const isSelected = selectedAnswer === answer;
                      const isDisabled = isEliminated || hasAnswered;

                      // Check if this answer was removed by 50:50
                      const isRemoved =
                        gameState.lifelineResults?.type === "50:50" &&
                        Array.isArray(gameState.lifelineResults.data) &&
                        gameState.lifelineResults.data.includes(answer);

                      if (isRemoved) return null;

                      return (
                        <button
                          key={originalIdx}
                          onClick={() => handleAnswerSelect(answer)}
                          disabled={isDisabled}
                          className={`p-4 rounded-lg text-left transition-all transform ${
                            isSelected
                              ? "bg-yellow-500 text-blue-950 scale-105 shadow-lg"
                              : "bg-blue-900 hover:bg-blue-800 text-white"
                          } ${
                            isDisabled
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:scale-102 cursor-pointer"
                          } border-2 ${
                            isSelected ? "border-yellow-300" : "border-blue-700"
                          }`}
                        >
                          <span className="font-bold text-xl mr-3">{label}:</span>
                          <span className="text-lg">{answer}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Submit Button */}
                  {!isEliminated && !hasAnswered && (
                    <div className="mt-6 text-center">
                      <button
                        onClick={handleSubmitAnswer}
                        disabled={!selectedAnswer}
                        className={`px-12 py-4 rounded-lg font-bold text-xl transition-all transform ${
                          selectedAnswer
                            ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white scale-100 hover:scale-105 shadow-lg"
                            : "bg-gray-600 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        Antwort bestätigen
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Lifelines */}
              {!isEliminated && !hasAnswered && (
                <div className="border-t-2 border-blue-700 pt-6">
                  <h3 className="text-yellow-400 text-xl font-bold mb-4 text-center">
                    Joker
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <button
                      onClick={() => handleLifelineClick("50:50")}
                      disabled={gameState.usedLifelines.includes("50:50")}
                      className={`p-4 rounded-lg font-bold transition-all ${
                        gameState.usedLifelines.includes("50:50")
                          ? "bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg"
                      }`}
                    >
                      <div className="text-3xl mb-2">50:50</div>
                      <div className="text-xs">Zwei falsche entfernen</div>
                    </button>

                    <button
                      onClick={() => handleLifelineClick("phone")}
                      disabled={gameState.usedLifelines.includes("phone")}
                      className={`p-4 rounded-lg font-bold transition-all ${
                        gameState.usedLifelines.includes("phone")
                          ? "bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg"
                      }`}
                    >
                      <div className="text-3xl mb-2">📞</div>
                      <div className="text-xs">Telefon-Joker</div>
                    </button>

                    <button
                      onClick={() => handleLifelineClick("audience")}
                      disabled={gameState.usedLifelines.includes("audience")}
                      className={`p-4 rounded-lg font-bold transition-all ${
                        gameState.usedLifelines.includes("audience")
                          ? "bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-b from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-lg"
                      }`}
                    >
                      <div className="text-3xl mb-2">👥</div>
                      <div className="text-xs">Publikums-Joker</div>
                    </button>

                    <button
                      onClick={handleWalkAway}
                      className="p-4 rounded-lg font-bold bg-gradient-to-b from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-blue-950 transition-all shadow-lg"
                    >
                      <div className="text-3xl mb-2">💰</div>
                      <div className="text-xs">Aufhören</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Forfeit Button */}
              <div className="mt-6 text-center">
                <button
                  onClick={onForfeit}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium"
                >
                  Spiel verlassen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

