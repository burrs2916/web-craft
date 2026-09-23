/**
 * alarmHistoryStore — 设备报警历史
 *
 * 职责：
 * - 订阅 deviceStore.status_changed 事件，记录 alarm 进入/离开
 * - 维护最近 N 条报警（默认 500）
 * - 提供按设备 / 按时间筛选能力
 * - 提供未确认数量统计（用于 UI 红点）
 *
 * === 增强：相对旧的真实报警历史 ===
 * 旧实现：仅在组件内本地 useState 记录，刷新即丢失
 * 新实现：全局 store + 内存限制 + 订阅写入
 */
import { create } from "zustand";
import { useDeviceStore } from "./deviceStore";
import { settingsApi } from "../services/tauri";
import { logger } from "../utils/logger";

export interface AlarmRecord {
  id: string;
  deviceId: string;
  productCode?: string;
  productName?: string;
  /** 报警传感器子类型：smoke/touch/infrared/dustAlarm/...（P0-3 增强：用于报警历史面板筛选与图标）
   *  - dustAlarm : 粉尘报警（18029，-Alarm-Dust）
   *  - dust      : 粉尘浓度（18015，数值型，正常情况不应进入报警历史）
   */
  sensorType?: "smoke" | "touch" | "infrared" | "dustAlarm" | "dust" | "alarm" | "numeric" | "unknown";
  /** "enter" = 进入报警；"leave" = 退出报警 */
  type: "enter" | "leave";
  timestamp: number;
  /** 是否已被用户确认/查看 */
  acknowledged: boolean;
}

interface AlarmHistoryState {
  records: AlarmRecord[];
  /** 总数（含 enter+leave 配对）；UI 上一般显示"未确认 enter 数" */
  unreadEnterCount: number;
  /** 是否已启动订阅（仅一次） */
  subscribed: boolean;

  /** 启动订阅（幂等） */
  startSubscription(): void;
  /** 手动追加一条（外部测试 / 集成其它数据源用） */
  pushRecord(record: Omit<AlarmRecord, "id" | "timestamp" | "acknowledged">): void;
  /** 标记指定 record 已确认 */
  acknowledge(id: string): void;
  /** 全部确认 */
  acknowledgeAll(): void;
  /** 清空历史 */
  clear(): void;
  /** 查指定设备的报警记录 */
  getByDevice(deviceId: string): AlarmRecord[];
  /** 查未确认 enter */
  getUnread(): AlarmRecord[];

  // === 增强 P6-4：统计（24h 按小时分桶） ===
  /** 24 小时按小时分桶的 enter 数量（索引 0 = 24h 前，23 = 当前小时） */
  hourlyTrend24h(): number[];
  /** 当前未确认 enter 数量按设备分组的 topN */
  topUnreadByDevice(limit: number): Array<{ deviceId: string; productName?: string; count: number }>;

  // === 增强 P5-1：持久化（启动加载 + 增量节流落盘） ===
  /** 从后端加载历史（启动时调） */
  loadFromBackend(): Promise<void>;
}

const MAX_RECORDS = 500;
const STORAGE_KEY = "alarm_history_v1";
/** 报警偏好设置 key（声音 + 系统通知开关） */
const PREF_KEY = "alarm_prefs_v1";
/** 节流：5s 内最多落盘 1 次 */
const SAVE_THROTTLE_MS = 5000;
let subscribeStarted = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePending = false;

/** 报警偏好（启动时加载；用户可在 UI 中切换） */
export interface AlarmPreferences {
  soundEnabled: boolean;
  notifyEnabled: boolean;
}
const DEFAULT_PREFS: AlarmPreferences = { soundEnabled: true, notifyEnabled: true };
let cachedPrefs: AlarmPreferences = { ...DEFAULT_PREFS };

/** 异步加载偏好（幂等；不阻塞主流程） */
export async function loadAlarmPreferences(): Promise<AlarmPreferences> {
  try {
    const raw = await settingsApi.get(PREF_KEY);
    if (!raw) return cachedPrefs;
    const parsed = JSON.parse(raw);
    cachedPrefs = {
      soundEnabled: parsed?.soundEnabled !== false,
      notifyEnabled: parsed?.notifyEnabled !== false,
    };
  } catch {
    /* swallow */
  }
  return cachedPrefs;
}

