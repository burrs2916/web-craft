import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import type { ConfigField } from '../../../types/editor';
import { useDeviceStore } from '../../../store/deviceStore';
import { generateDefaultTags } from '../../../devices/edgeConductorDefaults';
import type { DeviceCategory } from '../../../types/device';

export function TagMultiSelectField({
  field,
  value,
  onChange,
  config,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config: Record<string, unknown>;
}) {
  // 从 store 动态获取最新 product tags（不依赖 dynamicOptions 闭包）
  const productCode = config.productCode as string | undefined;
  const currentProduct = productCode ? useDeviceStore.getState().getProduct(productCode) : undefined;
  // 兜底：当 deviceStore.products 未加载时（如 provider 尚未返回），
  // 从 productCode 直接推断 isAlarmProduct / devCategory / tags，
  // 确保组件库拖入的模板也能正确显示报警传感器专属字段
  const pcStr = currentProduct?.productCode ?? productCode ?? '';
  const isAlarmProduct = pcStr.includes('-Alarm-');
  // ─── 独立设备类型（不复用通用分支） ───
  // 清洗煤壁传感器（18035）：独立报警型，不归入 alarmSensors 位域
  const isCleanWall = pcStr.includes('-CleanWall');
  // 流量计（18040）/ 压力泵（18041）：独立 auxiliary 设备
  const isFlowMeter = pcStr === 'FY002-FlowMeter';
  const isPump = pcStr === 'FY002-Pump';
  const isCollector = pcStr === 'FY002-Collector-Wireless' || pcStr === 'FY002-Collector-Wired';
  const devCategory =
    currentProduct?.category ??
    (isCleanWall || pcStr.includes('-Alarm-') || pcStr.includes('-Sensor-')
      ? 'sensor'
      : isFlowMeter || isPump
        ? 'auxiliary'
        : pcStr.includes('MainController')
          ? 'main'
          : pcStr.includes('SubController') || pcStr.includes('Collector')
            ? 'sub'
            : ((config.category as string | undefined) ?? ''));
  // tags 兜底：当 store 中无产品定义时，用 edgeConductorDefaults 生成
  const tags = currentProduct?.tags ?? (pcStr ? generateDefaultTags(devCategory as DeviceCategory, pcStr) : []);
  const isFace = field.key === 'faceContent';
  // 内置字段（不来自 product tags，不参与互斥）—— 按设备类型区分
  // 协议依据：0x061e 实时状态返回
  //   数值型传感器（frequencySensors 数组）：sensorId / sensorType / sensorFrequency / sensorValue / sensorStatusCode
  //   报警型传感器（controllers 数组中的位域）：alarmSensors / batteryWarning / alarmSensorInfo
  //   sensorStatusCode（2字节位域）：bit0=未设置 bit1=读配置错误 bit2=写配置错误 bit3=未连接设备
  //                                bit4=断网 bit5=超预设置 bit6=超量程
  const builtInOpts = isFace
    ? isCleanWall
      ? [
          // 清洗煤壁传感器 faceContent（独立实现，不复用报警型通用字段）
          // 协议来源：0x061e clean 字段（utf8 字符串，清洗支架列表）
          { label: '设备名称', value: '__builtin_name__', builtIn: true },
          { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
          // cleanTrigger tag 由后端从 0x061e clean 字段解析后推送
        ]
      : isFlowMeter
        ? [
            // 流量计 faceContent（独立设备类型）
            // 协议来源：0x0626 流量计数据上传
            { label: '设备名称', value: '__builtin_name__', builtIn: true },
            { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
          ]
        : isPump
          ? [
              // 压力泵 faceContent（独立设备类型）
              // 协议来源：0x0627 压力泵数据上传，仅 startStatus 一个字段
              { label: '设备名称', value: '__builtin_name__', builtIn: true },
              { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
            ]
        : isCollector
          ? [
              // 信号采集器 faceContent（18002 无线 / 18003 有线）
              // 协议来源：wirelessAddressRules，subController 类型
              { label: '设备名称', value: '__builtin_name__', builtIn: true },
              { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
              { label: '所属集控器', value: '__builtin_parentName__', builtIn: true },
            ]
          : isAlarmProduct
            ? [
                // 报警型传感器 faceContent（面板显示字段）
                { label: '设备名称', value: '__builtin_name__', builtIn: true },
                { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                { label: '所属分控器', value: '__builtin_parentName__', builtIn: true },
              ]
            : devCategory === 'main'
              ? [
                  { label: '设备名称', value: '__builtin_name__', builtIn: true },
                  { label: '设备ID', value: '__builtin_id__', builtIn: true },
                  { label: 'IP地址', value: '__builtin_ip__', builtIn: true },
                ]
              : devCategory === 'sub'
                ? [
                    { label: '设备名称', value: '__builtin_name__', builtIn: true },
                    { label: '分控器编号', value: '__builtin_controllerId__', builtIn: true },
                    { label: '所属集控器', value: '__builtin_parentName__', builtIn: true },
                  ]
                : [
                    // 数值型传感器 faceContent（CH4/CO/温度/粉尘/风速/风压）
                    // 协议 0x061e frequencySensors：sensorId（1B 分控器内编号），没有独立 deviceId
                    { label: '设备名称', value: '__builtin_name__', builtIn: true },
                    { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                  ]
    : isCleanWall
      ? [
          // 清洗煤壁传感器 screenContent（屏幕显示字段）
          // 协议字段：cleanTrigger（清洗触发状态）
          { label: '清洗触发', value: '__builtin_cleanTrigger__', builtIn: true },
          { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
        ]
      : isFlowMeter
        ? [
            // 流量计 screenContent（屏幕显示字段）
            // 协议字段：instantFlow（瞬时流量）/ totalFlow（累计流量）
            { label: '瞬时流量', value: '__builtin_instantFlow__', builtIn: true },
            { label: '累计流量', value: '__builtin_totalFlow__', builtIn: true },
            { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
          ]
        : isPump
          ? [
              // 压力泵 screenContent（屏幕显示字段）
              // 协议字段：startStatus（启动状态：0=停止 1=运行）
              { label: '启动状态', value: '__builtin_startStatus__', builtIn: true },
              { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
            ]
        : isCollector
          ? [
              // 信号采集器 screenContent（18002 无线 / 18003 有线）
              // 协议来源：subController，采集传感器数据
              { label: '传感器数', value: '__builtin_subSensorCount__', builtIn: true },
              { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
            ]
          : isAlarmProduct
            ? [
                // 报警型传感器 screenContent（屏幕显示字段）
                // 协议字段：alarmSensors 位域 → 触发状态
                { label: '触发状态', value: '__builtin_alarmTrigger__', builtIn: true },
                // 协议字段：batteryWarning 位域 → 电池预警
                { label: '电池预警', value: '__builtin_batteryWarn__', builtIn: true },
                // 协议字段：alarm + batteryWarning 两位独立可读，合法组合解读
                { label: '告警源', value: '__builtin_alarmSource__', builtIn: true },
                // 协议字段：sensorStatusCode（字段解析规则.json:532-588）2字节位域
                { label: '状态码', value: '__builtin_statusCode__', builtIn: true },
                // 协议字段：alarmSensorInfo（字段解析规则.json:376-469）已注册/未注册
                { label: '告警注册', value: '__builtin_alarmRegistered__', builtIn: true },
                { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                { label: '所属分控器', value: '__builtin_parentName__', builtIn: true },
              ]
            : devCategory === 'main'
              ? [
                  { label: '分控器数', value: '__builtin_subCount__', builtIn: true },
                  { label: '传感器数', value: '__builtin_sensorCount__', builtIn: true },
                ]
              : devCategory === 'sub'
                ? [
                    // 协议：controllerState 位域（1字节）
                    //   bit0=前喷 bit1=后喷 bit2=清洗 → 合并为"喷洒状态"
                    //   bit3=电池预警 → "电池预警"
                    //   bit4=通讯故障 → "通讯故障"
                    //   bit5/6=前/后强喷（强喷状态，可后续扩展）
                    { label: '喷洒状态', value: '__builtin_sprayStatus__', builtIn: true },
                    { label: '电池预警', value: '__builtin_batteryWarn__', builtIn: true },
                    { label: '通讯故障', value: '__builtin_commFault__', builtIn: true },
                    { label: '传感器数', value: '__builtin_subSensorCount__', builtIn: true },
                    { label: '所属集控器', value: '__builtin_parentName__', builtIn: true },
                  ]
                : [
                    // 数值型传感器 screenContent（CH4/CO/温度/粉尘/风速/风压）
                    // 协议 0x061e frequencySensors：sensorId（1B 分控器内编号），没有独立 deviceId
                    { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                    // 协议字段：sensorStatusCode（2字节位域）
                    { label: '状态码', value: '__builtin_statusCode__', builtIn: true },
                  ];
  // 动态 tag 字段（来自 product tags，参与互斥）
  // 协议依据：屏幕/面板"内容"选择器只展示**实时数据字段（0x061e 实时状态返回）**和**内置字段**
  //   0x060f 配置型字段（minRange/maxRange/alarmLow/alarmHigh/calibrationZero）是配置参数，
  //   不是实时数据，不应在内容选择器中出现，仅在 configSchema 的"量程配置/报警阈值/校准"组暴露
  const CONFIG_TAG_IDS = new Set([
    'minRange',
    'maxRange',
    'alarmLow',
    'alarmHigh',
    'calibrationZero',
    // 小写兼容（后端可能推 snake_case 名字到 product.tags，需过滤）
    'min_range',
    'max_range',
    'alarm_low',
    'alarm_high',
    'calibration_zero',
  ]);
  // 与内置字段重复的 tag：内置字段已提供位域解析/语义化文案，不再作为 tag 选项暴露
  //   online           → __builtin_onlineStatus__（内置字段解析 device.online）
  //   alarm            → __builtin_alarmTrigger__（内置字段按位域解析 + 语义化文案）
  //   batteryWarning   → __builtin_batteryWarn__（内置字段按位域解析）
  //   alarmSensorInfo  → __builtin_alarmRegistered__（内置字段按位域解析 + 匹配传感器类型）
  //   sensorStatusCode → __builtin_statusCode__（内置字段按位域解析 bit0-bit6）
  // ─── 独立设备重复 tag ───
  //   cleanTrigger    → __builtin_cleanTrigger__（清洗煤壁传感器）
  //   instantFlow     → __builtin_instantFlow__（流量计）
  //   totalFlow       → __builtin_totalFlow__（流量计）
  //   startStatus     → __builtin_startStatus__（压力泵）
  const BUILTIN_DUPLICATE_TAGS = new Set([
    'online',
    'alarm',
    'batteryWarning',
    'alarmSensorInfo',
    'sensorStatusCode',
    'cleanTrigger',
    'instantFlow',
    'totalFlow',
    'startStatus',
  ]);
  // writable tag（可写控制 tag）不应出现在"内容选择器"中：
  //   它们是控制指令（如 spray.frontSpray），不是实时数据展示字段
  //   控制指令通过 configSchema 的"控制"组暴露，不参与面板/屏幕内容选择
  const realtimeTags = tags.filter(
    (t) => !CONFIG_TAG_IDS.has(t.id) && !BUILTIN_DUPLICATE_TAGS.has(t.id) && !t.writable,
  );
  const tagOpts = realtimeTags.map((t) => ({
    label: `${t.name}${t.unit ? ` (${t.unit})` : ''}`,
    value: t.id,
    builtIn: false,
  }));
  const opts = [...builtInOpts, ...tagOpts];
  if (opts.length === 0) return null;
  // 值：字符串数组 或 逗号分隔字符串
  const selected: string[] = (() => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string' && value) return value.split(',').filter(Boolean);
    return [];
  })();
  // 另一个字段的 key 和已选值（仅 tag 类字段互斥，内置字段不互斥）
  const otherKey = isFace ? 'screenContent' : 'faceContent';
  const otherSelected: string[] = (() => {
    const ov = config[otherKey];
    if (Array.isArray(ov)) return ov as string[];
    if (typeof ov === 'string' && ov) return ov.split(',').filter(Boolean);
    return [];
  })();
  const toggleTag = (tagValue: string, isBuiltIn: boolean) => {
    const next = selected.filter((v) => !v.startsWith('__default__'));
    const idx = next.indexOf(tagValue);
    if (idx >= 0) {
      next.splice(idx, 1);
    } else {
      next.push(tagValue);
      // 非内置字段：如果另一侧已选同一 tag，自动从另一侧移除
      if (!isBuiltIn && otherSelected.includes(tagValue)) {
        const otherNext = otherSelected.filter((v) => v !== tagValue);
        onChange(otherKey, otherNext.length > 0 ? otherNext : []);
      }
    }
    onChange(field.key, next.length > 0 ? next : []);
  };
  return (
    <Box>
      <Typography sx={{ fontSize: 10, color: 'text.secondary', mb: 0.25, fontWeight: 500 }}>
        {field.label}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.15, maxHeight: 180, overflow: 'auto' }}>
        {builtInOpts.length > 0 && tagOpts.length > 0 && (
          <Typography sx={{ fontSize: 8.5, color: 'text.disabled', px: 0.5, mt: 0.25 }}>内置字段</Typography>
        )}
        {builtInOpts.map((opt) => {
          const optVal = String(opt.value);
          const isSelected = selected.includes(optVal);
          return (
            <Box
              key={optVal}
              onClick={() => toggleTag(optVal, true)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 0.5,
                py: 0.15,
                borderRadius: 0.5,
                cursor: 'pointer',
                bgcolor: isSelected ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
              }}
            >
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: 0.5,
                  border: 1,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  bgcolor: isSelected ? 'primary.main' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                {isSelected && (
                  <Typography sx={{ fontSize: 9, color: 'primary.contrastText', lineHeight: 1 }}>✓</Typography>
                )}
              </Box>
              <Typography
                sx={{
                  fontSize: 10,
                  color: isSelected ? 'text.primary' : 'text.secondary',
                  fontWeight: isSelected ? 500 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {opt.label}
              </Typography>
            </Box>
          );
        })}
        {tagOpts.length > 0 && (
          <Typography sx={{ fontSize: 8.5, color: 'text.disabled', px: 0.5, mt: 0.25 }}>数据字段</Typography>
        )}
        {tagOpts.map((opt) => {
          const optVal = String(opt.value);
          const isSelected = selected.includes(optVal);
          const isConflict = otherSelected.includes(optVal);
          return (
            <Box
              key={optVal}
              onClick={() => !isConflict && toggleTag(optVal, false)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 0.5,
                py: 0.15,
                borderRadius: 0.5,
                cursor: isConflict ? 'not-allowed' : 'pointer',
                bgcolor: isSelected ? 'action.selected' : 'transparent',
                opacity: isConflict ? 0.4 : 1,
                '&:hover': isConflict ? {} : { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
              }}
            >
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: 0.5,
                  border: 1,
                  borderColor: isSelected ? 'primary.main' : isConflict ? 'warning.main' : 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  bgcolor: isSelected ? 'primary.main' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                {isSelected && (
                  <Typography sx={{ fontSize: 9, color: 'primary.contrastText', lineHeight: 1 }}>✓</Typography>
                )}
              </Box>
              <Typography
                sx={{
                  fontSize: 10,
                  color: isSelected ? 'text.primary' : isConflict ? 'warning.main' : 'text.secondary',
                  fontWeight: isSelected ? 500 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {opt.label}
              </Typography>
              {isConflict && (
                <Typography sx={{ fontSize: 8, color: 'warning.main', flexShrink: 0 }}>已选另一侧</Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}