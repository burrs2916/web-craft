/**
 * 设备状态区块：按设备分类推断并展示实时状态。
 * 从 legacyIotWidgets.tsx 迁出，仅做代码搬迁。
 */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { useDeviceStore } from '../../../../store/deviceStore';
import { deviceStateMachine, type DeviceStateName } from '../../../../store/deviceStateMachine';
import type { SceneComponent } from '../../../../types/editor';
import { CollapsibleSection } from '../CollapsibleSection';

export function DeviceStatusSection({ component }: { component: SceneComponent }) {
  const deviceId = component.config.deviceId as string | undefined;
  const productCode = component.config.productCode as string | undefined;
  const device = useDeviceStore((s) => (deviceId ? s.devices[deviceId] : undefined));
  const product = useDeviceStore((s) => (productCode ? s.products[productCode] : undefined));
  const allDevices = useDeviceStore((s) => s.devices);
  const deviceStates = useDeviceStore((s) => s.deviceStates);

  if (!deviceId || !device) return null;

  // ─── 分类推断 ───
  const isAlarm = productCode?.includes('-Alarm-') ?? false;
  const isTouch = productCode?.includes('-Alarm-Touch') ?? false;
  const isInfrared = productCode?.includes('-Alarm-Infrared') ?? false;
  const isDustAlarm = productCode?.includes('-Alarm-Dust') ?? false;
  const md = (device.metadata ?? {}) as Record<string, any>;

  // ─── 报警传感器专属状态 ───
  if (isAlarm) {
    // 触发状态 — 优先读 md.realtime.alarm.value（WS 实时推送），回退到 md.alarm
    const rtAlarm = (md.realtime as Record<string, any>)?.alarm;
    const alarmVal = rtAlarm?.value !== undefined ? rtAlarm.value : md.alarm;
    const triggered = (alarmVal as boolean) === true;
    // 电池预警 — 优先读 md.realtime.batteryWarning.value，回退到 md.batteryWarning
    const rtBw = (md.realtime as Record<string, any>)?.batteryWarning;
    const bwVal = rtBw?.value !== undefined ? rtBw.value : md.batteryWarning;
    const batteryWarn = (bwVal as boolean) === true;
    // 查找父设备（分控器）
    const parentDevice = device.parentDeviceId ? allDevices[device.parentDeviceId] : undefined;

    // 标题与文案分支
    const sectionTitle = isInfrared
      ? '红外对射状态'
      : isTouch
        ? '触控状态'
        : isDustAlarm
          ? '粉尘报警状态'
          : '报警传感器状态';
    // 触发文案 — 协议上粉尘/烟雾/红外/触控都是 alarmSensors 的一位，
    // 差异仅在物理意义（浓度越限 / 光束遮挡 / 已触控 ...）
    const triggerLabel = isInfrared
      ? triggered
        ? '光束遮挡'
        : '对射正常'
      : isTouch
        ? triggered
          ? '已触控'
          : '正常'
        : isDustAlarm
          ? triggered
            ? '浓度越限'
            : '正常'
          : triggered
            ? '已触发'
            : '正常';
    // 触发指示灯颜色：
    //   红外 — 红外红/深红
    //   触控 — 青/琥珀
    //   粉尘 — 棕/橙（区别于烟雾绿红）
    //   其他 — 绿/红
    const ledColor = isInfrared
      ? triggered
        ? '#B71C1C'
        : '#E53935'
      : isTouch
        ? triggered
          ? '#FFB300'
          : '#4A7C8A'
        : isDustAlarm
          ? triggered
            ? '#FF6F00'
            : '#6D4C41'
          : triggered
            ? '#F44336'
            : '#4CAF50';
    const ledShadow = isInfrared
      ? triggered
        ? '0 0 6px rgba(183,28,28,0.7)'
        : '0 0 4px rgba(229,57,53,0.4)'
      : isDustAlarm && triggered
        ? '0 0 6px rgba(255,111,0,0.6)'
        : triggered
          ? '0 0 6px rgba(244,67,54,0.6)'
          : 'none';

    // 告警源细分 — 协议支持 alarm + batteryWarning 两个位独立可读
    const alarmSource: 'alarm' | 'battery' | 'both' | 'normal' =
      triggered && batteryWarn ? 'both' : triggered ? 'alarm' : batteryWarn ? 'battery' : 'normal';
    const alarmSourceLabel =
      alarmSource === 'both'
        ? '浓度越限 + 电池欠压'
        : alarmSource === 'alarm'
          ? '浓度越限'
          : alarmSource === 'battery'
            ? '电池欠压'
            : '—';
    const alarmSourceColor =
      alarmSource === 'normal' ? 'text.disabled' : alarmSource === 'battery' ? 'warning.main' : 'error.main';

    return (
      <CollapsibleSection title={sectionTitle} defaultExpanded>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0.25 }}>
          {/* 在线状态 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: device.online ? 'success.main' : 'grey.400',
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{ fontSize: 10.5, color: device.online ? 'success.main' : 'text.disabled', fontWeight: 500 }}
            >
              {device.online ? '在线' : '离线'}
            </Typography>
            <Typography sx={{ fontSize: 8, color: 'text.disabled', ml: 'auto' }}>继承自分控器</Typography>
          </Box>

          {/* 触发状态 — 核心指标 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.25 }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>
              {isInfrared ? '对射状态' : isTouch ? '触控状态' : isDustAlarm ? '浓度状态' : '触发状态'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: ledColor,
                  boxShadow: ledShadow,
                }}
              />
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: triggered
                    ? isInfrared
                      ? '#B71C1C'
                      : isDustAlarm
                        ? '#FF6F00'
                        : 'error.main'
                    : isInfrared
                      ? '#E53935'
                      : isDustAlarm
                        ? '#6D4C41'
                        : 'success.main',
                }}
              >
                {triggerLabel}
              </Typography>
            </Box>
          </Box>

          {/* 告警源细分 — 协议支持 alarm + batteryWarning 两路独立位 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>告警源</Typography>
            <Typography
              sx={{ fontSize: 9.5, fontWeight: alarmSource === 'normal' ? 400 : 600, color: alarmSourceColor }}
            >
              {alarmSourceLabel}
            </Typography>
          </Box>

          {/* 设备 ID */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备ID</Typography>
            <Typography sx={{ fontSize: 9.5, color: 'text.primary', fontFamily: 'monospace' }}>
              {device.deviceId}
            </Typography>
          </Box>

          {/* 设备名称（用户自定义名 / 别名，协议无此字段，从前端 metadata 读取） */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备名称</Typography>
            <Typography
              sx={{
                fontSize: 9.5,
                color: (md.alias ?? md.deviceName ?? md.displayName) ? 'text.primary' : 'text.disabled',
              }}
            >
              {String(md.alias ?? md.deviceName ?? md.displayName ?? '未命名')}
            </Typography>
          </Box>

          {/* 产品 */}
          {product && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>产品</Typography>
              <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>{product.productName}</Typography>
            </Box>
          )}

          {/* 状态码（sensorStatusCode，协议通用位域，0x06 系列 / 字段解析规则.json:532-588）
              0=未设置 / 1=读配置错误 / 2=写配置错误 / 3=正常；后端未推送时显示 "—" */}
          {(() => {
            const rtSc = (md.realtime as Record<string, any>)?.sensorStatusCode;
            const rawSc = rtSc?.value !== undefined ? rtSc.value : md.sensorStatusCode;
            const scNum = typeof rawSc === 'number' ? rawSc : parseInt(String(rawSc ?? ''), 10);
            const SENSOR_STATUS_CODE: Record<
              number,
              { label: string; color: 'success.main' | 'error.main' | 'warning.main' | 'text.disabled' }
            > = {
              0: { label: '未设置', color: 'text.disabled' },
              1: { label: '读配置错误', color: 'error.main' },
              2: { label: '写配置错误', color: 'error.main' },
              3: { label: '正常', color: 'success.main' },
            };
            const entry = Number.isFinite(scNum) ? SENSOR_STATUS_CODE[scNum] : undefined;
            return (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>状态码</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {entry && Number.isFinite(scNum) && (
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
                  )}
                  <Typography
                    sx={{ fontSize: 9.5, fontWeight: entry ? 600 : 400, color: entry ? entry.color : 'text.disabled' }}
                  >
                    {entry && Number.isFinite(scNum) ? entry.label : '—'}
                  </Typography>
                </Box>
              </Box>
            );
          })()}

          {/* 父设备（分控器） */}
          {parentDevice && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>所属分控器</Typography>
              <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>
                {parentDevice.productName || parentDevice.deviceId}
              </Typography>
            </Box>
          )}

          {/* 测点标签 */}
          {product?.tags && product.tags.length > 0 && (
            <Box sx={{ mt: 0.25 }}>
              <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.25 }}>测点</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
                {product.tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={`${tag.name}${tag.unit ? ` (${tag.unit})` : ''}`}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 16,
                      fontSize: 8,
                      '& .MuiChip-label': { px: 0.4 },
                      borderColor: tag.id === 'alarm' ? (triggered ? 'error.main' : 'success.main') : undefined,
                      color: tag.id === 'alarm' ? (triggered ? 'error.main' : 'success.main') : undefined,
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </CollapsibleSection>
    );
  }

  // ─── 数值型传感器专属面板（CH4 18012 / CO 18013 / 粉尘 18015 / 温度 18014 / 风速 18010 / 风压 18011）───
  // 协议依据：字段解析规则.json sensorTypeRules + 命令码映射.json 0x061e 实时状态
  //   核心字段：sensorValue（浓度值，单位见 NUMERIC_SENSOR_UNITS）/ sensorFrequency（频率 Hz）/ sensorStatusCode（状态码位域）
  const isNumericSensor = productCode?.includes('-Sensor-') && !isAlarm;
  if (isNumericSensor) {
    // 传感器子类型推断（用于标题和文案差异化）
    const isCH4 = productCode?.includes('-Sensor-CH4') ?? false;
    const isCO = productCode?.includes('-Sensor-CO') ?? false;
    const isDust = productCode?.includes('-Sensor-Dust') ?? false;
    const isTemp = productCode?.includes('-Sensor-Temp') ?? false;
    const isWind = productCode?.includes('-Sensor-Wind') ?? false;
    const isWindPress = productCode?.includes('-Sensor-WindPress') ?? false;

    // 标题与文案
    const sectionTitle = isCH4
      ? '甲烷监测状态'
      : isCO
        ? '一氧化碳监测状态'
        : isDust
          ? '粉尘浓度监测状态'
          : isTemp
            ? '温度监测状态'
            : isWind
              ? '风速监测状态'
              : isWindPress
                ? '风压监测状态'
                : '传感器状态';
    const valueLabel = isCH4
      ? 'CH4 浓度'
      : isCO
        ? 'CO 浓度'
        : isDust
          ? '粉尘浓度'
          : isTemp
            ? '温度'
            : isWind
              ? '风速'
              : isWindPress
                ? '风压'
                : '当前值';

    // 读取实时数据 — 优先 md.realtime.sensorValue.value（WS 推送），回退 md.sensorValue
    const rt = (md.realtime as Record<string, any>) ?? {};
    const sensorValue = rt.sensorValue?.value !== undefined ? rt.sensorValue.value : md.sensorValue;
    const sensorFreq = rt.sensorFrequency?.value !== undefined ? rt.sensorFrequency.value : md.sensorFrequency;
    const rtSc = rt.sensorStatusCode;
    const rawSc = rtSc?.value !== undefined ? rtSc.value : md.sensorStatusCode;
    const scNum = typeof rawSc === 'number' ? rawSc : parseInt(String(rawSc ?? ''), 10);

    // 单位（从 NUMERIC_SENSOR_UNITS 获取，协议规定）
    const unit = product?.tags?.find((t) => t.id === 'sensorValue')?.unit ?? '';

    // 状态码解析（协议 sensorStatusCode 位域）
    const SENSOR_STATUS_CODE: Record<
      number,
      { label: string; color: 'success.main' | 'error.main' | 'warning.main' | 'text.disabled' }
    > = {
      0: { label: '未设置', color: 'text.disabled' },
      1: { label: '读配置错误', color: 'error.main' },
      2: { label: '写配置错误', color: 'error.main' },
      3: { label: '正常', color: 'success.main' },
    };
    const scEntry = Number.isFinite(scNum) ? SENSOR_STATUS_CODE[scNum] : undefined;

    // 查找父设备（分控器）
    const parentDevice = device.parentDeviceId ? allDevices[device.parentDeviceId] : undefined;

    // 数值格式化
    const formatValue = (val: unknown, u: string) => {
      if (val === undefined || val === null || val === '') return '—';
      const n = typeof val === 'number' ? val : parseFloat(String(val));
      if (!Number.isFinite(n)) return '—';
      // CH4/CO 保留 2 位小数，粉尘保留 3 位，温度保留 1 位，风速/风压保留 2 位
      const digits = isDust ? 3 : isTemp ? 1 : 2;
      return `${n.toFixed(digits)} ${u}`;
    };

    return (
      <CollapsibleSection title={sectionTitle} defaultExpanded>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0.25 }}>
          {/* 在线状态 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: device.online ? 'success.main' : 'grey.400',
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{ fontSize: 10.5, color: device.online ? 'success.main' : 'text.disabled', fontWeight: 500 }}
            >
              {device.online ? '在线' : '离线'}
            </Typography>
            <Typography sx={{ fontSize: 8, color: 'text.disabled', ml: 'auto' }}>继承自分控器</Typography>
          </Box>

          {/* 核心指标：当前浓度值（大字显示） */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              py: 0.5,
              mt: 0.25,
              mb: 0.25,
              bgcolor: 'action.hover',
              borderRadius: 0.5,
            }}
          >
            <Typography sx={{ fontSize: 8.5, color: 'text.secondary', mb: 0.15 }}>{valueLabel}</Typography>
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 700,
                color: device.online ? 'text.primary' : 'text.disabled',
                fontFamily: 'monospace',
                lineHeight: 1.2,
              }}
            >
              {formatValue(sensorValue, unit)}
            </Typography>
          </Box>

          {/* 频率 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>采样频率</Typography>
            <Typography sx={{ fontSize: 9.5, color: 'text.primary', fontFamily: 'monospace' }}>
              {sensorFreq !== undefined && sensorFreq !== null && sensorFreq !== ''
                ? `${typeof sensorFreq === 'number' ? sensorFreq : parseFloat(String(sensorFreq))} Hz`
                : '—'}
            </Typography>
          </Box>

          {/* 状态码 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>状态码</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {scEntry && Number.isFinite(scNum) && (
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: scEntry.color, flexShrink: 0 }} />
              )}
              <Typography
                sx={{
                  fontSize: 9.5,
                  fontWeight: scEntry ? 600 : 400,
                  color: scEntry ? scEntry.color : 'text.disabled',
                }}
              >
                {scEntry && Number.isFinite(scNum) ? scEntry.label : '—'}
              </Typography>
            </Box>
          </Box>

          {/* 设备 ID */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备ID</Typography>
            <Typography sx={{ fontSize: 9.5, color: 'text.primary', fontFamily: 'monospace' }}>
              {device.deviceId}
            </Typography>
          </Box>

          {/* 设备名称 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备名称</Typography>
            <Typography
              sx={{
                fontSize: 9.5,
                color: (md.alias ?? md.deviceName ?? md.displayName) ? 'text.primary' : 'text.disabled',
              }}
            >
              {String(md.alias ?? md.deviceName ?? md.displayName ?? '未命名')}
            </Typography>
          </Box>

          {/* 产品 */}
          {product && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>产品</Typography>
              <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>{product.productName}</Typography>
            </Box>
          )}

          {/* 所属分控器 */}
          {parentDevice && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>所属分控器</Typography>
              <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>
                {parentDevice.productName || parentDevice.deviceId}
              </Typography>
            </Box>
          )}

          {/* 测点标签 */}
          {product?.tags && product.tags.length > 0 && (
            <Box sx={{ mt: 0.25 }}>
              <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.25 }}>测点</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
                {product.tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={`${tag.name}${tag.unit ? ` (${tag.unit})` : ''}`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 16, fontSize: 8, '& .MuiChip-label': { px: 0.4 } }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </CollapsibleSection>
    );
  }

  // ─── 集控器 / 分控器 / 其他 — 通用布局 ───
  return (
    <CollapsibleSection title="设备状态" defaultExpanded>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: device.online ? 'success.main' : 'grey.400',
              flexShrink: 0,
            }}
          />
          <Typography sx={{ fontSize: 10.5, color: device.online ? 'success.main' : 'text.disabled', fontWeight: 500 }}>
            {device.online ? '在线' : '离线'}
          </Typography>
        </Box>
        {/* 设备状态机：统一状态展示（响应式读取） */}
        {(() => {
          const stateName: DeviceStateName = deviceStates[device.deviceId] ?? deviceStateMachine.getDeviceStateName(device.deviceId);
          if (stateName === 'fault') {
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0, animation: 'fault-blink 1.2s infinite', '@keyframes fault-blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
                <Typography sx={{ fontSize: 10.5, color: 'error.main', fontWeight: 500 }}>
                  故障{md.faultReason ? `：${md.faultReason}` : ''}
                </Typography>
              </Box>
            );
          }
          if (stateName === 'alarm') {
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0 }} />
                <Typography sx={{ fontSize: 10.5, color: 'warning.main', fontWeight: 500 }}>报警中</Typography>
              </Box>
            );
          }
          return null;
        })()}
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备ID</Typography>
          <Typography sx={{ fontSize: 9.5, color: 'text.primary', fontFamily: 'monospace' }}>
            {device.deviceId}
          </Typography>
        </Box>
        {product && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>产品</Typography>
            <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>{product.productName}</Typography>
          </Box>
        )}
        {product?.tags && product.tags.length > 0 && (
          <Box sx={{ mt: 0.25 }}>
            <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.25 }}>测点</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
              {product.tags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={`${tag.name}${tag.unit ? ` (${tag.unit})` : ''}`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 16, fontSize: 8, '& .MuiChip-label': { px: 0.4 } }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </CollapsibleSection>
  );
}
