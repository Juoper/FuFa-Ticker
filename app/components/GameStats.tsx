import { useEffect, useState } from "react";

interface GameStatsData {
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  winRate: number;
}

interface GameStatsProps {
  userId: string;
  gameType: string;
}

export function GameStats({ userId, gameType }: GameStatsProps) {
  const [stats, setStats] = useState<GameStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch(
          `/api/game-stats?userId=${userId}&gameType=${gameType}`
        );
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Error fetching game stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [userId, gameType]);

  // Capitalize game type for display
  const gameTypeDisplay = gameType.charAt(0).toUpperCase() + gameType.slice(1).replace(/([A-Z])/g, ' $1').trim();
  
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">{gameTypeDisplay} Stats</h2>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">{gameTypeDisplay} Stats</h2>
        <p className="text-gray-500">No stats available</p>
      </div>
    );
  }

  const StatItem = ({ label, value, color }: { label: string; value: number | string; color: string }) => (
    <div className="text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        {gameTypeDisplay} Stats
      </h2>

      {stats.totalGames === 0 ? (
        <p className="text-gray-500 italic">
          No games played yet. Challenge someone to start!
        </p>
      ) : (
        <>
          {/* Win Rate Display */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
            <div className="text-center">
              <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                {stats.winRate}%
              </div>
              <div className="text-sm text-gray-600 mt-2 font-medium">
                Win Rate
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <StatItem 
              label="Total Games" 
              value={stats.totalGames} 
              color="text-gray-700" 
            />
            <StatItem 
              label="Wins" 
              value={stats.wins} 
              color="text-green-600" 
            />
            <StatItem 
              label="Losses" 
              value={stats.losses} 
              color="text-red-600" 
            />
            <StatItem 
              label="Draws" 
              value={stats.draws} 
              color="text-yellow-600" 
            />
          </div>

          {/* Win/Loss Ratio Bar */}
          {stats.totalGames > 0 && (
            <div className="mt-4">
              <div className="flex h-6 rounded-lg overflow-hidden">
                <div
                  className="bg-green-500 flex items-center justify-center text-xs text-white font-semibold"
                  style={{ width: `${(stats.wins / stats.totalGames) * 100}%` }}
                >
                  {stats.wins > 0 && stats.wins}
                </div>
                <div
                  className="bg-yellow-500 flex items-center justify-center text-xs text-white font-semibold"
                  style={{ width: `${(stats.draws / stats.totalGames) * 100}%` }}
                >
                  {stats.draws > 0 && stats.draws}
                </div>
                <div
                  className="bg-red-500 flex items-center justify-center text-xs text-white font-semibold"
                  style={{ width: `${(stats.losses / stats.totalGames) * 100}%` }}
                >
                  {stats.losses > 0 && stats.losses}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
