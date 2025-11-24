import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("memes", "routes/memes.tsx"),
  route("games", "routes/games.tsx"),
  route("api/preview-meme", "routes/api.preview-meme.tsx"),
  route("api/game-stats", "routes/api.game-stats.tsx"),
] satisfies RouteConfig;