/** 更新偏好（立即写入后端） */
export async function setAlarmPreferences(prefs: Partial<AlarmPreferences>): Promise<AlarmPreferences> {
  cachedPrefs = { ...cachedPrefs, ...prefs };
  try {
    await settingsApi.set(PREF_KEY, JSON.stringify(cachedPrefs));
  } catch (err) {
    logger.warn("AlarmHistoryStore", "persist prefs failed", { error: String(err) });
  }
  return cachedPrefs;
}

/** 当前是否启用声音 */
export function isAlarmSoundEnabled(): boolean {
  return cachedPrefs.soundEnabled;
}

/** 当前是否启用系统通知 */
export function isAlarmNotifyEnabled(): boolean {
  return cachedPrefs.notifyEnabled;
}

// === 增强 P6-1：系统通知 + 声音节流（避免短时间多条轰炸） ===
const NOTIFY_THROTTLE_MS = 5000;
const SOUND_THROTTLE_MS = 2000;
let lastNotifyAt = 0;
let lastSoundAt = 0;
let audioCtx: AudioContext | null = null;

/** 合成报警音（Web Audio API，无需音频文件） */
function playAlarmBeep(): void {
  if (typeof window === "undefined") return;
  if (!cachedPrefs.soundEnabled) return;
  const now = Date.now();
  if (now - lastSoundAt < SOUND_THROTTLE_MS) return;
  lastSoundAt = now;
  try {
    if (!audioCtx) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    // 双频 beep：800Hz + 600Hz 各 80ms
    const t0 = audioCtx.currentTime;
    const beep = (freq: number, startOffset: number) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      gain.gain.setValueAtTime(0, t0 + startOffset);
      gain.gain.linearRampToValueAtTime(0.18, t0 + startOffset + 0.01);
      gain.gain.linearRampToValueAtTime(0, t0 + startOffset + 0.08);
      osc.start(t0 + startOffset);
      osc.stop(t0 + startOffset + 0.09);
    };
    beep(800, 0);
    beep(600, 0.12);
    beep(800, 0.24);
  } catch (err) {
    logger.debug("AlarmHistoryStore", "alarm sound failed (non-fatal)", { error: String(err) });
  }
}

/** 检测当前是否在预览/编辑器等非主窗口中（无通知权限） */
function isNonMainWindow(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (path.startsWith("/component-preview/") || path.startsWith("/preview/") || path.startsWith("/map-editor/")) return true;
  // 预览窗口 URL 形如 http://127.0.0.1:<随机端口>/ ，路径为根 /
  // 主窗口在 Tauri 下也是 http://localhost:<port>/ ，但主窗口的 hostname 是 localhost
  // 预览窗口的 hostname 是 127.0.0.1 且路径为 / 时判定为预览窗口
  if (window.location.hostname === "127.0.0.1" && path === "/") return true;
  return false;
}

/** Tauri 原生系统通知（通过 tauri-plugin-notification 桥接；动态 import，web 环境优雅降级） */
async function fireTauriNotification(title: string, body: string): Promise<boolean> {
  // 非主窗口无通知权限，直接返回（防御性检查，避免 Tauri IPC 层拒绝）
  if (isNonMainWindow()) return false;
  try {
    // 动态 import 避免 web 打包失败
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = false;
    try {
      granted = await mod.isPermissionGranted();
    } catch {
      granted = false;
    }
    if (!granted) {
      try {
        const perm = await mod.requestPermission();
        granted = perm === "granted";
      } catch {
        granted = false;
      }
    }
    if (granted) {
      mod.sendNotification({ title, body });
      return true;
    }
  } catch {
    /* not in Tauri context */
  }
  return false;
}

/** 浏览器/Tauri WebView 原生通知（已申请权限时直接弹）
 *  - 浏览器/部分 webview：使用 window.Notification
 *  - Tauri WebView：fallback 到 tauri-plugin-notification
 *  - 节流 + 偏好双重控制
 */
