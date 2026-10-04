// EditorApiConfigPanel 拆分：被锁面板共用的纯展示件 + 类型/常量。
// 注意：本文件刻意不包含任何「契约锁」字符串（fieldOf("dataMode")/isHidden("dataSourceId")/
// f.group === "数据源"/API_MAPPING_RENDERED_KEYS/api* 键），契约测试聚合扫描
// EditorApiConfigPanel/ 目录下的 .tsx（含 ComponentApiSection.tsx），本文件在目录之外，故
// 仅把这些无锁的共用件外移，被锁逻辑集中在 ComponentApiSection.tsx。
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export function SectionHeader({
  title,
  icon,
  expanded,
  onToggle,
  extra,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: "pointer",
        userSelect: "none",
        py: 0.75,
        "&:hover": { opacity: 0.8 },
      }}
    >
      <Box sx={{ color: "primary.main", display: "flex", alignItems: "center", fontSize: 18 }}>
        {icon}
      </Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: "text.primary", fontSize: 12.5, flex: 1, letterSpacing: 0.3 }}
      >
        {title}
      </Typography>
      {extra}
      <Box sx={{ color: "text.disabled", display: "flex", alignItems: "center" }}>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
      </Box>
    </Box>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 10.5, lineHeight: 1.6, px: 0.5, display: "block" }}>
      {children}
    </Typography>
  );
}

export function SettingRow({
  label,
  children,
  labelWidth = 72,
}: {
  label: string;
  children: React.ReactNode;
  labelWidth?: number;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 34 }}>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", width: labelWidth, flexShrink: 0, fontSize: 12, lineHeight: "34px" }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

export const inputSx = {
  "& .MuiInputBase-input": { fontSize: 12.5, py: 0.5, px: 1 },
  "& .MuiInputBase-root": { minHeight: 30 },
  "& .MuiInputLabel-root": { fontSize: 12.5 },
} as const;

export type HeaderRow = { key: string; value: string };

export const RULE_HINTS: Array<{ title: string; desc: string }> = [
  { title: "完整 URL 直连", desc: "组件 apiUrl 为 http(s):// 开头时原样使用，忽略基地址" },
  { title: "相对路径拼接", desc: "组件 apiUrl 为相对路径时自动拼接基地址（处理首尾斜杠）" },
  { title: "基地址兜底", desc: "组件 apiUrl 为空且使用 apiPath 时，用基地址 + apiPath 拼接" },
  { title: "全局兜底", desc: "apiUrl/apiPath 均为空时，请求基线即基地址本身" },
];
