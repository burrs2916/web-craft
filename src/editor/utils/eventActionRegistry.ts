/**
 * 事件与动作注册表
 * 定义组件可用的默认事件和可执行动作
 */

export interface EventInfo {
  name: string;
  label: string;
  description: string;
}

export interface ActionInfo {
  name: string;
  label: string;
  description: string;
  /** 该动作需要的参数定义 */
  paramsSchema?: ParamField[];
}

export interface ParamField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'json' | 'scene' | 'view';
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
}

/** 所有组件通用的默认事件 */
export const DEFAULT_EVENTS: EventInfo[] = [
  { name: 'onClick', label: '点击', description: '组件被点击时触发' },
  { name: 'onDblClick', label: '双击', description: '组件被双击时触发' },
  { name: 'onMouseEnter', label: '鼠标进入', description: '鼠标进入组件区域时触发' },
  { name: 'onMouseLeave', label: '鼠标离开', description: '鼠标离开组件区域时触发' },
];

/** 数据驱动事件类型（triggerSource='data'/'threshold'/'timer' 时使用） */
export const DATA_DRIVEN_EVENTS: EventInfo[] = [
  { name: 'onDataChange', label: '数据变化', description: '监听的数据字段发生变化时触发' },
  { name: 'onThreshold', label: '阈值越限', description: '数据值越过设定阈值时触发' },
  { name: 'onTimer', label: '定时触发', description: '按设定的时间间隔自动触发' },
  { name: 'onStateChange', label: '状态切换', description: '组件状态发生变化时触发' },
];

/** 输入类组件额外提供的源事件（事件名与发布端 mapEventName 直接对应，输入事件会冒泡到组件容器） */
export const FORM_INPUT_EVENTS: EventInfo[] = [
  { name: 'input', label: '输入中', description: '输入框内容每次变化时触发' },
  { name: 'change', label: '值变更', description: '输入框内容提交（失焦）变更时触发' },
  { name: 'focus', label: '聚焦', description: '输入框获得焦点时触发' },
  { name: 'blur', label: '失焦', description: '输入框失去焦点时触发' },
  { name: 'keyup', label: '键盘抬起', description: '输入框内按键抬起时触发' },
];

/** 具备输入类事件的组件类型 */
const INPUT_COMPONENT_TYPES = new Set([
  'form-input',
  'form-textarea',
  'form-select',
  'form-slider',
  'form-rate',
  'auth-username',
  'auth-password',
  // 控制型开关：点击/回读翻转会派发冒泡 change（detail.value = 新状态）
  'switch',
]);

/** 获取事件列表（按触发源类型、组件类型过滤） */
export function getEventsForComponent(componentType?: string, triggerSource?: string): EventInfo[] {
  if (triggerSource && triggerSource !== 'interaction') {
    return [...DATA_DRIVEN_EVENTS];
  }
  if (componentType && INPUT_COMPONENT_TYPES.has(componentType)) {
    return [...DEFAULT_EVENTS, ...FORM_INPUT_EVENTS];
  }
  return [...DEFAULT_EVENTS];
}

