import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function setupWebSocketServer(server: Server) {
  if (wss) {
    return wss;
  }

  wss = new WebSocketServer({ 
    server,
    path: "/ws"
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("Client connected");
    clients.add(ws);

    ws.on("close", () => {
      console.log("Client disconnected");
      clients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      clients.delete(ws);
    });
  });

  console.log("WebSocket server initialized");
  return wss;
}

export function broadcastNewPost(post: any) {
  const message = JSON.stringify({
    type: "new_post",
    data: post,
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function broadcastDeletePost(postId: string) {
  const message = JSON.stringify({
    type: "delete_post",
    data: { postId },
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function getWebSocketServer() {
  return wss;
}

