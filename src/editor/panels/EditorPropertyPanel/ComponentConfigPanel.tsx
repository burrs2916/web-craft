import { memo, useCallback } from 'react';
import Box from '@mui/material/Box';

import type { ConfigField, SceneComponent } from '../../../types/editor';
import { useEditorStore } from '../../../store/editorStore';
import { useDeviceStore } from '../../../store/deviceStore';
import { componentRegistry } from '../../registry';
import { CollapsibleSection } from '../property/CollapsibleSection';
import { SensorSprayConfigSection } from '../property/SensorSprayConfigSection';
import { SchemaFieldRow } from './ConfigFieldRenderer';
import { resolveConfigFieldValue } from './shared';

export const ComponentConfigPanel = memo(function ComponentConfigPanel({ component }: { component: SceneComponent }) {
  const updateComponentConfig = useEditorStore((s) => s.updateComponentConfig);
  const updateComponent = useEditorStore((s) => s.updateComponent);
  const updateComponentTransform = useEditorStore((s) => s.updateComponentTransform);
  const allComponents = useEditorStore((s) => s.components);
  const definition = componentRegistry.get(component.type);

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      const patch: Record<string, unknown> = { [key]: value };

      // productCode 变更联动：清除旧 deviceId，更新组件名称
      if (key === 'productCode' && value !== component.config.productCode) {
        patch.deviceId = '';
        const product = useDeviceStore.getState().getProduct(value as string);
        if (product) {
          updateComponent(component.id, { name: product.productName });
        }
      }

      // progress 切到圆形联动改框：线性默认框 280×20 会把圆压扁（factor=min(w/80,h/80)=0.25→20px）。
      // 框改成方形，边长 = clamp(max(w,h), circleSize, circleSize×2)：缩放系数恰落在 [1,2]
      // （progressCircleFit 的 max），圆正好铺满方框、无多余留白。圆环直径范围 40~200（面板同款夹取）。
      if (component.type === 'progress' && key === 'shape' && value === 'circle' && component.config.shape !== 'circle') {
        const t = component.transform;
        const circleSize = Math.min(Math.max(Number(component.config.circleSize ?? 80), 40), 200);
        const side = Math.round(Math.min(Math.max(Math.max(t.width, t.height), circleSize), circleSize * 2));
        if (Math.round(t.width) !== side || Math.round(t.height) !== side) {
          updateComponentTransform(component.id, { width: side, height: side });
        }
      }

      updateComponentConfig(component.id, patch);
    },
    [component.id, component.type, component.config, component.transform, updateComponentConfig, updateComponent, updateComponentTransform],
  );

  const schema = definition?.configSchema || [];

  // 网站编辑器不再提供数据源相关字段（含"全局数据源"下拉、"数据模式/静态数据/接口读取"等），
  // 直接过滤，属性面板不再出现"数据源"分组/字段，界面更简洁。数据源改由系统设置统一管理。
  const WEBSITE_UNAVAILABLE_FIELD_TYPES = new Set([
    'dataSourceInfo', 'datasource', 'datafield', 'dbTable', 'dbColumn',
    'deviceSelect', 'deviceMultiSelect', 'keyValueMapping', 'action',
    'global-datasource',
  ]);

  const groups = new Map<string, ConfigField[]>();
  schema.forEach((field) => {
    if (field.type && WEBSITE_UNAVAILABLE_FIELD_TYPES.has(field.type)) return;
    if (field.group === '数据源') return;
    const group = field.group || '通用';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(field);
  });

  if (schema.length === 0) return null;

  // 核心分组默认展开（组数 >3 时仅展开这些，其余折叠）
  const PRIORITY_GROUPS = new Set([
    '内容', '排版', '颜色', '动画',  // 基础分组
    '面板', '数据源', '面板样式',  // 内容面板核心分组
    '类型选择',  // 折线图预设类型选择器（最重要）
    '基础', '线条样式', '数据点', '轴配置', '交互', '主题',  // 折线图核心分组
    '数据源', '样式',  // 其他图表常用分组
    'API 配置', '表单字段', 'UI 样式', '注册后行为',  // 认证表单基础分组
    'SSO 配置', 'Token 交换', '认证联动', '登录后行为', 'OAuth 配置',  // SSO/OAuth 基础分组
    'API Key 配置', '基本配置', '行为',  // API Key / LogoutButton 基础分组
    '未登录内容', '门禁行为', '认证校验', '联动配置',  // AuthGuard 分组
    '高级配置', '端点配置', '响应字段映射', 'Token 存储配置', 'Token 刷新配置',  // LoginForm 高级分组
    '自定义请求头（多租户等）', '动态表单参数',  // LoginForm 高级分组
    '快速开始', '表单配置', '高级选项',  // RegisterForm 分组
    '显示选项', '动态展示配置（从缓存键映射）',  // UserProfile 分组
  ]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {Array.from(groups.entries()).map(([group, fields]) => (
        <CollapsibleSection key={group} title={group} defaultExpanded={groups.size <= 3 || PRIORITY_GROUPS.has(group)}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 0.5, px: 0.25 }}>
            {fields.map((field) => (
              <SchemaFieldRow
                key={field.key}
                field={field}
                value={resolveConfigFieldValue(component.config, field)}
                onChange={handleChange}
                config={component.config}
                allComponents={allComponents}
                componentId={component.id}
              />
            ))}
          </Box>
        </CollapsibleSection>
      ))}

      {/* ━━━ 喷雾控制工具栏专属：动态传感器喷雾参数配置面板（协议0614） ━━━ */}
      {component.type === 'industrial-spray-control-toolbar' && (
        <SensorSprayConfigSection
          mainControllerIds={(component.config.selectedDeviceIds as string[]) ?? []}
          config={component.config}
          onChange={handleChange}
        />
      )}
    </Box>
  );
});