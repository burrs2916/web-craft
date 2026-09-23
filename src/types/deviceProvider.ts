/**
 * DeviceProvider 接口
 *
 * 抽象设备数据的加载来源，支持多种 Provider 模式：
 * - EmptyProvider：默认空 Provider（等待配置数据源）
 * - JsonFileDeviceProvider：从 JSON 文件导入
 * - DataSourceDeviceProvider：复用现有 DataSource 体系
 * - RestApiDeviceProvider：对接任意 REST API（如 edge-conductor）
 *
 * V2 扩展：多 Provider 联邦、插件化 Provider
 */
import type { DeviceInstance, DeviceChangeEvent, ProductDefinition } from "./device";

// ─── 结构化命令结果 ───

export interface CommandResult {
  success: boolean;
  /** 命令状态码（0=成功, 400=参数错误, 404=设备离线, 503=设备未连接） */
  code: number;
  /** 后端原始 msg */
  msg: string;
  /** 命令码 */
  commandCode: string;
  /** 设备 ID */
  deviceId?: string;
}

export interface DeviceProvider {
  id: string;
  name: string;
  type: "mock" | "json" | "datasource" | "rest" | "custom";

  /** 加载设备清单 */
  loadDevices(): Promise<DeviceInstance[]>;

  /** 加载产品定义 */
  loadProducts(): Promise<ProductDefinition[]>;

  /** 可选：增量监听设备变更 */
  subscribeChanges?(cb: (event: DeviceChangeEvent) => void): () => void;

  /** 可选：实时数据订阅 */
  subscribeData?(
    deviceId: string,
    tagId: string,
    cb: (value: unknown) => void,
  ): () => void;

  /** 可选：写控制 */
  writeTag?(deviceId: string, tagId: string, value: unknown): Promise<void>;

  /**
   * 可选：下发结构化协议命令（对接 edge-conductor POST /api/devices/:id/command）。
   * command 为 4 位 16 进制命令码，params 为该命令对应的业务参数。
   * 返回结构化结果，供 UI 呈现"已下发/设备离线/参数错误"等状态。
   */
  sendCommand?(
    deviceId: string,
    command: string,
    params?: Record<string, unknown>,
  ): Promise<CommandResult>;

  /** 可选：释放 Provider 持有的连接/订阅 */
  destroy?(): void;
}
