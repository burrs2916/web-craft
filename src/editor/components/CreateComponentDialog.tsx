import { useState, useCallback } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { pluginLoader } from "../plugins";
import { componentRegistry } from "../registry";
import { CATEGORY_LABELS } from "../../types/editor";
import type { ConfigField } from "../../types/editor";

interface CreateComponentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface SchemaFieldEntry {
  key: string;
  label: string;
  type: ConfigField["type"];
  group: string;
  defaultValue: string;
  options: string;
  min: string;
  max: string;
  placeholder: string;
}

const FIELD_TYPES: { label: string; value: ConfigField["type"] }[] = [
  { label: "文本", value: "text" },
  { label: "数字", value: "number" },
  { label: "选择", value: "select" },
  { label: "颜色", value: "color" },
  { label: "开关", value: "toggle" },
  { label: "滑块", value: "slider" },
  { label: "多行文本", value: "textarea" },
  { label: "JSON", value: "json" },
  { label: "文件", value: "file" },
];

const ICON_OPTIONS = [
  "widgets", "text_fields", "image", "crop_square", "bar_chart", "speed",
  "map", "architecture", "wallpaper", "public", "whatshot", "videocam",
  "palette", "auto_awesome", "extension", "functions",
  "table_chart", "timeline", "pie_chart", "scatter_plot", "layers",
];

function createEmptyField(): SchemaFieldEntry {
  return {
    key: "",
    label: "",
    type: "text",
    group: "配置",
    defaultValue: "",
    options: "",
    min: "",
    max: "",
    placeholder: "",
  };
}

