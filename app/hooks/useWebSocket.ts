import { useEffect, useRef, useState, useCallback } from "react";

export interface WebSocketMessage {
  type: 
    | "new_post" 
    | "delete_post"
    | "online_users"
    | "challenge_sent"
    | "challenge_received"
    | "challenge_declined"
    | "challenge_expired"
    | "challenge_cancelled"
    | "challenge_error"
    | "game_start"
    | "game_update"
    | "game_over"
    | "game_state"
    | "game_error"
    | "player_reconnected"
    | "player_disconnected";
  data: any;
}

export function useWebSocket(
  onMessage: (message: WebSocketMessage) => void,
  userId?: string,
  userName?: string
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const registeredRef = useRef(false);

  const sendMessage = useCallback((type: string, data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    } else {
      console.warn("WebSocket is not connected. Cannot send message.");
    }
  }, []);

  useEffect(() => {
    function connect() {
      // Determine WebSocket URL based on current location
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("WebSocket connected");
          setIsConnected(true);
          registeredRef.current = false;
          
          // Register user if userId and userName are provided
          if (userId && userName) {
            ws.send(JSON.stringify({
              type: "register",
              data: { userId, userName },
            }));
            registeredRef.current = true;
          }

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WebSocketMessage;
            onMessage(message);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
          console.log("WebSocket disconnected");
          setIsConnected(false);
          wsRef.current = null;
          registeredRef.current = false;

          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("Attempting to reconnect...");
            connect();
          }, 3000);
        };

        wsRef.current = ws;
      } catch (error) {
        console.error("Failed to create WebSocket connection:", error);
        // Retry connection after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [onMessage, userId, userName]);

  return { isConnected, sendMessage };
}

