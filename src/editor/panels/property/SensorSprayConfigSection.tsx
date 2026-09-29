import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { useDeviceStore } from '../../../store/deviceStore';
import { commitNumberDraft, useClearableNumber } from '../../data/numberDraft';
import { CollapsibleSection } from './CollapsibleSection';
import { fieldSx } from './sharedStyles';

// ═══════════════════════════════════════════════════════════════
// 喷雾控制工具栏专属：动态传感器喷雾参数配置面板
// 协议来源：0x0614 传感器喷雾参数设置
// 设计原则：
//   - 设备是动态发现的，只有监测到某个传感器时才出现对应配置项
//   - productCode → sensorType 映射来自协议 spraySensorTypeRules
//   - 所有0614命令发给集控器（集控器统一管理传感器喷雾参数）
// ═══════════════════════════════════════════════════════════════

/** 协议 spraySensorTypeRules：productCode → sensorType 映射 */
export const SPRAY_SENSOR_TYPE_MAP: Record<string, number> = {
  "18020": 0,   // 割煤机位置传感器
  "18021": 1,   // 移架传感器
  "18022": 2,   // 落架传感器
  "18023": 3,   // 放顶煤传感器
  "18024": 4,   // 烟雾传感器
  "18025": 5,   // 温度报警传感器
  "18026": 6,   // 红外传感器
  "18027": 7,   // 触控传感器
  "18029": 9,   // 粉尘传感器
  "18030": 10,  // CO传感器
  "18031": 11,  // 火焰传感器
  "18035": 15,  // 清洗煤壁传感器
};

/** 传感器类型中文名（协议 spraySensorTypeRules 定义） */
export const SPRAY_SENSOR_TYPE_NAMES: Record<number, string> = {
  0: "割煤机位置", 1: "移架", 2: "落架", 3: "放顶煤",
  4: "烟雾", 5: "温度报警", 6: "红外", 7: "触控",
  9: "粉尘", 10: "CO", 11: "火焰", 15: "清洗煤壁",
};

/** 传感器类型图标颜色 */
export const SPRAY_SENSOR_COLORS: Record<number, string> = {
  0: "#78909c", 1: "#66bb6a", 2: "#ef5350", 3: "#8d6e63",
  4: "#7e57c2", 5: "#ff7043", 6: "#26c6da", 7: "#5c6bc0",
  9: "#ffa726", 10: "#ec407a", 11: "#e53935", 15: "#29b6f6",
};

/** 0614命令喷雾位置选项 */
export const SPRAY_POSITION_OPTIONS = [
  { label: "前喷", value: 0 },
  { label: "后喷", value: 1 },
  { label: "前后喷", value: 2 },
  { label: "清洗", value: 3 },
];

/** 0614命令风向选项 */
export const WIND_DIRECTION_OPTIONS = [
  { label: "无风", value: 0 },
  { label: "顺风", value: 1 },
  { label: "逆风", value: 2 },
];

export interface SensorSprayConfig {
  sprayPosition: number;
  windDirection: number;
  waterCurtainInterval: number;
  waterCurtainCount: number;
  sprayDelayTime: number;
}

