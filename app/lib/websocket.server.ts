import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { prisma as db } from "./db.server";
import * as TicTacToe from "./tictactoe.server";
import * as Hangman from "./hangman.server";
import * as Millionaire from "./millionaire.server";

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
  toUserIds: string[]; // Support multiple recipients for multiplayer games
  gameType: string;
  timestamp: Date;
  timeout: NodeJS.Timeout;
  acceptedBy: Set<string>; // Track who has accepted (for multiplayer)
  declinedBy: Set<string>; // Track who has declined
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
    case "set_word":
      await handleSetWord(data);
      break;
    case "guess_letter":
      await handleGuessLetter(data);
      break;
    case "forfeit_game":
      await handleForfeitGame(data);
      break;
    case "millionaire_answer":
      await handleMillionaireAnswer(data);
      break;
    case "use_lifeline":
      await handleUseLifeline(data);
      break;
    case "millionaire_walk_away":
      await handleMillionaireWalkAway(data);
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
      if (challenge.fromUserId === userId || challenge.toUserIds.includes(userId)) {
        clearTimeout(challenge.timeout);
        pendingChallenges.delete(challengeId);
        
        // Notify all other parties
        if (challenge.fromUserId === userId) {
          // Challenger disconnected, notify all challenged users
          challenge.toUserIds.forEach(id => {
            sendToUser(id, {
              type: "challenge_cancelled",
              data: { challengeId, reason: "User disconnected" },
            });
          });
        } else {
          // One of the challenged users disconnected
          sendToUser(challenge.fromUserId, {
            type: "challenge_cancelled",
            data: { challengeId, reason: "User disconnected" },
          });
          // Notify other challenged users
          challenge.toUserIds.forEach(id => {
            if (id !== userId) {
              sendToUser(id, {
                type: "challenge_cancelled",
                data: { challengeId, reason: "User disconnected" },
              });
            }
          });
        }
      }
    }
    
    broadcastOnlineUsers();
  }
}

