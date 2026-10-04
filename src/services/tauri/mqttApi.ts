import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "./invoke";
import type { MqttConnectionConfig } from "../../types/mqtt";

export const mqttApi = {
  async connect(sourceId: string, config: MqttConnectionConfig): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_connect", { sourceId, config });
  },

  async disconnect(sourceId: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_disconnect", { sourceId });
  },

  async subscribe(sourceId: string, topic: string, qos: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_subscribe", { sourceId, topic, qos });
  },

  async unsubscribe(sourceId: string, topic: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_unsubscribe", { sourceId, topic });
  },

  async publish(sourceId: string, topic: string, payload: string, qos: number, retain: boolean): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_publish", { sourceId, topic, payload, qos, retain });
  },

  async getState(sourceId: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_get_state", { sourceId });
  },

  async testConnection(config: MqttConnectionConfig): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_test_connection", { config });
  },

  onMessage(handler: (event: { sourceId: string; topic: string; payload: string; qos: number; retain: boolean }) => void): Promise<UnlistenFn> {
    return listen("mqtt-message", (e) => {
      handler(e.payload as { sourceId: string; topic: string; payload: string; qos: number; retain: boolean });
    });
  },

  onStatusChange(handler: (event: { sourceId: string; connected: boolean; error?: string }) => void): Promise<UnlistenFn> {
    return listen("mqtt-status", (e) => {
      handler(e.payload as { sourceId: string; connected: boolean; error?: string });
    });
  },
};