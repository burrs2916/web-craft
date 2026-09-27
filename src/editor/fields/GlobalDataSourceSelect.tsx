import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import { useEditorStore } from "../../store/editorStore";

/**
 * 全局数据源绑定下拉。
 * 选中的 dataSourceId 写入组件配置 dataSourceId；空值表示"不绑定，使用本组件自带数据"。
 * 当选中值指向一个已被删除的数据源时，显示失效警告并可一键解绑。
 */
export function GlobalDataSourceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const dataSources = useEditorStore((s) => s.dataSources);
  const opts = [
    { label: "不绑定（使用本组件数据）", value: "" },
    ...dataSources.map((d) => ({ label: d.name, value: d.id })),
  ];
  const currentVal = value || "";
  const matched = opts.find((o) => o.value === currentVal);
  // 引用了不存在的数据源（已被删除 / 来自旧版本场景）
  const orphaned = currentVal !== "" && !dataSources.some((d) => d.id === currentVal);

  return (
    <Box>
      <Autocomplete
        size="small"
        fullWidth
        value={matched ? { label: matched.label, value: matched.value } : { label: currentVal, value: currentVal }}
        options={opts}
        getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.label)}
        isOptionEqualToValue={(opt, val) => opt.value === (typeof val === "string" ? val : val.value)}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder="不绑定"
            sx={{
              '& .MuiInputBase-input': { fontSize: 11.5 },
              '& .MuiOutlinedInput-root': { borderRadius: 0.75 },
              '& .MuiOutlinedInput-root:not(.MuiInputBase-multiline)': { height: 32 },
            }}
          />
        )}
        onChange={(_, newVal) => onChange(typeof newVal === "string" ? newVal : (newVal?.value ?? ""))}
      />
      {orphaned && (
        <Box
          sx={{
            mt: 0.75,
            p: 0.75,
            borderRadius: 1,
            display: "flex",
            alignItems: "center",
            gap: 1,
            bgcolor: "rgba(255,180,60,0.08)",
            border: "1px solid rgba(255,180,60,0.5)",
          }}
        >
          <Typography variant="caption" sx={{ color: "#b25f00", flex: 1, lineHeight: 1.4 }}>
            引用的数据源已被删除，当前回退到本组件自带数据
          </Typography>
          <Button size="small" color="warning" startIcon={<LinkOffIcon sx={{ fontSize: 14 }} />} onClick={() => onChange("")} sx={{ textTransform: "none", fontSize: 11, flexShrink: 0 }}>
            解除绑定
          </Button>
        </Box>
      )}
    </Box>
  );
}