function fireSystemNotification(title: string, body: string): void {
  if (typeof window === "undefined") return;
  // 非主窗口（组件预览/场景预览/地图编辑器/预览窗口）无通知权限，直接跳过
  if (isNonMainWindow()) return;
  if (!cachedPrefs.notifyEnabled) return;
  const now = Date.now();
  if (now - lastNotifyAt < NOTIFY_THROTTLE_MS) return;
  lastNotifyAt = now;
  try {
    if (typeof window.Notification !== "undefined") {
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: undefined, tag: "edgeview-alarm" });
        return;
      }
      if (Notification.permission !== "denied") {
        void Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            new Notification(title, { body, tag: "edgeview-alarm" });
          } else {
            // 浏览器拒绝时再尝试 Tauri 插件（很多 webview 默认无 Notification）
            void fireTauriNotification(title, body);
          }
        });
        return;
      }
    }
    // 没有 Notification API（如部分 Tauri WebView）→ Tauri 插件
    void fireTauriNotification(title, body);
  } catch (err) {
    logger.debug("AlarmHistoryStore", "system notification failed (non-fatal)", { error: String(err) });
  }
}

async function flushPersist(records: AlarmRecord[]): Promise<void> {
  try {
    await settingsApi.set(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    logger.warn("AlarmHistoryStore", "persist failed", { error: String(err) });
  }
}

function schedulePersist(records: AlarmRecord[]): void {
  if (saveTimer) {
    savePending = true;
    return;
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushPersist(records);
    if (savePending) {
      savePending = false;
      // 下个 tick 再排一次（捕获最近一次变更）
      schedulePersist(records);
    }
  }, SAVE_THROTTLE_MS);
}

