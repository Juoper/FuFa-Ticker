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
    | "player_disconnected"
    | "pong"; // Heartbeat response
  data: any;
}

const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 5000; // 5 seconds to wait for pong

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export function useWebSocket(
  onMessage: (message: WebSocketMessage) => void,
  userId?: string,
  userName?: string
) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const registeredRef = useRef(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);

  // Keep onMessage ref updated without causing reconnections
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "ping", data: {} }));
          
          // Set timeout to check if we receive a pong
          heartbeatTimeoutRef.current = setTimeout(() => {
            console.warn("Heartbeat timeout - connection appears dead, reconnecting...");
            wsRef.current?.close();
          }, HEARTBEAT_TIMEOUT);
        } catch (error) {
          console.error("Failed to send heartbeat:", error);
          wsRef.current?.close();
        }
      }
    }, HEARTBEAT_INTERVAL);
  }, [clearHeartbeat]);

  const sendMessage = useCallback((type: string, data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type, data }));
        return true;
      } catch (error) {
        console.error("Failed to send message:", error);
        return false;
      }
    } else {
      console.warn("WebSocket is not connected. Cannot send message.");
      return false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    function connect() {
      // Don't attempt to connect if component is unmounted
      if (!isMountedRef.current) return;

      // Close existing connection if any
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (error) {
          console.error("Error closing existing connection:", error);
        }
        wsRef.current = null;
      }

      // Determine WebSocket URL based on current location
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log(`Attempting WebSocket connection... (attempt ${reconnectAttemptsRef.current + 1})`);

      try {
        const ws = new WebSocket(wsUrl);
        let pingResponseReceived = false;

        ws.onopen = () => {
          if (!isMountedRef.current) {
            ws.close();
            return;
          }

          console.log("WebSocket connected");
          setIsConnected(true);
          setConnectionStatus("connected");
          registeredRef.current = false;
          
          // Reset reconnection tracking
          reconnectAttemptsRef.current = 0;
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
          
          // Register user if userId and userName are provided
          if (userId && userName) {
            try {
              ws.send(JSON.stringify({
                type: "register",
                data: { userId, userName },
              }));
              registeredRef.current = true;
            } catch (error) {
              console.error("Failed to register user:", error);
            }
          }

          // Clear any pending reconnect
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }

          // Start heartbeat
          startHeartbeat();
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WebSocketMessage;
            
            // Handle pong responses for heartbeat
            if (message.type === "pong") {
              if (heartbeatTimeoutRef.current) {
                clearTimeout(heartbeatTimeoutRef.current);
                heartbeatTimeoutRef.current = null;
              }
              return;
            }
            
            // Call the current message handler
            onMessageRef.current(message);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          // The onclose handler will handle reconnection
        };

        ws.onclose = (event) => {
          console.log(`WebSocket disconnected (code: ${event.code}, reason: ${event.reason || 'none'})`);
          
          clearHeartbeat();
          
          if (!isMountedRef.current) {
            return;
          }
          
          setIsConnected(false);
          setConnectionStatus("reconnecting");
          wsRef.current = null;
          registeredRef.current = false;

          // Implement exponential backoff for reconnection
          reconnectAttemptsRef.current++;
          
          // Calculate next delay with exponential backoff
          const nextDelay = Math.min(
            reconnectDelayRef.current * Math.pow(1.5, reconnectAttemptsRef.current - 1),
            MAX_RECONNECT_DELAY
          );
          reconnectDelayRef.current = nextDelay;

          console.log(`Reconnecting in ${Math.round(nextDelay / 1000)}s...`);

          // Attempt to reconnect
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              console.log("Attempting to reconnect...");
              connect();
            }
          }, nextDelay);
        };

        wsRef.current = ws;
      } catch (error) {
        console.error("Failed to create WebSocket connection:", error);
        
        if (!isMountedRef.current) {
          return;
        }
        
        // Retry connection with exponential backoff
        reconnectAttemptsRef.current++;
        const nextDelay = Math.min(
          reconnectDelayRef.current * Math.pow(1.5, reconnectAttemptsRef.current - 1),
          MAX_RECONNECT_DELAY
        );
        reconnectDelayRef.current = nextDelay;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, nextDelay);
      }
    }

    connect();

    return () => {
      isMountedRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      clearHeartbeat();
      
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (error) {
          console.error("Error closing WebSocket on unmount:", error);
        }
        wsRef.current = null;
      }
    };
  }, [userId, userName, startHeartbeat, clearHeartbeat]);

  return { isConnected, connectionStatus, sendMessage };
}

