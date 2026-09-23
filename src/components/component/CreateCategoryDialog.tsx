import { useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { useComponentStore } from "../../store/componentStore";
import { IconPicker } from "./IconPicker";
import { COLOR_PRESETS, DEFAULT_CATEGORY_ICON, DEFAULT_CATEGORY_COLOR, renderCategoryIcon } from "./categoryConstants";

interface CreateCategoryDialogProps {
  open: boolean;
  onClose: () => void;
  categoryCount: number;
}

export function CreateCategoryDialog({ open, onClose, categoryCount }: CreateCategoryDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_CATEGORY_ICON);
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [saving, setSaving] = useState(false);
  const createCategory = useComponentStore((s) => s.createCategory);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createCategory({
        name: name.trim(),
        icon,
        color,
        sortOrder: categoryCount,
      });
      resetForm();
      onClose();
    } catch (err) {
      console.error("[CreateCategory] Failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setName("");
    setIcon(DEFAULT_CATEGORY_ICON);
    setColor(DEFAULT_CATEGORY_COLOR);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleResetDefaults = () => {
    setIcon(DEFAULT_CATEGORY_ICON);
    setColor(DEFAULT_CATEGORY_COLOR);
  };

  const canRevertDefaults = icon !== DEFAULT_CATEGORY_ICON || color !== DEFAULT_CATEGORY_COLOR;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (name.trim() && !saving) handleSave();
      }
    }}>
      <DialogTitle sx={{ fontSize: 13, pb: 1 }}>创建组件组</DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* 实时预览 */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: 1,
              borderRadius: 1,
              bgcolor: "action.hover",
              border: "1px dashed",
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" sx={{ fontSize: 9, color: "text.secondary", flexShrink: 0 }}>
              预览
            </Typography>
            <Box
              sx={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 0.5,
                bgcolor: `${color}33`,
                color: color,
                flexShrink: 0,
              }}
            >
              {renderCategoryIcon(icon, 18)}
            </Box>
            <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name || "（未命名分组）"}
            </Typography>
          </Box>

          <TextField
            size="small"
            label="组名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            sx={{ "& .MuiInputBase-input": { fontSize: 12 } }}
          />
          <Box>
            <IconPicker value={icon} onChange={setIcon} defaultValue={DEFAULT_CATEGORY_ICON} />
          </Box>
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>
                颜色
              </Typography>
              {canRevertDefaults && (
                <Button
                  size="small"
                  onClick={handleResetDefaults}
                  sx={{ fontSize: 9, textTransform: "none", minWidth: 0, p: 0.25, color: "text.secondary" }}
                >
                  重置图标和颜色
                </Button>
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
              {COLOR_PRESETS.map((c) => (
                <Box
                  key={c}
                  onClick={() => setColor(c)}
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: 0.75,
                    bgcolor: c,
                    cursor: "pointer",
                    border: color === c ? "2px solid" : "1px solid",
                    borderColor: color === c ? "primary.main" : "divider",
                    transition: "transform 0.15s",
                    "&:hover": { transform: "scale(1.15)" },
                  }}
                />
              ))}
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: 0.75,
                  border: "1px solid",
                  borderColor: "divider",
                  position: "relative",
                  overflow: "hidden",
                  cursor: "pointer",
                  "&:hover": { borderColor: "primary.main" },
                }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "200%",
                    height: "200%",
                    transform: "translate(-25%, -25%)",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1 }}>
        <Button size="small" onClick={handleClose} sx={{ fontSize: 11, textTransform: "none" }}>
          取消
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!name.trim() || saving}
          onClick={handleSave}
          sx={{ fontSize: 11, textTransform: "none" }}
        >
          创建
        </Button>
      </DialogActions>
    </Dialog>
  );
}
