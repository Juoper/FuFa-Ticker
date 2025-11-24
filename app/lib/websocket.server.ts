import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { prisma as db } from "./db.server";
import * as TicTacToe from "./tictactoe.server";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

// User tracking: userId -> WebSocket
const userConnections = new Map<string, WebSocket>();

// Game state: gameId -> game state
interface GameState {
  id: string;
  gameType: string;
  players: Array<{ userId: string; userName: string; role: string }>;
  state: any; // Game-specific state (e.g., TicTacToeState)
  disconnectedPlayers: Set<string>;
  disconnectTimers: Map<string, NodeJS.Timeout>;
}
const activeGames = new Map<string, GameState>();

// Challenge system: challengeId -> challenge info
interface Challenge {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  gameType: string;
  timestamp: Date;
  timeout: NodeJS.Timeout;
}
const pendingChallenges = new Map<string, Challenge>();

// Track userId for each WebSocket
const wsToUser = new Map<WebSocket, string>();

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

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await handleWebSocketMessage(ws, message);
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.log("Client disconnected");
      handleDisconnect(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      handleDisconnect(ws);
    });
  });

  console.log("WebSocket server initialized");
  return wss;
}

async function handleWebSocketMessage(ws: WebSocket, message: any) {
  const { type, data } = message;

  switch (type) {
    case "register":
      await handleRegisterUser(ws, data);
      break;
    case "send_challenge":
      await handleSendChallenge(data);
      break;
    case "challenge_response":
      await handleChallengeResponse(data);
      break;
    case "game_move":
      await handleGameMove(data);
      break;
    case "forfeit_game":
      await handleForfeitGame(data);
      break;
    default:
      console.log("Unknown message type:", type);
  }
}

async function handleRegisterUser(ws: WebSocket, data: { userId: string; userName: string }) {
  const { userId, userName } = data;
  
  // Store the connection
  userConnections.set(userId, ws);
  wsToUser.set(ws, userId);
  
  console.log(`User ${userName} (${userId}) registered`);

  // Check if user was in a game and handle reconnection
  for (const [gameId, game] of activeGames.entries()) {
    if (game.players.some(p => p.userId === userId)) {
      if (game.disconnectedPlayers.has(userId)) {
        // User is reconnecting
        game.disconnectedPlayers.delete(userId);
        
        // Clear disconnect timer
        const timer = game.disconnectTimers.get(userId);
        if (timer) {
          clearTimeout(timer);
          game.disconnectTimers.delete(userId);
        }

        // Notify all players in the game about reconnection
        sendToGamePlayers(gameId, {
          type: "player_reconnected",
          data: { userId, userName, gameId },
        });

        // Send current game state to reconnected player
        sendToUser(userId, {
          type: "game_state",
          data: {
            gameId,
            gameType: game.gameType,
            players: game.players,
            state: game.state,
          },
        });
      }
    }
  }

  // Broadcast updated online users list
  broadcastOnlineUsers();
}

function handleDisconnect(ws: WebSocket) {
  clients.delete(ws);
  
  const userId = wsToUser.get(ws);
  if (userId) {
    userConnections.delete(userId);
    wsToUser.delete(ws);
    
    // Handle game disconnection with grace period
    for (const [gameId, game] of activeGames.entries()) {
      const player = game.players.find(p => p.userId === userId);
      if (player) {
        game.disconnectedPlayers.add(userId);
        
        // Set a timer to end the game if user doesn't reconnect in 5 minutes
        const timer = setTimeout(() => {
          handlePlayerAbandon(gameId, userId);
        }, 5 * 60 * 1000); // 5 minutes
        
        game.disconnectTimers.set(userId, timer);

        // Notify other players
        sendToGamePlayers(gameId, {
          type: "player_disconnected",
          data: { userId, userName: player.userName, gameId },
        });
      }
    }
    
    // Cancel any challenges from this user
    for (const [challengeId, challenge] of pendingChallenges.entries()) {
      if (challenge.fromUserId === userId || challenge.toUserId === userId) {
        clearTimeout(challenge.timeout);
        pendingChallenges.delete(challengeId);
        
        // Notify the other party
        const otherUserId = challenge.fromUserId === userId ? challenge.toUserId : challenge.fromUserId;
        sendToUser(otherUserId, {
          type: "challenge_cancelled",
          data: { challengeId, reason: "User disconnected" },
        });
      }
    }
    
    broadcastOnlineUsers();
  }
}

