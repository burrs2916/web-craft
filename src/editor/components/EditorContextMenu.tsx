import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import FlipToFrontIcon from "@mui/icons-material/FlipToFront";
import FlipToBackIcon from "@mui/icons-material/FlipToBack";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useEditorStore } from "../../store/editorStore";

interface ContextMenuProps {
  position: { mouseX: number; mouseY: number } | null;
  componentId: string | null;
  onClose: () => void;
}

export function EditorContextMenu({ position, componentId, onClose }: ContextMenuProps) {
  const removeComponent = useEditorStore((s) => s.removeComponent);
  const duplicateComponent = useEditorStore((s) => s.duplicateComponent);
  const updateComponent = useEditorStore((s) => s.updateComponent);
  const reorderComponent = useEditorStore((s) => s.reorderComponent);
  const pasteClipboard = useEditorStore((s) => s.pasteClipboard);
  const clipboard = useEditorStore((s) => s.clipboard);
  const components = useEditorStore((s) => s.components);

  if (!componentId || !position) return null;

  const comp = components.find((c) => c.id === componentId);
  if (!comp) return null;

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const menuSx = {
    minWidth: 200,
    borderRadius: 2,
    py: 0.5,
    boxShadow: (theme: any) =>
      theme.palette.mode === "dark"
        ? "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)"
        : "0 8px 32px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04)",
    overflow: "visible",
    "&:before": {
      content: '""',
      display: "block",
      position: "absolute",
      top: 12,
      left: -5,
      width: 10,
      height: 10,
      bgcolor: "background.paper",
      transform: "rotate(45deg)",
      zIndex: 0,
      boxShadow: (theme: any) =>
        theme.palette.mode === "dark"
          ? "-2px 2px 4px rgba(0,0,0,0.2)"
          : "-2px 2px 4px rgba(0,0,0,0.06)",
    },
  } as const;

  const itemSx = {
    py: 0.75,
    px: 1.5,
    borderRadius: 0.75,
    mx: 0.5,
    "&:hover": { backgroundColor: "action.hover" },
  };

  const shortcutSx = {
    ml: "auto",
    pl: 2,
    fontSize: 11,
    color: "text.disabled",
    fontFamily: "monospace",
    userSelect: "none" as const,
  };

  return (
    <Menu
      anchorReference="anchorPosition"
      anchorPosition={position ? { top: position.mouseY + 4, left: position.mouseX + 4 } : undefined}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      open={Boolean(position)}
      onClose={onClose}
      slotProps={{ paper: { sx: menuSx } }}
    >
      <Box sx={{ px: 1.5, py: 0.5, mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
          操作
        </Typography>
      </Box>
      <MenuItem onClick={() => handleAction(() => duplicateComponent(componentId))} sx={itemSx}>
        <ListItemIcon sx={{ minWidth: 28 }}><ContentCopyIcon sx={{ fontSize: 16 }} /></ListItemIcon>
        <ListItemText sx={{ "& .MuiListItemText-primary": { fontSize: 13 } }}>复制</ListItemText>
        <Typography sx={shortcutSx}>⌘C</Typography>
      </MenuItem>
      <MenuItem
        onClick={() => handleAction(() => pasteClipboard())}
        disabled={clipboard.length === 0}
        sx={itemSx}
      >
        <ListItemIcon sx={{ minWidth: 28 }}><ContentPasteIcon sx={{ fontSize: 16 }} /></ListItemIcon>
        <ListItemText sx={{ "& .MuiListItemText-primary": { fontSize: 13 } }}>粘贴</ListItemText>
        <Typography sx={shortcutSx}>⌘V</Typography>
      </MenuItem>

      <Box sx={{ px: 1.5, py: 0.5, mt: 1, mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
          排列
        </Typography>
      </Box>
      <MenuItem onClick={() => handleAction(() => reorderComponent(componentId, comp.zIndex + 1))} sx={itemSx}>
        <ListItemIcon sx={{ minWidth: 28 }}><ArrowUpwardIcon sx={{ fontSize: 16 }} /></ListItemIcon>
        <ListItemText sx={{ "& .MuiListItemText-primary": { fontSize: 13 } }}>上移一层</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => handleAction(() => reorderComponent(componentId, Math.max(0, comp.zIndex - 1)))} sx={itemSx}>
        <ListItemIcon sx={{ minWidth: 28 }}><ArrowDownwardIcon sx={{ fontSize: 16 }} /></ListItemIcon>
        <ListItemText sx={{ "& .MuiListItemText-primary": { fontSize: 13 } }}>下移一层</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => handleAction(() => reorderComponent(componentId, 9999))} sx={itemSx}>
        <ListItemIcon sx={{ minWidth: 28 }}><FlipToFrontIcon sx={{ fontSize: 16 }} /></ListItemIcon>
        <ListItemText sx={{ "& .MuiListItemText-primary": { fontSize: 13 } }}>置顶</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => handleAction(() => reorderComponent(componentId, 0))} sx={itemSx}>
        <ListItemIcon sx={{ minWidth: 28 }}><FlipToBackIcon sx={{ fontSize: 16 }} /></ListItemIcon>
        <ListItemText sx={{ "& .MuiListItemText-primary": { fontSize: 13 } }}>置底</ListItemText>
      </MenuItem>

      <Box sx={{ px: 1.5, py: 0.5, mt: 1, mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
          显示
        </Typography>
      </Box>
      <MenuItem onClick={() => handleAction(() => updateComponent(componentId, { locked: !comp.locked }))} sx={itemSx}>
        <ListItemIcon sx={{ minWidth: 28 }}>
          {comp.locked ? <LockOpenIcon sx={{ fontSize: 16 }} /> : <LockIcon sx={{ fontSize: 16 }} />}
        </ListItemIcon>
        <ListItemText sx={{ "& .MuiListItemText-primary": { fontSize: 13 } }}>{comp.locked ? "解锁" : "锁定"}</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => handleAction(() => updateComponent(componentId, { visible: !comp.visible }))} sx={itemSx}>
        <ListItemIcon sx={{ minWidth: 28 }}>
          {comp.visible ? <VisibilityOffIcon sx={{ fontSize: 16 }} /> : <VisibilityIcon sx={{ fontSize: 16 }} />}
        </ListItemIcon>
        <ListItemText sx={{ "& .MuiListItemText-primary": { fontSize: 13 } }}>{comp.visible ? "隐藏" : "显示"}</ListItemText>
      </MenuItem>

      <Box sx={{ px: 1.5, py: 0.5, mt: 1, mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
          危险
        </Typography>
      </Box>
      <MenuItem
        onClick={() => handleAction(() => removeComponent(componentId))}
        sx={{ ...itemSx, color: "error.main", "&:hover": { backgroundColor: "error.light", color: "error.dark" } }}
      >
        <ListItemIcon sx={{ minWidth: 28 }}><DeleteIcon sx={{ fontSize: 16, color: "error.main" }} /></ListItemIcon>
        <ListItemText sx={{ "& .MuiListItemText-primary": { fontSize: 13 } }}>删除</ListItemText>
      </MenuItem>
    </Menu>
  );
}
