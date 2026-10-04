import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DnsIcon from "@mui/icons-material/Dns";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../../store/editorStore";
import { createDefaultApiConfig } from "../../../types/scene";
import { SectionHeader, inputSx, type HeaderRow } from "../apiPanelShared";

/** 全局默认请求头：本地行编辑，blur / 增删时整体提交 */
export function DefaultHeadersSection() {
  const apiConfig = useEditorStore((s) => s.apiConfig);
  const setApiConfig = useEditorStore((s) => s.setApiConfig);
  const config = apiConfig ?? createDefaultApiConfig();

  const [expanded, setExpanded] = useState(true);

  const rowsFromConfig = useCallback(
    (): HeaderRow[] => Object.entries(config.defaultHeaders ?? {}).map(([key, value]) => ({ key, value })),
    [config.defaultHeaders],
  );
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(rowsFromConfig);
  useEffect(() => setHeaderRows(rowsFromConfig()), [rowsFromConfig]);

  const headerRowsRef = useRef(headerRows);
  headerRowsRef.current = headerRows;

  const commitHeaders = useCallback(
    (rows: HeaderRow[]) => {
      const next: Record<string, string> = {};
      for (const r of rows) {
        const k = r.key.trim();
        if (k) next[k] = r.value;
      }
      setApiConfig({ defaultHeaders: next });
    },
    [setApiConfig],
  );

  const updateHeaderRow = useCallback((idx: number, patch: Partial<HeaderRow>) => {
    setHeaderRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const handleHeaderBlur = useCallback(() => {
    commitHeaders(headerRowsRef.current);
  }, [commitHeaders]);

  const addHeaderRow = useCallback(() => {
    const next = [...headerRowsRef.current, { key: "", value: "" }];
    setHeaderRows(next);
    commitHeaders(next);
  }, [commitHeaders]);

  const removeHeaderRow = useCallback(
    (idx: number) => {
      const next = headerRowsRef.current.filter((_, i) => i !== idx);
      setHeaderRows(next);
      commitHeaders(next);
    },
    [commitHeaders],
  );

  return (
    <Box>
      <SectionHeader title="默认请求头" icon={<DnsIcon sx={{ fontSize: 16 }} />} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, pl: 0.5, pt: 0.5 }}>
          {headerRows.length === 0 && (
            <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", py: 0.5 }}>
              未配置请求头，所有 API 请求仅携带默认头。
            </Typography>
          )}
          {headerRows.map((row, i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
              <TextField
                size="small"
                value={row.key}
                onChange={(e) => updateHeaderRow(i, { key: e.target.value })}
                onBlur={handleHeaderBlur}
                placeholder="Header"
                sx={{ flex: 1, minWidth: 0, ...inputSx }}
              />
              <TextField
                size="small"
                value={row.value}
                onChange={(e) => updateHeaderRow(i, { value: e.target.value })}
                onBlur={handleHeaderBlur}
                placeholder="Value"
                sx={{ flex: 1, minWidth: 0, ...inputSx }}
              />
              <Tooltip title="删除">
                <IconButton size="small" onClick={() => removeHeaderRow(i)} sx={{ color: "text.disabled", "&:hover": { color: "error.main" }, flexShrink: 0 }}>
                  <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon sx={{ fontSize: 15 }} />}
            onClick={addHeaderRow}
            sx={{ textTransform: "none", fontSize: 12, mt: 0.25 }}
          >
            添加请求头
          </Button>
          <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.6 }}>
            key 为空的行会被忽略；输入完按回车或点击其他区域生效。
          </Typography>
        </Box>
      </Collapse>
      <Divider sx={{ mt: 1.5 }} />
    </Box>
  );
}