async function handleSendChallenge(data: { fromUserId: string; fromUserName: string; toUserId: string; gameType: string }) {
  const { fromUserId, fromUserName, toUserId, gameType } = data;
  
  // Check if target user is online
  if (!userConnections.has(toUserId)) {
    sendToUser(fromUserId, {
      type: "challenge_error",
      data: { message: "User is offline" },
    });
    return;
  }

  // Create challenge
  const challengeId = `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timeout = setTimeout(() => {
    // Auto-decline after 30 seconds
    pendingChallenges.delete(challengeId);
    sendToUser(fromUserId, {
      type: "challenge_expired",
      data: { challengeId },
    });
  }, 30000);

  const challenge: Challenge = {
    id: challengeId,
    fromUserId,
    fromUserName,
    toUserId,
    gameType,
    timestamp: new Date(),
    timeout,
  };

  pendingChallenges.set(challengeId, challenge);

  // Notify both users
  sendToUser(fromUserId, {
    type: "challenge_sent",
    data: { challengeId, toUserId, gameType },
  });

  sendToUser(toUserId, {
    type: "challenge_received",
    data: { challengeId, fromUserId, fromUserName, gameType },
  });
}

async function handleChallengeResponse(data: { challengeId: string; accepted: boolean; userId: string }) {
  const { challengeId, accepted, userId } = data;
  
  const challenge = pendingChallenges.get(challengeId);
  if (!challenge) {
    return;
  }

  clearTimeout(challenge.timeout);
  pendingChallenges.delete(challengeId);

  if (accepted) {
    // Create the game
    await createGame(challenge.fromUserId, challenge.toUserId, challenge.gameType, challenge.fromUserName);
  } else {
    // Notify challenger that challenge was declined
    sendToUser(challenge.fromUserId, {
      type: "challenge_declined",
      data: { challengeId, byUserId: userId },
    });
  }
}

async function createGame(player1Id: string, player2Id: string, gameType: string, player1Name: string) {
  try {
    // Fetch user names
    const users = await db.user.findMany({
      where: { id: { in: [player1Id, player2Id] } },
      select: { id: true, name: true },
    });

    const player1 = users.find(u => u.id === player1Id);
    const player2 = users.find(u => u.id === player2Id);

    if (!player1 || !player2) {
      console.error("Could not find users for game");
      return;
    }

    // Initialize game-specific state
    let initialState: any;
    const players = [
      { userId: player1Id, userName: player1.name, role: 'X' },
      { userId: player2Id, userName: player2.name, role: 'O' },
    ];

    if (gameType === 'tictactoe') {
      initialState = TicTacToe.initializeGameState();
    } else {
      console.error("Unknown game type:", gameType);
      return;
    }

    // Create game in database
    const game = await db.game.create({
      data: {
        gameType,
        gameState: JSON.stringify(initialState),
        currentTurn: player1Id, // Player 1 (X) goes first
        status: 'active',
      },
    });

    // Create player records
    await db.gamePlayer.createMany({
      data: [
        { gameId: game.id, userId: player1Id, playerRole: 'X' },
        { gameId: game.id, userId: player2Id, playerRole: 'O' },
      ],
    });

    // Store in active games
    activeGames.set(game.id, {
      id: game.id,
      gameType,
      players,
      state: initialState,
      disconnectedPlayers: new Set(),
      disconnectTimers: new Map(),
    });

    // Notify both players
    const gameStartData = {
      gameId: game.id,
      gameType,
      players,
      state: initialState,
      currentTurn: player1Id,
    };

    sendToUser(player1Id, {
      type: "game_start",
      data: gameStartData,
    });

    sendToUser(player2Id, {
      type: "game_start",
      data: gameStartData,
    });
  } catch (error) {
    console.error("Error creating game:", error);
  }
}

async function handleGameMove(data: { gameId: string; userId: string; move: any }) {
  const { gameId, userId, move } = data;
  
  const game = activeGames.get(gameId);
  if (!game) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Game not found" },
    });
    return;
  }

  // Verify it's the player's turn
  const dbGame = await db.game.findUnique({ where: { id: gameId } });
  if (dbGame?.currentTurn !== userId) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Not your turn" },
    });
    return;
  }

  // Process move based on game type
  if (game.gameType === 'tictactoe') {
    await handleTicTacToeMove(game, userId, move.position);
  }
}

async function handleTicTacToeMove(game: GameState, userId: string, position: number) {
  const state = game.state as TicTacToe.TicTacToeState;
  const player = game.players.find(p => p.userId === userId);
  if (!player) return;

  const symbol = player.role as TicTacToe.TicTacToeSymbol;

  // Validate move
  if (!TicTacToe.validateMove(state.board, position, symbol)) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Invalid move" },
    });
    return;
  }

  // Apply move
  state.board = TicTacToe.applyMove(state.board, position, symbol);
  state.currentTurn = TicTacToe.getOppositeSymbol(symbol);
  state.winner = TicTacToe.checkWinner(state.board);

  // Update database
  const otherPlayer = game.players.find(p => p.userId !== userId);
  await db.game.update({
    where: { id: game.id },
    data: {
      gameState: JSON.stringify(state),
      currentTurn: state.winner ? null : otherPlayer?.userId,
      moveCount: { increment: 1 },
    },
  });

  // Broadcast updated state
  sendToGamePlayers(game.id, {
    type: "game_update",
    data: {
      gameId: game.id,
      state,
      currentTurn: state.winner ? null : otherPlayer?.userId,
      lastMove: { userId, position },
    },
  });

  // Handle game end
  if (state.winner) {
    const dbGame = await db.game.findUnique({
      where: { id: game.id },
      include: { players: true },
    });

    if (dbGame) {
      await TicTacToe.saveCompletedGame(
        game.id,
        game.players[0].userId,
        game.players[1].userId,
        state,
        dbGame.moveCount
      );
    }

    sendToGamePlayers(game.id, {
      type: "game_over",
      data: {
        gameId: game.id,
        winner: state.winner,
        state,
      },
    });

    // Cleanup
    activeGames.delete(game.id);
  }
}

async function handleForfeitGame(data: { gameId: string; userId: string }) {
  const { gameId, userId } = data;
  
  const game = activeGames.get(gameId);
  if (!game) return;

  const winner = game.players.find(p => p.userId !== userId);
  if (!winner) return;

  // Mark game as completed with forfeit
  await db.game.update({
    where: { id: gameId },
    data: {
      status: 'completed',
      completedAt: new Date(),
    },
  });

  // Update placements
  await db.gamePlayer.updateMany({
    where: { gameId, userId: winner.userId },
    data: { placement: 1 },
  });

  await db.gamePlayer.updateMany({
    where: { gameId, userId },
    data: { placement: 2 },
  });

  // Update stats
  await TicTacToe.updateGameStats(winner.userId, game.gameType, 'win');
  await TicTacToe.updateGameStats(userId, game.gameType, 'loss');

  // Notify players
  sendToGamePlayers(gameId, {
    type: "game_over",
    data: {
      gameId,
      winner: winner.userId,
      reason: "forfeit",
    },
  });

  activeGames.delete(gameId);
}

async function handlePlayerAbandon(gameId: string, userId: string) {
  const game = activeGames.get(gameId);
  if (!game) return;

  // Similar to forfeit but due to timeout
  const winner = game.players.find(p => p.userId !== userId);
  if (!winner) return;

  await db.game.update({
    where: { id: gameId },
    data: {
      status: 'abandoned',
      completedAt: new Date(),
    },
  });

  await TicTacToe.updateGameStats(winner.userId, game.gameType, 'win');
  await TicTacToe.updateGameStats(userId, game.gameType, 'loss');

  sendToGamePlayers(gameId, {
    type: "game_over",
    data: {
      gameId,
      winner: winner.userId,
      reason: "abandoned",
    },
  });

  activeGames.delete(gameId);
}

function sendToUser(userId: string, message: any) {
  const ws = userConnections.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendToGamePlayers(gameId: string, message: any) {
  const game = activeGames.get(gameId);
  if (game) {
    game.players.forEach(player => {
      sendToUser(player.userId, message);
    });
  }
}

function broadcastOnlineUsers() {
  const onlineUsers = Array.from(userConnections.keys());
  
  // Get user details
  db.user.findMany({
    where: { id: { in: onlineUsers } },
    select: { id: true, name: true },
  }).then(users => {
    const message = JSON.stringify({
      type: "online_users",
      data: { users },
    });

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }).catch(error => {
    console.error("Error fetching online users:", error);
  });
}

// Existing post broadcast functions
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

