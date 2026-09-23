import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps, ConfigField } from "../../types/editor";

function renderFieldValue(value: unknown, field: ConfigField): React.ReactNode {
  if (value === undefined || value === null) {
    return <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>{field.placeholder || "未设置"}</Typography>;
  }

  switch (field.type) {
    case "color":
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: String(value), border: "1px solid rgba(255,255,255,0.1)" }} />
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontSize: 10 }}>
            {String(value)}
          </Typography>
        </Box>
      );
    case "toggle":
      return (
        <Typography variant="caption" sx={{ color: value ? "#4CAF50" : "rgba(255,255,255,0.4)", fontSize: 10 }}>
          {value ? "✓ 开启" : "✗ 关闭"}
        </Typography>
      );
    case "select": {
      const opt = field.options?.find((o) => o.value === value);
      return (
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}>
          {opt?.label || String(value)}
        </Typography>
      );
    }
    case "json":
      return (
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", fontFamily: "monospace", fontSize: 9, wordBreak: "break-all" }}>
          {typeof value === "object" ? JSON.stringify(value).slice(0, 80) : String(value).slice(0, 80)}
        </Typography>
      );
    case "textarea":
      return (
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", fontSize: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {String(value).slice(0, 200)}
        </Typography>
      );
    case "slider":
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ flex: 1, height: 3, borderRadius: 1.5, bgcolor: "rgba(255,255,255,0.1)", position: "relative", overflow: "hidden" }}>
            <Box sx={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${Math.min(100, Math.max(0, ((Number(value) - (field.min ?? 0)) / ((field.max ?? 100) - (field.min ?? 0))) * 100))}%`,
              bgcolor: "rgba(33,150,243,0.6)", borderRadius: 1.5,
            }} />
          </Box>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontSize: 9, minWidth: 20, textAlign: "right" }}>
            {String(value)}
          </Typography>
        </Box>
      );
    case "number":
      return (
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontSize: 11 }}>
          {String(value)}
        </Typography>
      );
    case "file":
      return (
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          📎 {String(value) || "未选择文件"}
        </Typography>
      );
    default:
      return (
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}>
          {String(value)}
        </Typography>
      );
  }
}

export function SchemaDrivenRenderer({ config }: ComponentRendererProps) {
  const schemaFields = (config.__configSchema as ConfigField[] | undefined) || [];
  const displayName = (config.__componentName as string) || "自定义组件";

  const visibleFields = schemaFields.filter((f) => {
    if (f.hidden && f.hidden(config)) return false;
    return true;
  });

  const grouped = new Map<string, ConfigField[]>();
  for (const field of visibleFields) {
    const group = field.group || "配置";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(field);
  }

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "rgba(0,0,0,0.15)",
        borderRadius: 1,
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent)",
          flexShrink: 0,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 0.5 }}>
          {displayName}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
        {grouped.size === 0 || visibleFields.length === 0 ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.3)" }}>
              暂无配置项
            </Typography>
          </Box>
        ) : (
          Array.from(grouped.entries()).map(([group, fields]) => (
            <Box key={group} sx={{ mb: 0.75 }}>
              {grouped.size > 1 && (
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 600, letterSpacing: 0.5, mb: 0.25, display: "block" }}>
                  {group}
                </Typography>
              )}
              {fields.map((field) => (
                <Box
                  key={field.key}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    py: 0.25,
                    px: 0.5,
                    borderRadius: 0.5,
                    "&:hover": { bgcolor: "rgba(255,255,255,0.03)" },
                  }}
                >
                  <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.4)", fontSize: 10, flexShrink: 0, mr: 1 }}>
                    {field.label}
                  </Typography>
                  <Box sx={{ flex: 1, textAlign: "right", overflow: "hidden" }}>
                    {renderFieldValue(config[field.key], field)}
                  </Box>
                </Box>
              ))}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
