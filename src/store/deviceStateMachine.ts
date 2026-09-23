/**
 * 设备状态机
 *
 * 统一 fault / alarm / warning / online 散落字段，
 * 提供单一真相的"当前设备状态"。
 *
 * 状态优先级（高→低）：fault > alarm > warning > normal > offline
 *
 * WS 推送 fault/alarm/online 变化时自动计算新状态，
 * 触发 onStateChange 回调驱动视觉表现。
 */

import { logger } from "../utils/logger";

export type DeviceStateName = "offline" | "normal" | "warning" | "alarm" | "fault";

export interface DeviceStateContext {
  deviceId: string;
  state: DeviceStateName;
  previousState: DeviceStateName;
  faultReason?: string;
  lastTransitionAt: number;
}

/** 状态中文标签 */
export const DEVICE_STATE_LABELS: Record<DeviceStateName, string> = {
  offline: "离线",
  normal: "正常",
  warning: "预警",
  alarm: "报警",
  fault: "故障",
};

/** 状态对应颜色 */
export const DEVICE_STATE_COLORS: Record<DeviceStateName, string> = {
  offline: "#9e9e9e",
  normal: "#4caf50",
  warning: "#ff9800",
  alarm: "#ff5722",
  fault: "#f44336",
};

export interface DeviceMetadataLike {
  fault?: boolean;
  alarm?: boolean;
  warning?: boolean;
  faultReason?: string;
}

/**
 * 根据设备元数据和在线状态计算设备状态
 * 状态优先级：fault > alarm > warning > normal > offline
 */
export function computeDeviceState(md: DeviceMetadataLike, online: boolean): DeviceStateName {
  if (!online) return "offline";
  if (md.fault === true) return "fault";
  if (md.alarm === true) return "alarm";
  if (md.warning === true) return "warning";
  return "normal";
}

type StateChangeCallback = (ctx: DeviceStateContext) => void;

/**
 * 设备状态机管理器
 * 维护所有设备的状态上下文，WS 消息更新时自动转换
 */
export class DeviceStateMachine {
  private states: Map<string, DeviceStateContext> = new Map();
  private callbacks: Set<StateChangeCallback> = new Set();

  /**
   * 更新设备状态（由 deviceStore 在 WS 消息到达时调用）
   * 返回是否发生了状态转换
   */
  updateDeviceState(
    deviceId: string,
    md: DeviceMetadataLike,
    online: boolean,
  ): boolean {
    const newState = computeDeviceState(md, online);
    const existing = this.states.get(deviceId);

    if (existing && existing.state === newState) {
      // 状态未变，只更新 faultReason（如果有）
      if (md.faultReason !== existing.faultReason) {
        existing.faultReason = md.faultReason;
      }
      return false;
    }

    // 状态转换
    const prev = existing?.state ?? "offline";
    const ctx: DeviceStateContext = {
      deviceId,
      state: newState,
      previousState: prev,
      faultReason: md.faultReason,
      lastTransitionAt: Date.now(),
    };
    this.states.set(deviceId, ctx);

    logger.info("DeviceStateMachine", "State transition", {
      deviceId,
      from: prev,
      to: newState,
      faultReason: md.faultReason,
    });

    // 通知回调
    for (const cb of this.callbacks) {
      try {
        cb(ctx);
      } catch (e) {
        logger.warn("DeviceStateMachine", "State change callback error", { error: e });
      }
    }

    return true;
  }

  /** 获取设备当前状态上下文 */
  getDeviceState(deviceId: string): DeviceStateContext | undefined {
    return this.states.get(deviceId);
  }

  /** 获取设备当前状态名（不存在则返回 offline） */
  getDeviceStateName(deviceId: string): DeviceStateName {
    return this.states.get(deviceId)?.state ?? "offline";
  }

  /** 订阅状态变化，返回取消函数 */
  onStateChange(cb: StateChangeCallback): () => void {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  /** 批量初始化状态（从 deviceStore 加载时调用） */
  initFromDevices(devices: Array<{ id: string; online: boolean; metadata?: Record<string, unknown> }>): void {
    for (const dev of devices) {
      const md = (dev.metadata ?? {}) as DeviceMetadataLike;
      const state = computeDeviceState(md, dev.online);
      this.states.set(dev.id, {
        deviceId: dev.id,
        state,
        previousState: state,
        faultReason: md.faultReason,
        lastTransitionAt: Date.now(),
      });
    }
  }

  /** 移除设备状态 */
  removeDevice(deviceId: string): void {
    this.states.delete(deviceId);
  }

  /** 清空所有状态 */
  clear(): void {
    this.states.clear();
    this.callbacks.clear();
  }
}

/** 全局单例 */
export const deviceStateMachine = new DeviceStateMachine();
