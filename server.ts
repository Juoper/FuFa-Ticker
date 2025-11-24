import { createRequestHandler } from "@react-router/express";
import express from "express";
import { createServer } from "http";
import { setupWebSocketServer } from "./app/lib/websocket.server";

const viteDevServer =
  process.env.NODE_ENV === "production"
    ? undefined
    : await import("vite").then((vite) =>
        vite.createServer({
          server: { middlewareMode: true },
        })
      );

const app = express();

// Serve static files from public
app.use(express.static("public"));

// Add vite dev middleware
if (viteDevServer) {
  app.use(viteDevServer.middlewares);
} else {
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" })
  );
}

// Create HTTP server
const server = createServer(app);

// Set up WebSocket server
setupWebSocketServer(server);

// React Router request handler
app.use(
  createRequestHandler({
    build: viteDevServer
      ? () => viteDevServer.ssrLoadModule("virtual:react-router/server-build")
      : // @ts-ignore
        await import("./build/server/index.js"),
  })
);

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

