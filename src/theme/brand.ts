/**
 * WebCraft 品牌设计令牌 —— 全站唯一权威来源。
 * 品牌叙事：WebCraft = 本地打造个人网站的"网络工匠"工作台
 * （内容创作 · 静态构建 · 一键部署）。
 * 三色体系与业务一一对应：
 *   - 品牌蓝 blue  = 构建/主色（专业、可信赖的网站构建工具）
 *   - 天蓝 sky    = 网络/云/连接（信息强调，站点上线后的世界）
 *   - 琥珀 amber  = 部署/上线/发射（行动强调，呼应 Logo 发射箭头）
 */
export const brand = {
  /** 品牌渐变：由深蓝走向天蓝 */
  gradient: 'linear-gradient(135deg, #2563EB 0%, #0EA5E9 100%)',
  gradientHover: 'linear-gradient(135deg, #1D4ED8 0%, #0284C7 100%)',
  /** 辉光：用于高亮/选中/关键行动 */
  glow: '0 0 24px rgba(37, 99, 235, 0.35)',
  /** 品牌蓝（主色） */
  blue50: '#EFF6FF',
  blue100: '#DBEAFE',
  blue200: '#BFDBFE',
  blue300: '#93C5FD',
  blue400: '#60A5FA',
  blue500: '#3B82F6',
  blue600: '#2563EB',
  blue700: '#1D4ED8',
  blue800: '#1E40AF',
  blue900: '#1E3A8A',
  /** 天蓝（上线/网络/连接） */
  sky300: '#7DD3FC',
  sky400: '#38BDF8',
  sky500: '#0EA5E9',
  sky600: '#0284C7',
  sky700: '#0369A1',
  /** 智能体（AI 协作者）子品牌紫 —— 与主色区分，标识"AI 赋能"，全站统一引用避免散写 */
  agent: '#A78BFA',
  agentHover: '#B79CFA',
  agentSoft: 'rgba(167, 139, 250, 0.14)',
  /** 琥珀（部署/上线/发射强调） */
  amber200: '#FDE68A',
  amber300: '#FCD34D',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  amber600: '#D97706',
  amber700: '#B45309',
  /** 暗色 / 亮色语义角色 */
  dark: {
    primary: '#60A5FA',
    primaryLight: '#93C5FD',
    primaryDark: '#2563EB',
    accent: '#38BDF8',
    secondary: '#FBBF24',
    background: '#0B1220',
    paper: '#0F172A',
    elevated: '#1E293B',
    text: '#E2E8F0',
    textSecondary: '#94A3B8',
    divider: 'rgba(59, 130, 246, 0.16)',
    border: 'rgba(59, 130, 246, 0.10)',
    selectionBg: 'rgba(59, 130, 246, 0.28)',
    hoverBg: 'rgba(59, 130, 246, 0.08)',
    selectedBg: 'rgba(59, 130, 246, 0.12)',
  },
  light: {
    primary: '#2563EB',
    primaryLight: '#3B82F6',
    primaryDark: '#1D4ED8',
    accent: '#0284C7',
    secondary: '#D97706',
    background: '#F8FAFC',
    paper: '#FFFFFF',
    elevated: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#64748B',
    divider: 'rgba(37, 99, 235, 0.12)',
    border: 'rgba(37, 99, 235, 0.10)',
    selectionBg: 'rgba(37, 99, 235, 0.22)',
    hoverBg: 'rgba(37, 99, 235, 0.06)',
    selectedBg: 'rgba(37, 99, 235, 0.08)',
  },
};
