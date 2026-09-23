import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import AddIcon from "@mui/icons-material/Add";
import UploadIcon from "@mui/icons-material/Upload";
import DeleteIcon from "@mui/icons-material/Close";
import { useIconStore } from "../../store/iconStore";
import { invalidateCustomIconCache } from "./CustomIconImg";

const PAGE_SIZE = 18;

interface CustomIconTabsProps {
  iconFileUrls: Record<string, string>;
  onSelectIcon: (iconId: string) => void;
  /** 当前选中的自定义图标 ID（不含 "custom-" 前缀），用于高亮选中项 */
  selectedIconId?: string | null;
}

/** 自定义图标平铺网格：上传本地文件、删除、选择（无分组） */
export function CustomIconTabs({ iconFileUrls, onSelectIcon, selectedIconId }: CustomIconTabsProps) {
  const icons = useIconStore((s) => s.icons);
  const loading = useIconStore((s) => s.loading);
  const urls = useIconStore((s) => s.urls);
  const upload = useIconStore((s) => s.upload);
  const remove = useIconStore((s) => s.remove);
  const fetchAll = useIconStore((s) => s.fetchAll);
  const getUrl = useIconStore((s) => s.getUrl);
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.ceil(icons.length / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE;
  const visible = icons.slice(start, start + PAGE_SIZE);

  // 列表已在但 data URL 缺失（批量接口跳过了大图标）→ 按需补载
  useEffect(() => {
    const missing = visible.filter((i) => !urls[i.id]).map((i) => i.id);
    if (missing.length === 0) return;
    missing.forEach((id) => {
      getUrl(id).catch(() => {});
    });
  }, [visible, urls, getUrl]);

  // 挂载时若从未加载过（IconPicker 没触发过 fetchAll 的场景）
  useEffect(() => {
    fetchAll().catch(() => {});
  }, [fetchAll]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      await upload(file);
      invalidateCustomIconCache();
      setPage(1);
    } catch (err) {
      console.error("[CustomIconTabs] upload failed:", err);
      setUploadError(
        err instanceof Error && err.message
          ? `上传失败：${err.message}`
          : "上传失败，请确认文件为 SVG / PNG / JPG 且小于 512KB",
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await remove(id);
      invalidateCustomIconCache();
      if (visible.length === 1 && page > 1) setPage(page - 1);
    } catch (err) {
      console.error("[CustomIconTabs] remove failed:", err);
    }
  };

  return (
    <Box>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,.png,.jpg,.jpeg,.webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
      {uploadError && (
        <Alert severity="error" onClose={() => setUploadError(null)} sx={{ mb: 1, "& .MuiAlert-message": { fontSize: 11.5 } }}>
          {uploadError}
        </Alert>
      )}
      {loading && icons.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : icons.length === 0 ? (
        /* 空状态：合并为单个引导块 */
        <Box
          onClick={() => !uploading && fileRef.current?.click()}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0.5,
            py: 3,
            px: 2,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 1,
            cursor: uploading ? "wait" : "pointer",
            "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
          }}
        >
          {uploading ? <CircularProgress size={20} /> : <UploadIcon sx={{ fontSize: 22, color: "text.disabled" }} />}
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {uploading ? "上传中…" : "上传本地图标"}
          </Typography>
          <Typography sx={{ fontSize: 10.5, color: "text.disabled", textAlign: "center" }}>
            支持 SVG / PNG / JPG，上传后全项目可用
          </Typography>
        </Box>
      ) : (
        <>
          {/* 有图标：紧凑头部 */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={uploading ? <CircularProgress size={14} /> : <AddIcon />}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "上传中…" : "上传图标"}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              共 {icons.length} 个
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))",
              gap: 1,
              mb: 2,
            }}
          >
            {visible.map((icon) => {
              const isSelected = icon.id === selectedIconId;
              return (
              <Paper
                key={icon.id}
                elevation={0}
                sx={{
                  position: "relative",
                  p: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                  borderRadius: 0.75,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: isSelected ? "primary.main" : "divider",
                  bgcolor: isSelected ? "action.selected" : "transparent",
                  "&:hover": {
                    bgcolor: "action.hover",
                    borderColor: "primary.main",
                  },
                }}
                onClick={() => onSelectIcon(icon.id)}
              >
                <Tooltip title="删除" placement="top">
                  <IconButton
                    size="small"
                    onClick={(e) => handleRemove(e, icon.id)}
                    sx={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      p: 0.25,
                      opacity: 0,
                      "&:hover": { color: "error.main" },
                      ".MuiPaper-root:hover &": { opacity: 1 },
                    }}
                  >
                    <DeleteIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "action.hover",
                    borderRadius: 0.75,
                  }}
                >
                  <img
                    src={iconFileUrls[icon.id] || ""}
                    alt={icon.name}
                    style={{ maxWidth: "100%", maxHeight: "100%" }}
                  />
                </Box>
                <Typography variant="caption" sx={{ fontSize: "0.7rem", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {icon.name}
                </Typography>
              </Paper>
              );
            })}
          </Box>

          {totalPages > 1 && (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 2 }}>
              <Button size="small" disabled={page === 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <Typography variant="body2" sx={{ minWidth: 80, textAlign: "center" }}>
                {page} / {totalPages}
              </Typography>
              <Button size="small" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