/** 单个传感器类型的喷雾参数配置 */
export function SensorTypeSprayConfig({
  sensorType,
  sensorTypeName,
  sensorCount,
  mainControllerId,
}: {
  sensorType: number;
  sensorTypeName: string;
  sensorCount: number;
  mainControllerId: string;
}) {
  const [config, setConfig] = useState<SensorSprayConfig>({
    sprayPosition: 2,        // 默认：前后喷
    windDirection: 0,        // 默认：无风
    waterCurtainInterval: 5, // 默认：5
    waterCurtainCount: 3,    // 默认：3
    sprayDelayTime: 200,     // 默认：200ms
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleApply = async () => {
    setSending(true);
    setResult(null);
    try {
      const response = await fetch(`/api/devices/${mainControllerId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "0614",
          params: {
            sensorType,
            sprayPosition: config.sprayPosition,
            windDirection: config.windDirection,
            waterCurtainInterval: config.waterCurtainInterval,
            waterCurtainCount: config.waterCurtainCount,
            sprayDelayTime: config.sprayDelayTime,
          },
        }),
      });
      const res = await response.json();
      if (res.code === 0) {
        setResult({ ok: true, msg: "设置成功" });
      } else {
        setResult({ ok: false, msg: res.msg || "设置失败" });
      }
    } catch (err) {
      setResult({ ok: false, msg: String(err) });
    } finally {
      setSending(false);
      setTimeout(() => setResult(null), 3000);
    }
  };

  const color = SPRAY_SENSOR_COLORS[sensorType] || "#9e9e9e";

  // 可清空草稿层：协议数值参数，清空失焦 = 保持原值（empty: 'keep'）
  const intervalDraft = useClearableNumber(config.waterCurtainInterval);
  const countDraft = useClearableNumber(config.waterCurtainCount);
  const delayDraft = useClearableNumber(config.sprayDelayTime);
  return (
    <Box
      sx={{
        border: 1, borderColor: "divider", borderRadius: 1,
        overflow: "hidden", mb: 1,
      }}
    >
      {/* 头部：传感器类型名 + 数量 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1, py: 0.5, bgcolor: "action.hover" }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 10, fontWeight: 600, flex: 1 }}>
          {sensorTypeName}传感器
        </Typography>
        <Typography sx={{ fontSize: 9, color: "text.secondary" }}>
          sensorType={sensorType} · {sensorCount}个
        </Typography>
      </Box>

      {/* 参数配置区域 */}
      <Box sx={{ px: 1, py: 0.75, display: "flex", flexDirection: "column", gap: 0.75 }}>
        {/* 喷雾位置 + 风向 */}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 9, color: "text.secondary", mb: 0.25 }}>喷雾位置</Typography>
            <Box sx={{ display: "flex", gap: 0.25 }}>
              {SPRAY_POSITION_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  size="small"
                  variant={config.sprayPosition === opt.value ? "contained" : "outlined"}
                  onClick={() => setConfig({ ...config, sprayPosition: opt.value })}
                  sx={{ fontSize: 9, py: 0.15, px: 0.5, minWidth: 0, flex: 1 }}
                >
                  {opt.label}
                </Button>
              ))}
            </Box>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 9, color: "text.secondary", mb: 0.25 }}>风向</Typography>
            <Box sx={{ display: "flex", gap: 0.25 }}>
              {WIND_DIRECTION_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  size="small"
                  variant={config.windDirection === opt.value ? "contained" : "outlined"}
                  onClick={() => setConfig({ ...config, windDirection: opt.value })}
                  sx={{ fontSize: 9, py: 0.15, px: 0.5, minWidth: 0, flex: 1 }}
                >
                  {opt.label}
                </Button>
              ))}
            </Box>
          </Box>
        </Box>

        {/* 水幕间隔 + 水幕数量 */}
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            label="水幕间隔"
            type="number"
            size="small"
            value={intervalDraft.display}
            onChange={(e) => {
              const n = intervalDraft.change(e.target.value);
              if (n !== null) setConfig({ ...config, waterCurtainInterval: n });
            }}
            onBlur={() => {
              const t = intervalDraft.end();
              if (t === null) return;
              const c = commitNumberDraft(t, { empty: 'keep' });
              if (c !== null && c !== undefined) setConfig({ ...config, waterCurtainInterval: c });
            }}
            sx={{ flex: 1, ...fieldSx }}
          />
          <TextField
            label="水幕数量"
            type="number"
            size="small"
            value={countDraft.display}
            onChange={(e) => {
              const n = countDraft.change(e.target.value);
              if (n !== null) setConfig({ ...config, waterCurtainCount: n });
            }}
            onBlur={() => {
              const t = countDraft.end();
              if (t === null) return;
              const c = commitNumberDraft(t, { empty: 'keep' });
              if (c !== null && c !== undefined) setConfig({ ...config, waterCurtainCount: c });
            }}
            sx={{ flex: 1, ...fieldSx }}
          />
        </Box>

        {/* 喷雾延迟时间 */}
        <TextField
          label="喷雾延迟时间 (ms)"
          type="number"
          size="small"
          fullWidth
          value={delayDraft.display}
          onChange={(e) => {
            const n = delayDraft.change(e.target.value);
            if (n !== null) setConfig({ ...config, sprayDelayTime: n });
          }}
          onBlur={() => {
            const t = delayDraft.end();
            if (t === null) return;
            const c = commitNumberDraft(t, { empty: 'keep' });
            if (c !== null && c !== undefined) setConfig({ ...config, sprayDelayTime: c });
          }}
          sx={fieldSx}
        />

        {/* 应用按钮 + 结果 */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button
            size="small"
            variant="contained"
            disabled={sending}
            onClick={handleApply}
            sx={{ fontSize: 9, py: 0.2, flex: 1 }}
          >
            {sending ? "发送中..." : "应用配置 (0614)"}
          </Button>
          {result && (
            <Typography sx={{ fontSize: 9, color: result.ok ? "success.main" : "error.main" }}>
              {result.msg}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** 传感器喷雾参数配置区（整体面板） */
export function SensorSprayConfigSection({
  mainControllerIds,
}: {
  mainControllerIds: string[];
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const devicesMap = useDeviceStore((s) => s.devices) as unknown as Record<string, Record<string, unknown>>;

  // 查询所有集控器下属的可触发喷雾的传感器
  const spraySensors = useMemo(() => {
    if (mainControllerIds.length === 0) return [];
    return Object.values(devicesMap)
      .filter((d: any) => {
        const parentId = String(d.parentDeviceId ?? "");
        // 检查是否属于任一集控器（直接或间接）
        const belongsToAny = mainControllerIds.some(mcId => {
          if (parentId === mcId) return true;
          // 间接隶属：传感器的父设备是分控器，分控器的父设备是集控器
          const parentDevice = devicesMap[parentId] as Record<string, unknown> | undefined;
          return parentDevice && String(parentDevice.parentDeviceId ?? "") === mcId;
        });
        if (!belongsToAny) return false;
        const pc = String(d.productCode ?? "");
        return pc in SPRAY_SENSOR_TYPE_MAP;
      })
      .map((d: any) => ({
        deviceId: String(d.deviceId),
        productCode: String(d.productCode),
        sensorType: SPRAY_SENSOR_TYPE_MAP[String(d.productCode)] ?? -1,
        sensorTypeName: SPRAY_SENSOR_TYPE_NAMES[SPRAY_SENSOR_TYPE_MAP[String(d.productCode)] ?? -1] ?? "未知",
      }));
  }, [devicesMap, mainControllerIds]);

  // 按传感器类型分组
  const sensorTypeGroups = useMemo(() => {
    const groups: Record<number, { sensorType: number; sensorTypeName: string; count: number }> = {};
    spraySensors.forEach(s => {
      if (!groups[s.sensorType]) {
        groups[s.sensorType] = { sensorType: s.sensorType, sensorTypeName: s.sensorTypeName, count: 0 };
      }
      groups[s.sensorType].count++;
    });
    return Object.values(groups).sort((a, b) => a.sensorType - b.sensorType);
  }, [spraySensors]);

  return (
    <CollapsibleSection
      title="传感器喷雾参数"
      defaultExpanded={false}
    >
      <Box sx={{ pt: 0.5, px: 0.25 }}>
        {mainControllerIds.length === 0 ? (
          <Typography sx={{ fontSize: 10, color: "text.disabled", textAlign: "center", py: 1 }}>
            请先绑定集控器
          </Typography>
        ) : spraySensors.length === 0 ? (
          <Typography sx={{ fontSize: 10, color: "text.disabled", textAlign: "center", py: 1 }}>
            所选集控器下暂无可触发喷雾的传感器
          </Typography>
        ) : (
          <>
            <Typography sx={{ fontSize: 9, color: "text.secondary", mb: 0.5 }}>
              协议0x0614：发现 {spraySensors.length} 个可触发喷雾的传感器，
              {sensorTypeGroups.length} 种类型
            </Typography>
            {sensorTypeGroups.map(group => (
              <SensorTypeSprayConfig
                key={group.sensorType}
                sensorType={group.sensorType}
                sensorTypeName={group.sensorTypeName}
                sensorCount={group.count}
                mainControllerId={mainControllerIds[0]}
              />
            ))}
          </>
        )}
      </Box>
    </CollapsibleSection>
  );
}
