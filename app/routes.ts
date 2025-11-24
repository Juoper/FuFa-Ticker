import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("memes", "routes/memes.tsx"),
  route("api/preview-meme", "routes/api.preview-meme.tsx"),
] satisfies RouteConfig;
