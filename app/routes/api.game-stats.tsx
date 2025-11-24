import type { Route } from "./+types/api.game-stats";
import { getGameStats } from "~/lib/tictactoe.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const gameType = url.searchParams.get("gameType");

  if (!userId || !gameType) {
    return Response.json({ error: "Missing userId or gameType" }, { status: 400 });
  }

  try {
    const stats = await getGameStats(userId, gameType);
    return Response.json(stats);
  } catch (error) {
    console.error("Error fetching game stats:", error);
    return Response.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