/** 系统内置的可用动作 */
export const BUILTIN_ACTIONS: ActionInfo[] = [
  {
    name: 'navigateToScene',
    label: '跳转到场景',
    description: '导航到指定场景，可携带变量参数',
    paramsSchema: [
      { key: 'sceneId', label: '目标场景', type: 'scene', required: true },
      { key: 'viewId', label: '目标视图', type: 'view' },
      {
        key: 'openMode',
        label: '打开方式',
        type: 'select',
        options: [
          { label: '替换当前窗口', value: 'replace' },
          { label: '新窗口', value: 'newWindow' },
          { label: '弹窗', value: 'dialog' },
        ],
      },
      { key: 'variables', label: '传递变量', type: 'json', placeholder: '{"key": "value"}' },
    ],
  },
  {
    name: 'navigate',
    label: '打开链接',
    description: '在新标签页打开外部 URL',
    paramsSchema: [
      { key: 'url', label: 'URL 地址', type: 'text', required: true, placeholder: 'https://...' },
    ],
  },
  {
    name: 'highlight',
    label: '高亮',
    description: '高亮目标组件',
    paramsSchema: [
      { key: 'value', label: '高亮值', type: 'boolean' },
    ],
  },
  {
    name: 'hide',
    label: '隐藏',
    description: '隐藏目标组件',
  },
  {
    name: 'show',
    label: '显示',
    description: '显示目标组件',
  },
  {
    name: 'toggleVisible',
    label: '切换可见性',
    description: '切换目标组件的显示/隐藏状态',
  },
  {
    name: 'setData',
    label: '设置数据',
    description: '向目标组件设置数据',
    paramsSchema: [
      { key: 'property', label: '属性名', type: 'text', required: true },
      { key: 'value', label: '值', type: 'text', required: true },
    ],
  },
  {
    name: 'toggleData',
    label: '切换数据',
    description: '在两个值之间切换目标组件属性',
    paramsSchema: [
      { key: 'property', label: '属性名', type: 'text', required: true },
      { key: 'valueA', label: '值 A', type: 'text', required: true },
      { key: 'valueB', label: '值 B', type: 'text', required: true },
    ],
  },
  {
    name: 'setVariable',
    label: '设置变量',
    description: '设置场景变量的值',
    paramsSchema: [
      { key: 'variableName', label: '变量名', type: 'text', required: true },
      { key: 'value', label: '值', type: 'text', required: true },
    ],
  },
  {
    name: 'switchView',
    label: '切换视图',
    description: '切换到当前场景的指定视图',
    paramsSchema: [
      { key: 'viewId', label: '目标视图', type: 'view', required: true },
    ],
  },
  {
    name: 'playSound',
    label: '播放声音',
    description: '播放指定的声音文件或内置告警音',
    paramsSchema: [
      { key: 'sound', label: '声音类型', type: 'select', options: [
        { label: '告警蜂鸣', value: 'alarm' },
        { label: '提示音', value: 'beep' },
        { label: '成功', value: 'success' },
        { label: '错误', value: 'error' },
      ] },
    ],
  },
  {
    name: 'openDialog',
    label: '打开对话框',
    description: '以模态对话框形式打开目标场景',
    paramsSchema: [
      { key: 'sceneId', label: '目标场景', type: 'scene', required: true },
      { key: 'title', label: '对话框标题', type: 'text' },
      { key: 'width', label: '宽度(px)', type: 'number', placeholder: '800' },
      { key: 'height', label: '高度(px)', type: 'number', placeholder: '600' },
    ],
  },
  {
    name: 'closeDialog',
    label: '关闭对话框',
    description: '关闭当前打开的模态对话框',
  },
  {
    name: 'callApi',
    label: '调用接口',
    description: '发送 HTTP 请求到指定 URL',
    paramsSchema: [
      { key: 'url', label: '接口地址', type: 'text', required: true, placeholder: 'https://...' },
      { key: 'method', label: '请求方法', type: 'select', options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' },
        { label: 'DELETE', value: 'DELETE' },
      ] },
      { key: 'body', label: '请求体(JSON)', type: 'json', placeholder: '{"key": "value"}' },
    ],
  },
  {
    name: 'executeScript',
    label: '执行脚本',
    description: '执行自定义 JavaScript 脚本（沙箱环境）',
    paramsSchema: [
      { key: 'script', label: '脚本代码', type: 'text', required: true, placeholder: '// payload 为事件数据\nreturn payload.value;' },
    ],
  },
];

/**
 * 获取指定目标组件可用的动作列表
 * 合并内置动作与组件自定义动作
 */
export function getActionsForTarget(_componentType?: string): ActionInfo[] {
  return [...BUILTIN_ACTIONS];
}
