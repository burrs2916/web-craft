export type MqttProtocol = "mqtt" | "mqtts" | "ws" | "wss";

export type MqttVersion = "3.1.1" | "5.0";

export type QoS = 0 | 1 | 2;

export interface MqttConnectionConfig {
  protocol: MqttProtocol;
  host: string;
  port: number;
  username: string;
  password: string;
  clientId: string;
  keepAlive: number;
  cleanSession: boolean;
  version: MqttVersion;
  reconnect: boolean;
  reconnectInterval: number;
  reconnectAttempts: number;
}

export interface MqttSubscription {
  topic: string;
  qos: QoS;
}

export interface MqttPublishOptions {
  topic: string;
  payload: string;
  qos: QoS;
  retain: boolean;
}

export const MQTT_PROTOCOL_LABELS: Record<MqttProtocol, string> = {
  mqtt: "mqtt://",
  mqtts: "mqtts://",
  ws: "ws://",
  wss: "wss://",
};

export const MQTT_VERSION_LABELS: Record<MqttVersion, string> = {
  "3.1.1": "MQTT 3.1.1",
  "5.0": "MQTT 5.0",
};

export const MQTT_DEFAULT_PORTS: Record<MqttProtocol, number> = {
  mqtt: 1883,
  mqtts: 8883,
  ws: 8083,
  wss: 8084,
};

export function createDefaultMqttConfig(partial?: Partial<MqttConnectionConfig>): MqttConnectionConfig {
  const protocol = partial?.protocol || "mqtt";
  return {
    protocol,
    host: "localhost",
    port: partial?.port || MQTT_DEFAULT_PORTS[protocol],
    username: "",
    password: "",
    clientId: `edgeview_${Math.random().toString(36).substring(2, 10)}`,
    keepAlive: 60,
    cleanSession: true,
    version: "3.1.1",
    reconnect: true,
    reconnectInterval: 5000,
    reconnectAttempts: 10,
    ...partial,
  };
}

export function buildMqttUrl(config: MqttConnectionConfig): string {
  return `${config.protocol}://${config.host}:${config.port}`;
}
