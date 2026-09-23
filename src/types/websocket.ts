export interface WebSocketConfig {
  reconnect: boolean;
  reconnectInterval: number;
}

export function createDefaultWebSocketConfig(partial?: Partial<WebSocketConfig>): WebSocketConfig {
  return {
    reconnect: true,
    reconnectInterval: 5000,
    ...partial,
  };
}