async function handleSendChallenge(data: { fromUserId: string; fromUserName: string; toUserIds: string | string[]; gameType: string }) {
  const { fromUserId, fromUserName, gameType } = data;
  
  // Normalize toUserIds to always be an array
  const toUserIds = Array.isArray(data.toUserIds) ? data.toUserIds : [data.toUserIds];
  
  // Check if all target users are online
  const offlineUsers = toUserIds.filter(id => !userConnections.has(id));
  if (offlineUsers.length > 0) {
    sendToUser(fromUserId, {
      type: "challenge_error",
      data: { message: "Some users are offline" },
    });
    return;
  }

  // Validate player count for game type
  if (gameType === 'tictactoe' && toUserIds.length !== 1) {
    sendToUser(fromUserId, {
      type: "challenge_error",
      data: { message: "Tic-Tac-Toe requires exactly 1 opponent" },
    });
    return;
  }

  if (gameType === 'hangman' && (toUserIds.length < 1 || toUserIds.length > 7)) {
    sendToUser(fromUserId, {
      type: "challenge_error",
      data: { message: "Hangman requires 1-7 players" },
    });
    return;
  }

  if (gameType === 'millionaire' && (toUserIds.length < 1 || toUserIds.length > 10)) {
    sendToUser(fromUserId, {
      type: "challenge_error",
      data: { message: "Millionaire requires 1-10 players" },
    });
    return;
  }

  // Create challenge
  const challengeId = `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timeout = setTimeout(() => {
    // Auto-decline after 30 seconds
    const challenge = pendingChallenges.get(challengeId);
    if (challenge) {
      pendingChallenges.delete(challengeId);
      sendToUser(fromUserId, {
        type: "challenge_expired",
        data: { challengeId },
      });
      
      // Notify all challenged users
      toUserIds.forEach(userId => {
        sendToUser(userId, {
          type: "challenge_cancelled",
          data: { challengeId },
        });
      });
    }
  }, 30000);

  const challenge: Challenge = {
    id: challengeId,
    fromUserId,
    fromUserName,
    toUserIds,
    gameType,
    timestamp: new Date(),
    timeout,
    acceptedBy: new Set(),
    declinedBy: new Set(),
  };

  pendingChallenges.set(challengeId, challenge);

  // Notify challenger
  sendToUser(fromUserId, {
    type: "challenge_sent",
    data: { challengeId, toUserIds, gameType },
  });

  // Notify all challenged users
  toUserIds.forEach(userId => {
    sendToUser(userId, {
      type: "challenge_received",
      data: { challengeId, fromUserId, fromUserName, gameType, toUserIds },
    });
  });
}

async function handleChallengeResponse(data: { challengeId: string; accepted: boolean; userId: string }) {
  const { challengeId, accepted, userId } = data;
  
  const challenge = pendingChallenges.get(challengeId);
  if (!challenge) {
    return;
  }

  if (!accepted) {
    // User declined
    challenge.declinedBy.add(userId);
    
    // Cancel the entire challenge if anyone declines
    clearTimeout(challenge.timeout);
    pendingChallenges.delete(challengeId);
    
    // Notify challenger
    sendToUser(challenge.fromUserId, {
      type: "challenge_declined",
      data: { challengeId, byUserId: userId },
    });
    
    // Notify other challenged users
    challenge.toUserIds.forEach(id => {
      if (id !== userId) {
        sendToUser(id, {
          type: "challenge_cancelled",
          data: { challengeId, reason: "Another player declined" },
        });
      }
    });
    
    return;
  }

  // User accepted
  challenge.acceptedBy.add(userId);
  
  // Check if all users have accepted
  const allAccepted = challenge.toUserIds.every(id => challenge.acceptedBy.has(id));
  
  if (allAccepted) {
    // All players accepted, create the game
    clearTimeout(challenge.timeout);
    pendingChallenges.delete(challengeId);
    
    if (challenge.gameType === 'tictactoe') {
      // 1v1 game
      await createGame(challenge.fromUserId, challenge.toUserIds[0], challenge.gameType, challenge.fromUserName);
    } else if (challenge.gameType === 'hangman') {
      // Multiplayer game
      await createHangmanGame(challenge.fromUserId, challenge.toUserIds);
    } else if (challenge.gameType === 'millionaire') {
      // Multiplayer game
      await createMillionaireGame(challenge.fromUserId, challenge.toUserIds);
    }
  } else {
    // Notify challenger that this user accepted
    sendToUser(challenge.fromUserId, {
      type: "challenge_accepted_partial",
      data: { 
        challengeId, 
        byUserId: userId,
        acceptedCount: challenge.acceptedBy.size,
        totalCount: challenge.toUserIds.length,
      },
    });
  }
}

async function createHangmanGame(wordMasterId: string, guesserIds: string[]) {
  try {
    // Fetch user names
    const allUserIds = [wordMasterId, ...guesserIds];
    const users = await db.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, name: true },
    });

    const wordMaster = users.find(u => u.id === wordMasterId);
    if (!wordMaster) {
      console.error("Could not find word master");
      return;
    }

    // Initialize game state (waiting for word)
    const initialState = Hangman.initializeGameState();

    // Create game in database
    const game = await db.game.create({
      data: {
        gameType: 'hangman',
        gameState: JSON.stringify(initialState),
        currentTurn: null, // No turns in hangman
        status: 'active',
      },
    });

    // Create player records
    const playerData = [
      { gameId: game.id, userId: wordMasterId, playerRole: 'word_master' },
      ...guesserIds.map(id => ({ gameId: game.id, userId: id, playerRole: 'guesser' })),
    ];
    
    await db.gamePlayer.createMany({ data: playerData });

    // Build players list
    const players = [
      { userId: wordMasterId, userName: wordMaster.name, role: 'word_master' },
      ...guesserIds.map(id => {
        const user = users.find(u => u.id === id);
        return { userId: id, userName: user?.name || 'Unknown', role: 'guesser' };
      }),
    ];

    // Store in active games
    activeGames.set(game.id, {
      id: game.id,
      gameType: 'hangman',
      players,
      state: initialState,
      disconnectedPlayers: new Set(),
      disconnectTimers: new Map(),
    });

    // Notify all players
    const gameStartData = {
      gameId: game.id,
      gameType: 'hangman',
      players,
      state: initialState,
      currentTurn: null,
    };

    players.forEach(player => {
      sendToUser(player.userId, {
        type: "game_start",
        data: gameStartData,
      });
    });
  } catch (error) {
    console.error("Error creating hangman game:", error);
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

async function handleSetWord(data: { gameId: string; userId: string; word: string }) {
  const { gameId, userId, word } = data;
  
  const game = activeGames.get(gameId);
  if (!game) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Game not found" },
    });
    return;
  }

  // Verify user is the word master
  const player = game.players.find(p => p.userId === userId);
  if (!player || player.role !== 'word_master') {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Only the word master can set the word" },
    });
    return;
  }

  const state = game.state as Hangman.HangmanState;
  
  // Verify game is waiting for word
  if (state.status !== 'waiting_for_word') {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Word has already been set" },
    });
    return;
  }

  try {
    // Set the word
    const newState = Hangman.setWord(state, word);
    game.state = newState;

    // Update database
    await db.game.update({
      where: { id: gameId },
      data: {
        gameState: JSON.stringify(newState),
      },
    });

    // Send different state to word master (includes word) vs guessers (masked word)
    const wordMaster = game.players.find(p => p.role === 'word_master');
    const guessers = game.players.filter(p => p.role === 'guesser');

    // Send full state to word master
    if (wordMaster) {
      sendToUser(wordMaster.userId, {
        type: "game_update",
        data: {
          gameId,
          state: newState,
          currentTurn: null,
        },
      });
    }

    // Send masked state to guessers
    const maskedState = {
      ...newState,
      word: Hangman.getMaskedWord(newState),
    };
    
    guessers.forEach(guesser => {
      sendToUser(guesser.userId, {
        type: "game_update",
        data: {
          gameId,
          state: maskedState,
          currentTurn: null,
        },
      });
    });
  } catch (error: any) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: error.message || "Invalid word" },
    });
  }
}

async function handleGuessLetter(data: { gameId: string; userId: string; letter: string }) {
  const { gameId, userId, letter } = data;
  
  const game = activeGames.get(gameId);
  if (!game) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Game not found" },
    });
    return;
  }

  // Verify user is a guesser
  const player = game.players.find(p => p.userId === userId);
  if (!player || player.role !== 'guesser') {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Only guessers can guess letters" },
    });
    return;
  }

  const state = game.state as Hangman.HangmanState;

  // Validate guess
  if (!Hangman.validateGuess(state, letter)) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Invalid guess" },
    });
    return;
  }

  // Apply guess
  const newState = Hangman.applyGuess(state, letter);
  game.state = newState;

  // Update database
  await db.game.update({
    where: { id: gameId },
    data: {
      gameState: JSON.stringify(newState),
      moveCount: { increment: 1 },
    },
  });

  // Broadcast update to all players
  const wordMaster = game.players.find(p => p.role === 'word_master');
  const guessers = game.players.filter(p => p.role === 'guesser');

  // Send full state to word master
  if (wordMaster) {
    sendToUser(wordMaster.userId, {
      type: "game_update",
      data: {
        gameId,
        state: newState,
        currentTurn: null,
        lastGuess: { userId, letter, correct: newState.word.includes(letter.toUpperCase()) },
      },
    });
  }

  // Send masked state to guessers
  const maskedState = {
    ...newState,
    word: Hangman.getMaskedWord(newState),
  };
  
  guessers.forEach(guesser => {
    sendToUser(guesser.userId, {
      type: "game_update",
      data: {
        gameId,
        state: maskedState,
        currentTurn: null,
        lastGuess: { userId, letter, correct: newState.word.includes(letter.toUpperCase()) },
      },
    });
  });

  // Handle game end
  if (newState.status === 'won' || newState.status === 'lost') {
    const dbGame = await db.game.findUnique({
      where: { id: gameId },
      include: { players: true },
    });

    if (dbGame) {
      const wordMasterPlayer = game.players.find(p => p.role === 'word_master');
      const guesserPlayers = game.players.filter(p => p.role === 'guesser');
      
      if (wordMasterPlayer) {
        await Hangman.saveCompletedGame(
          gameId,
          wordMasterPlayer.userId,
          guesserPlayers.map(p => p.userId),
          newState
        );
      }
    }

    // Broadcast game over (with revealed word)
    const finalState = { ...newState };
    
    sendToGamePlayers(gameId, {
      type: "game_over",
      data: {
        gameId,
        state: finalState,
        winner: newState.status === 'won' ? 'guessers' : 'word_master',
      },
    });

    // Cleanup
    activeGames.delete(gameId);
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

  // Mark game as completed with forfeit
  await db.game.update({
    where: { id: gameId },
    data: {
      status: 'completed',
      completedAt: new Date(),
    },
  });

  if (game.gameType === 'tictactoe') {
    // 1v1 game
    const winner = game.players.find(p => p.userId !== userId);
    if (!winner) return;

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
  } else if (game.gameType === 'hangman') {
    // Multiplayer game - treat forfeit as ending the game
    const forfeitingPlayer = game.players.find(p => p.userId === userId);
    const isWordMaster = forfeitingPlayer?.role === 'word_master';
    
    if (isWordMaster) {
      // Word master forfeited - guessers win
      const guessers = game.players.filter(p => p.role === 'guesser');
      
      await db.gamePlayer.updateMany({
        where: { gameId, userId: { in: guessers.map(g => g.userId) } },
        data: { placement: 1 },
      });
      
      await db.gamePlayer.updateMany({
        where: { gameId, userId },
        data: { placement: 2 },
      });
      
      // Update stats
      for (const guesser of guessers) {
        await Hangman.updateGameStats(guesser.userId, 'hangman', 'win');
      }
      await Hangman.updateGameStats(userId, 'hangman', 'loss');
      
      sendToGamePlayers(gameId, {
        type: "game_over",
        data: {
          gameId,
          winner: 'guessers',
          reason: "forfeit",
        },
      });
    } else {
      // A guesser forfeited - game continues or ends depending on remaining players
      // For simplicity, we'll end the game and word master wins
      const wordMaster = game.players.find(p => p.role === 'word_master');
      const guessers = game.players.filter(p => p.role === 'guesser');
      
      if (wordMaster) {
        await db.gamePlayer.updateMany({
          where: { gameId, userId: wordMaster.userId },
          data: { placement: 1 },
        });
        
        await db.gamePlayer.updateMany({
          where: { gameId, userId: { in: guessers.map(g => g.userId) } },
          data: { placement: 2 },
        });
        
        // Update stats
        await Hangman.updateGameStats(wordMaster.userId, 'hangman', 'win');
        for (const guesser of guessers) {
          await Hangman.updateGameStats(guesser.userId, 'hangman', 'loss');
        }
        
        sendToGamePlayers(gameId, {
          type: "game_over",
          data: {
            gameId,
            winner: 'word_master',
            reason: "forfeit",
          },
        });
      }
    }
  } else if (game.gameType === 'millionaire') {
    // Millionaire game - player forfeits, treated as elimination
    const state = game.state as Millionaire.MillionaireState;
    const { newState, prizeWon } = Millionaire.walkAway(state, userId);
    game.state = newState;

    await db.game.update({
      where: { gameId },
      data: {
        gameState: JSON.stringify(newState),
      },
    });

    sendToGamePlayers(gameId, {
      type: "game_update",
      data: {
        gameId,
        state: newState,
        currentTurn: null,
      },
    });

    // If all players eliminated, end game
    if (newState.status === 'completed') {
      sendToGamePlayers(gameId, {
        type: "game_over",
        data: {
          gameId,
          state: newState,
          reason: "forfeit",
        },
      });
      activeGames.delete(gameId);
      return;
    }
  }

  activeGames.delete(gameId);
}

async function handlePlayerAbandon(gameId: string, userId: string) {
  const game = activeGames.get(gameId);
  if (!game) return;

  await db.game.update({
    where: { id: gameId },
    data: {
      status: 'abandoned',
      completedAt: new Date(),
    },
  });

  if (game.gameType === 'tictactoe') {
    // Similar to forfeit but due to timeout
    const winner = game.players.find(p => p.userId !== userId);
    if (!winner) return;

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
  } else if (game.gameType === 'hangman') {
    const abandoningPlayer = game.players.find(p => p.userId === userId);
    const isWordMaster = abandoningPlayer?.role === 'word_master';
    
    if (isWordMaster) {
      // Word master abandoned - guessers win
      const guessers = game.players.filter(p => p.role === 'guesser');
      
      for (const guesser of guessers) {
        await Hangman.updateGameStats(guesser.userId, 'hangman', 'win');
      }
      await Hangman.updateGameStats(userId, 'hangman', 'loss');
      
      sendToGamePlayers(gameId, {
        type: "game_over",
        data: {
          gameId,
          winner: 'guessers',
          reason: "abandoned",
        },
      });
    } else {
      // A guesser abandoned - word master wins
      const wordMaster = game.players.find(p => p.role === 'word_master');
      const guessers = game.players.filter(p => p.role === 'guesser');
      
      if (wordMaster) {
        await Hangman.updateGameStats(wordMaster.userId, 'hangman', 'win');
        for (const guesser of guessers) {
          await Hangman.updateGameStats(guesser.userId, 'hangman', 'loss');
        }
        
        sendToGamePlayers(gameId, {
          type: "game_over",
          data: {
            gameId,
            winner: 'word_master',
            reason: "abandoned",
          },
        });
      }
    }
  } else if (game.gameType === 'millionaire') {
    // Millionaire game - player abandoned, treated as elimination
    const state = game.state as Millionaire.MillionaireState;
    const { newState, prizeWon } = Millionaire.walkAway(state, userId);
    game.state = newState;

    await db.game.update({
      where: { gameId },
      data: {
        gameState: JSON.stringify(newState),
        status: 'abandoned',
      },
    });

    // Update stats for forfeiting player
    await Millionaire.updateGameStats(userId, 'millionaire', 'loss');

    sendToGamePlayers(gameId, {
      type: "game_update",
      data: {
        gameId,
        state: newState,
        currentTurn: null,
      },
    });

    // If all players eliminated, end game
    if (newState.status === 'completed') {
      sendToGamePlayers(gameId, {
        type: "game_over",
        data: {
          gameId,
          state: newState,
          reason: "abandoned",
        },
      });
      activeGames.delete(gameId);
      return;
    }
  }

  activeGames.delete(gameId);
}

async function createMillionaireGame(hostId: string, playerIds: string[]) {
  try {
    // Fetch user names
    const allUserIds = [hostId, ...playerIds];
    const users = await db.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, name: true },
    });

    // Initialize game state
    const initialState = Millionaire.initializeMillionaireGame(allUserIds);

    // Create game in database
    const game = await db.game.create({
      data: {
        gameType: 'millionaire',
        gameState: JSON.stringify(initialState),
        currentTurn: null, // No turns in millionaire
        status: 'active',
      },
    });

    // Create player records
    const playerData = allUserIds.map(id => ({
      gameId: game.id,
      userId: id,
      playerRole: 'contestant',
    }));
    
    await db.gamePlayer.createMany({ data: playerData });

    // Build players list
    const players = allUserIds.map(id => {
      const user = users.find(u => u.id === id);
      return { userId: id, userName: user?.name || 'Unknown', role: 'contestant' };
    });

    // Store in active games
    activeGames.set(game.id, {
      id: game.id,
      gameType: 'millionaire',
      players,
      state: initialState,
      disconnectedPlayers: new Set(),
      disconnectTimers: new Map(),
    });

    // Notify all players
    const gameStartData = {
      gameId: game.id,
      gameType: 'millionaire',
      players,
      state: initialState,
      currentTurn: null,
    };

    players.forEach(player => {
      sendToUser(player.userId, {
        type: "game_start",
        data: gameStartData,
      });
    });
  } catch (error) {
    console.error("Error creating millionaire game:", error);
  }
}

async function handleMillionaireAnswer(data: { gameId: string; userId: string; answer: string }) {
  const { gameId, userId, answer } = data;
  
  const game = activeGames.get(gameId);
  if (!game || game.gameType !== 'millionaire') {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Game not found" },
    });
    return;
  }

  const state = game.state as Millionaire.MillionaireState;

  // Check if player is already eliminated
  if (state.playerAnswers[userId]?.isEliminated) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "You are already eliminated" },
    });
    return;
  }

  // Check if player already answered this question
  if (state.playerAnswers[userId]?.answer !== null) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "You already answered this question" },
    });
    return;
  }

  // Process answer
  const { isCorrect, newState, prizeWon } = Millionaire.processAnswer(state, userId, answer);
  game.state = newState;

  // Update database
  await db.game.update({
    where: { id: gameId },
    data: {
      gameState: JSON.stringify(newState),
      moveCount: { increment: 1 },
    },
  });

  // Send answer result to the player
  sendToUser(userId, {
    type: "millionaire_answer_result",
    data: {
      gameId,
      isCorrect,
      correctAnswer: state.currentQuestion?.correctAnswer,
      prizeWon,
      newLevel: newState.playerAnswers[userId].currentLevel,
      isEliminated: newState.playerAnswers[userId].isEliminated,
    },
  });

  // Broadcast game update to all players
  sendToGamePlayers(gameId, {
    type: "game_update",
    data: {
      gameId,
      state: newState,
      currentTurn: null,
    },
  });

  // Handle game end
  if (newState.status === 'completed') {
    const dbGame = await db.game.findUnique({
      where: { id: gameId },
      include: { players: true },
    });

    if (dbGame) {
      // Update game status
      await db.game.update({
        where: { id: gameId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      // Determine winners and update stats
      const winners: string[] = [];
      const losers: string[] = [];
      
      for (const [playerId, playerData] of Object.entries(newState.playerAnswers)) {
        if (playerId === newState.winnerId || playerData.currentLevel === Millionaire.PRIZE_LADDER.length) {
          winners.push(playerId);
        } else {
          losers.push(playerId);
        }
      }

      // Update placements and stats
      for (const winnerId of winners) {
        await db.gamePlayer.updateMany({
          where: { gameId, userId: winnerId },
          data: { placement: 1 },
        });
        await Millionaire.updateGameStats?.(winnerId, 'millionaire', 'win');
      }

      for (const loserId of losers) {
        await db.gamePlayer.updateMany({
          where: { gameId, userId: loserId },
          data: { placement: 2 },
        });
        await Millionaire.updateGameStats?.(loserId, 'millionaire', 'loss');
      }
    }

    // Broadcast game over
    sendToGamePlayers(gameId, {
      type: "game_over",
      data: {
        gameId,
        state: newState,
        winnerId: newState.winnerId,
      },
    });

    // Cleanup
    activeGames.delete(gameId);
  }
}

async function handleUseLifeline(data: { gameId: string; userId: string; lifeline: Millionaire.Lifeline }) {
  const { gameId, userId, lifeline } = data;
  
  const game = activeGames.get(gameId);
  if (!game || game.gameType !== 'millionaire') {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Game not found" },
    });
    return;
  }

  const state = game.state as Millionaire.MillionaireState;

  // Check if player is eliminated
  if (state.playerAnswers[userId]?.isEliminated) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "You are already eliminated" },
    });
    return;
  }

  // Check if lifeline already used
  if (state.usedLifelines.includes(lifeline)) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Lifeline already used" },
    });
    return;
  }

  // Use lifeline
  const newState = Millionaire.useLifeline(state, lifeline);
  game.state = newState;

  // Update database
  await db.game.update({
    where: { id: gameId },
    data: {
      gameState: JSON.stringify(newState),
    },
  });

  // Send lifeline result to the player
  sendToUser(userId, {
    type: "lifeline_result",
    data: {
      gameId,
      lifeline,
      result: newState.lifelineResults,
    },
  });

  // Broadcast to other players that a lifeline was used (but not the result)
  game.players.forEach(player => {
    if (player.userId !== userId) {
      sendToUser(player.userId, {
        type: "game_update",
        data: {
          gameId,
          state: {
            ...newState,
            lifelineResults: null, // Hide lifeline results from other players
          },
          currentTurn: null,
        },
      });
    }
  });
}

async function handleMillionaireWalkAway(data: { gameId: string; userId: string }) {
  const { gameId, userId } = data;
  
  const game = activeGames.get(gameId);
  if (!game || game.gameType !== 'millionaire') {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "Game not found" },
    });
    return;
  }

  const state = game.state as Millionaire.MillionaireState;

  // Check if player is already eliminated
  if (state.playerAnswers[userId]?.isEliminated) {
    sendToUser(userId, {
      type: "game_error",
      data: { message: "You are already eliminated" },
    });
    return;
  }

  // Walk away
  const { newState, prizeWon } = Millionaire.walkAway(state, userId);
  game.state = newState;

  // Update database
  await db.game.update({
    where: { id: gameId },
    data: {
      gameState: JSON.stringify(newState),
    },
  });

  // Send walk away result to the player
  sendToUser(userId, {
    type: "millionaire_walk_away_result",
    data: {
      gameId,
      prizeWon,
    },
  });

  // Broadcast game update to all players
  sendToGamePlayers(gameId, {
    type: "game_update",
    data: {
      gameId,
      state: newState,
      currentTurn: null,
    },
  });

  // Handle game end if all players eliminated
  if (newState.status === 'completed') {
    await db.game.update({
      where: { id: gameId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    sendToGamePlayers(gameId, {
      type: "game_over",
      data: {
        gameId,
        state: newState,
      },
    });

    activeGames.delete(gameId);
  }
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

