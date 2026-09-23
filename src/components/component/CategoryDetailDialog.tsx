import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import CloseIcon from "@mui/icons-material/Close";
import { renderCategoryIcon } from "./categoryConstants";
import type { ComponentPluginItem, ComponentCategoryNode } from "../../types/component";
import { PluginCard } from "./PluginCard";

interface CategoryDetailDialogProps {
  category: ComponentCategoryNode | null;
  open: boolean;
  onClose: () => void;
  onMovePlugin: (plugin: ComponentPluginItem, targetCatId: string) => void;
  onPluginClick?: (plugin: ComponentPluginItem) => void;
  allCategories: ComponentCategoryNode[];
}

export function CategoryDetailDialog({
  category,
  open,
  onClose,
  onMovePlugin,
  onPluginClick,
  allCategories,
}: CategoryDetailDialogProps) {
  if (!category) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      sx={{
        "& .MuiDialog-paper": {
          borderRadius: 2,
          minHeight: 300,
          maxHeight: "80vh",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          pb: 1,
          fontSize: 14,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 0.5,
            backgroundColor: category.color
              ? `${category.color}20`
              : "rgba(255,255,255,0.06)",
            color: category.color || "text.secondary",
          }}
        >
          {renderCategoryIcon(category.icon, 16)}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            {category.name}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 10 }}>
            {category.plugins.length} 个组件
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }} dividers>
        {category.plugins.length > 0 ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 1,
            }}
          >
            {category.plugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onMove={onMovePlugin}
                allCategories={allCategories}
                currentCategoryId={category.id}
                onClick={onPluginClick}
              />
            ))}
          </Box>
        ) : (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              暂无组件
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