export const useAlarmHistoryStore = create<AlarmHistoryState>((set, get) => ({
  records: [],
  unreadEnterCount: 0,
  subscribed: false,

  startSubscription() {
    if (subscribeStarted) return;
    subscribeStarted = true;
    set({ subscribed: true });

    // 订阅 deviceStore 的状态变化：检测 alarm 状态翻转
    // 不破坏：仅订阅，不修改 deviceStore 自身
    useDeviceStore.subscribe((state, prev) => {
      if (state.devices === prev.devices) return;
      const prevDevices = prev.devices;
      for (const [deviceId, device] of Object.entries(state.devices)) {
        const prevDevice = prevDevices[deviceId];
        const prevAlarm = Boolean((prevDevice?.metadata as any)?.alarm);
        const curAlarm = Boolean((device.metadata as any)?.alarm);
        if (prevAlarm === curAlarm) continue;
        const product = state.products[device.productCode];
        get().pushRecord({
          deviceId,
          productCode: device.productCode,
          productName: product?.productName,
          type: curAlarm ? "enter" : "leave",
        });
      }
    });

    logger.info("AlarmHistoryStore", "Subscribed to deviceStore status changes");
  },

  pushRecord(input) {
    const record: AlarmRecord = {
      ...input,
      id: `alm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      acknowledged: false,
      // P0-3 增强：若 caller 未传 sensorType，则从 productCode 推断（与 CardVariantRenderer 一致）
      // 粉尘报警（18029，-Alarm-Dust）单独识别为 dustAlarm，与数值型粉尘 18015 区分
      sensorType: input.sensorType ?? (input.productCode?.includes("-Alarm-Smoke")
        ? "smoke"
        : input.productCode?.includes("-Alarm-Touch")
        ? "touch"
        : input.productCode?.includes("-Alarm-Infrared")
        ? "infrared"
        : input.productCode?.includes("-Alarm-Dust")
        ? "dustAlarm"
        : input.productCode?.includes("-Alarm-")
        ? "alarm"
        : "unknown"),
    };
    let nextRecords: AlarmRecord[] = [];
    set((state) => {
      // 限制长度：FIFO（最早移除）
      nextRecords = [record, ...state.records];
      if (nextRecords.length > MAX_RECORDS) nextRecords.length = MAX_RECORDS;
      const unreadEnterCount = nextRecords.filter(
        (r) => r.type === "enter" && !r.acknowledged,
      ).length;
      return { records: nextRecords, unreadEnterCount };
    });
    // === 增强 P5-1：变更后节流落盘 ===
    schedulePersist(nextRecords);
    // === 增强 P6-1：新报警触发系统通知 + 声音（仅 enter；偏好与节流已内置） ===
    if (record.type === "enter") {
      const deviceName = record.productName || record.productCode || record.deviceId;
      fireSystemNotification("设备报警", `${deviceName} 触发报警`);
      playAlarmBeep();
    }
  },

  acknowledge(id) {
    let nextRecords: AlarmRecord[] = [];
    set((state) => {
      nextRecords = state.records.map((r) =>
        r.id === id ? { ...r, acknowledged: true } : r,
      );
      const unreadEnterCount = nextRecords.filter(
        (r) => r.type === "enter" && !r.acknowledged,
      ).length;
      return { records: nextRecords, unreadEnterCount };
    });
    schedulePersist(nextRecords);
  },

  acknowledgeAll() {
    let nextRecords: AlarmRecord[] = [];
    set((state) => {
      nextRecords = state.records.map((r) => ({ ...r, acknowledged: true }));
      return { records: nextRecords, unreadEnterCount: 0 };
    });
    schedulePersist(nextRecords);
  },

  clear() {
    set({ records: [], unreadEnterCount: 0 });
    schedulePersist([]);
  },

  getByDevice(deviceId) {
    return get().records.filter((r) => r.deviceId === deviceId);
  },

  getUnread() {
    return get().records.filter(
      (r) => r.type === "enter" && !r.acknowledged,
    );
  },

  // === 增强 P6-4：24h 按小时分桶（索引 0 = 23h 前，23 = 当前小时） ===
  hourlyTrend24h() {
    const buckets = new Array(24).fill(0) as number[];
    const now = Date.now();
    for (const r of get().records) {
      if (r.type !== "enter") continue;
      const ageMs = now - r.timestamp;
      if (ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) continue;
      const hourIdx = 23 - Math.floor(ageMs / (60 * 60 * 1000));
      if (hourIdx >= 0 && hourIdx < 24) buckets[hourIdx] += 1;
    }
    return buckets;
  },

  topUnreadByDevice(limit) {
    const map = new Map<string, { deviceId: string; productName?: string; count: number; sensorType?: AlarmRecord["sensorType"] }>();
    for (const r of get().records) {
      if (r.type !== "enter" || r.acknowledged) continue;
      const cur = map.get(r.deviceId);
      if (cur) {
        cur.count += 1;
        // 取最新一条的 sensorType（用最新记录覆盖，确保最新报警类型）
        if (r.sensorType) cur.sensorType = r.sensorType;
      } else {
        map.set(r.deviceId, {
          deviceId: r.deviceId,
          productName: r.productName,
          count: 1,
          sensorType: r.sensorType,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  // === 增强 P5-1：从后端加载历史（启动时调；解析失败安全忽略） ===
  async loadFromBackend() {
    try {
      const raw = await settingsApi.get(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      // 防御性：仅保留可识别的字段
      const valid: AlarmRecord[] = parsed
        .filter((x: any) => x && typeof x === "object" && typeof x.id === "string")
        .slice(0, MAX_RECORDS)
        .map((x: any) => ({
          id: String(x.id),
          deviceId: String(x.deviceId ?? ""),
          productCode: x.productCode,
          productName: x.productName,
          type: x.type === "enter" ? "enter" : "leave",
          timestamp: Number(x.timestamp) || Date.now(),
          acknowledged: x.acknowledged === true,
        }));
      const unreadEnterCount = valid.filter(
        (r) => r.type === "enter" && !r.acknowledged,
      ).length;
      set({ records: valid, unreadEnterCount });
      logger.info("AlarmHistoryStore", "History loaded from backend", { count: valid.length });
    } catch (err) {
      logger.debug("AlarmHistoryStore", "loadFromBackend failed (non-fatal)", { error: String(err) });
    }
  },
}));