export function CreateComponentDialog({ open, onClose, onCreated }: CreateComponentDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("widgets");
  const [category, setCategory] = useState("custom");
  const [description, setDescription] = useState("");
  const [width, setWidth] = useState("200");
  const [height, setHeight] = useState("150");
  const [fields, setFields] = useState<SchemaFieldEntry[]>([createEmptyField()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateField = useCallback((index: number, key: keyof SchemaFieldEntry, value: string) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      if (key === "key" && !next[index].label) {
        next[index].label = value;
      }
      return next;
    });
  }, []);

  const addField = useCallback(() => {
    setFields((prev) => [...prev, createEmptyField()]);
  }, []);

  const removeField = useCallback((index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveField = useCallback((index: number, direction: "up" | "down") => {
    setFields((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setError("");

    if (!name.trim()) {
      setError("请输入组件名称");
      return;
    }

    const type = name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!type) {
      setError("组件名称无效，请使用英文或数字");
      return;
    }

    if (componentRegistry.has(type)) {
      setError(`组件类型 "${type}" 已存在`);
      return;
    }

    const validFields = fields.filter((f) => f.key.trim());
    const configSchema: ConfigField[] = validFields.map((f) => {
      const schema: ConfigField = {
        key: f.key.trim(),
        label: f.label.trim() || f.key.trim(),
        type: f.type,
        group: f.group.trim() || "配置",
      };
      if (f.defaultValue) {
        if (f.type === "number") schema.defaultValue = Number(f.defaultValue);
        else if (f.type === "toggle") schema.defaultValue = f.defaultValue === "true";
        else schema.defaultValue = f.defaultValue;
      }
      if (f.type === "select" && f.options) {
        schema.options = f.options.split(",").map((opt) => {
          const parts = opt.trim().split(":");
          return { label: parts[0].trim(), value: parts.length > 1 ? parts[1].trim() : parts[0].trim() };
        });
      }
      if (f.type === "number" || f.type === "slider") {
        if (f.min) schema.min = Number(f.min);
        if (f.max) schema.max = Number(f.max);
      }
      if (f.placeholder) schema.placeholder = f.placeholder;
      return schema;
    });

    const defaultConfig: Record<string, unknown> = {};
    for (const f of validFields) {
      if (f.defaultValue) {
        if (f.type === "number") defaultConfig[f.key.trim()] = Number(f.defaultValue);
        else if (f.type === "toggle") defaultConfig[f.key.trim()] = f.defaultValue === "true";
        else defaultConfig[f.key.trim()] = f.defaultValue;
      }
    }

    defaultConfig.__configSchema = configSchema;
    defaultConfig.__componentName = name.trim();

    setSaving(true);
    try {
      const definition = await pluginLoader.installPlugin({
        type,
        name: name.trim(),
        icon,
        description: description.trim() || undefined,
        category,
        version: "1.0.0",
        defaultSize: { width: Number(width) || 200, height: Number(height) || 150 },
        defaultConfig,
        capabilities: {
          resizable: true,
          rotatable: true,
          draggable: true,
          connectable: false,
          embeddable: false,
        },
        configSchema: configSchema.length > 0 ? configSchema : undefined,
        renderer: {
          entry: "",
          format: "schema",
        },
      });

      if (definition) {
        onCreated();
        handleClose();
      } else {
        setError("创建失败，请检查输入");
      }
    } catch (err) {
      setError(`创建失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [name, icon, category, description, width, height, fields, onCreated]);

  const handleClose = useCallback(() => {
    setName("");
    setIcon("widgets");
    setCategory("custom");
    setDescription("");
    setWidth("200");
    setHeight("150");
    setFields([createEmptyField()]);
    setError("");
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: { borderRadius: 2, maxHeight: "85vh" },
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: 15 }}>
          创建自定义组件
        </Typography>
        <IconButton size="small" onClick={handleClose}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 0.5 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <TextField
              label="组件名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="small"
              fullWidth
              required
              placeholder="例如: 温度计"
            />
            <FormControl size="small" fullWidth>
              <InputLabel>分类</InputLabel>
              <Select value={category} label="分类" onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary", mb: 0.5, display: "block", fontSize: 10 }}>
              图标
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {ICON_OPTIONS.map((iconName) => (
                <Chip
                  key={iconName}
                  label={iconName}
                  size="small"
                  variant={icon === iconName ? "filled" : "outlined"}
                  color={icon === iconName ? "primary" : "default"}
                  onClick={() => setIcon(iconName)}
                  sx={{ fontSize: 10, height: 22, "& .MuiChip-label": { px: 0.75 } }}
                />
              ))}
            </Box>
          </Box>

          <TextField
            label="描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
            placeholder="组件功能描述（可选）"
          />

          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <TextField
              label="默认宽度"
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label="默认高度"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              size="small"
              fullWidth
            />
          </Box>

          <Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
                配置字段
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                onClick={addField}
                sx={{ fontSize: 10, textTransform: "none", minWidth: 0, py: 0.25 }}
              >
                添加字段
              </Button>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {fields.map((field, index) => (
                <Box
                  key={index}
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    border: 1,
                    borderColor: "divider",
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.75,
                  }}
                >
                  <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                    <TextField
                      label="字段Key"
                      value={field.key}
                      onChange={(e) => updateField(index, "key", e.target.value)}
                      size="small"
                      sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 11 } }}
                      placeholder="例如: temperature"
                    />
                    <TextField
                      label="标签"
                      value={field.label}
                      onChange={(e) => updateField(index, "label", e.target.value)}
                      size="small"
                      sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 11 } }}
                      placeholder="例如: 温度"
                    />
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                      <InputLabel sx={{ fontSize: 11 }}>类型</InputLabel>
                      <Select
                        value={field.type}
                        label="类型"
                        onChange={(e) => updateField(index, "type", e.target.value)}
                        sx={{ fontSize: 11 }}
                      >
                        {FIELD_TYPES.map((ft) => (
                          <MenuItem key={ft.value} value={ft.value} sx={{ fontSize: 11 }}>
                            {ft.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      <IconButton size="small" onClick={() => moveField(index, "up")} disabled={index === 0} sx={{ p: 0.125 }}>
                        <ArrowUpwardIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => moveField(index, "down")} disabled={index === fields.length - 1} sx={{ p: 0.125 }}>
                        <ArrowDownwardIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    </Box>
                    <Tooltip title="删除字段">
                      <IconButton size="small" onClick={() => removeField(index)} sx={{ color: "error.main" }}>
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  <Box sx={{ display: "flex", gap: 0.75 }}>
                    <TextField
                      label="分组"
                      value={field.group}
                      onChange={(e) => updateField(index, "group", e.target.value)}
                      size="small"
                      sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 11 } }}
                      placeholder="配置"
                    />
                    <TextField
                      label="默认值"
                      value={field.defaultValue}
                      onChange={(e) => updateField(index, "defaultValue", e.target.value)}
                      size="small"
                      sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 11 } }}
                    />
                    <TextField
                      label="提示"
                      value={field.placeholder}
                      onChange={(e) => updateField(index, "placeholder", e.target.value)}
                      size="small"
                      sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 11 } }}
                      placeholder="占位文本"
                    />
                  </Box>

                  {(field.type === "select") && (
                    <TextField
                      label="选项（逗号分隔，label:value）"
                      value={field.options}
                      onChange={(e) => updateField(index, "options", e.target.value)}
                      size="small"
                      fullWidth
                      sx={{ "& .MuiInputBase-input": { fontSize: 11 } }}
                      placeholder="低温:low, 中温:mid, 高温:high"
                    />
                  )}

                  {(field.type === "number" || field.type === "slider") && (
                    <Box sx={{ display: "flex", gap: 0.75 }}>
                      <TextField
                        label="最小值"
                        value={field.min}
                        onChange={(e) => updateField(index, "min", e.target.value)}
                        size="small"
                        sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 11 } }}
                      />
                      <TextField
                        label="最大值"
                        value={field.max}
                        onChange={(e) => updateField(index, "max", e.target.value)}
                        size="small"
                        sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 11 } }}
                      />
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Box>

          {error && (
            <Typography variant="caption" sx={{ color: "error.main", fontSize: 11 }}>
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} size="small" sx={{ textTransform: "none" }}>
          取消
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          size="small"
          disabled={saving || !name.trim()}
          sx={{ textTransform: "none" }}
        >
          {saving ? "创建中..." : "创建组件"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
