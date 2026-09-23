import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Tooltip from "@mui/material/Tooltip";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import React, { useState, useCallback, useEffect, useRef } from "react";
import CloseIcon from "@mui/icons-material/Close";
import UploadIcon from "@mui/icons-material/Upload";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ImageIcon from "@mui/icons-material/Image";
import VideoIcon from "@mui/icons-material/Videocam";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import WarningIcon from "@mui/icons-material/Warning";
import { useEditorStore } from "../../store/editorStore";

interface AssetInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
  mime_type: string;
  thumbnail: string | null;
}

export type AssetPickerMode = "image" | "video";

interface AssetPickerProps {
  open: boolean;
  mode: AssetPickerMode;
  onClose: () => void;
  onSelect: (path: string) => void;
  currentValue?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetThumbnail({
  asset,
  selected,
  onClick,
}: {
  asset: AssetInfo;
  selected: boolean;
  onClick: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadThumbnail = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const url = await invoke<string>("get_asset_thumbnail", {
          filePath: asset.path,
          maxSize: 200,
        });
        if (!cancelled) setThumbUrl(url);
      } catch {
        if (!cancelled) setThumbUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadThumbnail();
    return () => { cancelled = true; };
  }, [asset.path]);

  const isVideo = asset.mime_type.startsWith("video/");

  return (
    <Box
      onClick={onClick}
      sx={{
        position: "relative",
        borderRadius: 1,
        overflow: "hidden",
        cursor: "pointer",
        border: 2,
        borderColor: selected ? "primary.main" : "transparent",
        transition: "all 0.15s",
        aspectRatio: "4/3",
        backgroundColor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(255,255,255,0.04)"
            : "rgba(0,0,0,0.03)",
        "&:hover": {
          borderColor: selected ? "primary.main" : "primary.light",
          transform: "scale(1.02)",
        },
      }}
    >
      {loading && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 9 }}>
            加载中...
          </Typography>
        </Box>
      )}

      {thumbUrl ? (
        <Box
          component="img"
          src={thumbUrl}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: loading ? "none" : "block",
          }}
          onLoad={() => setLoading(false)}
        />
      ) : !loading ? (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          {isVideo ? (
            <VideoIcon sx={{ fontSize: 24, color: "text.disabled" }} />
          ) : (
            <ImageIcon sx={{ fontSize: 24, color: "text.disabled" }} />
          )}
          <Typography
            variant="caption"
            sx={{
              fontSize: 8,
              color: "text.disabled",
              textAlign: "center",
              px: 0.5,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {asset.name}
          </Typography>
        </Box>
      ) : null}

      {selected && (
        <Box
          sx={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 18,
            height: 18,
            borderRadius: "50%",
            backgroundColor: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          ✓
        </Box>
      )}

      {isVideo && (
        <Box
          sx={{
            position: "absolute",
            bottom: 4,
            left: 4,
            px: 0.5,
            borderRadius: 0.25,
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          <Typography variant="caption" sx={{ fontSize: 8, color: "#fff" }}>
            VIDEO
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function AssetPreviewDialog({
  asset,
  open,
  onClose,
}: {
  asset: AssetInfo | null;
  open: boolean;
  onClose: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !asset) return;
    let cancelled = false;
    const loadPreview = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const url = await invoke<string>("read_file_as_data_url", {
          filePath: asset.path,
        });
        if (!cancelled) setPreviewUrl(url);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    };
    loadPreview();
    return () => { cancelled = true; };
  }, [open, asset]);

  if (!asset) return null;

  const isVideo = asset.mime_type.startsWith("video/");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1,
          px: 2,
          cursor: "move",
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>
          预览 - {asset.name}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 2 }}>
        <Box
          sx={{
            width: "100%",
            minHeight: 300,
            maxHeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 1,
            overflow: "hidden",
            backgroundColor: (theme) =>
              theme.palette.mode === "dark" ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.05)",
          }}
        >
          {previewUrl ? (
            isVideo ? (
              <video
                src={previewUrl}
                controls
                autoPlay
                muted
                style={{ maxWidth: "100%", maxHeight: 480 }}
              />
            ) : (
              <Box
                component="img"
                src={previewUrl}
                sx={{ maxWidth: "100%", maxHeight: 480, objectFit: "contain" }}
              />
            )
          ) : (
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              加载中...
            </Typography>
          )}
        </Box>
        <Box sx={{ mt: 1.5, display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>
            文件名: {asset.name}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>
            大小: {formatFileSize(asset.size)}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>
            类型: {asset.mime_type}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>
            修改: {asset.modified}
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export function AssetPicker({ open, mode, onClose, onSelect, currentValue }: AssetPickerProps) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(currentValue || null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<AssetInfo | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [renamingAsset, setRenamingAsset] = useState<AssetInfo | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssetInfo | null>(null);
  const [deleteBindings, setDeleteBindings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkAssetBindings = useCallback((assetPath: string): string[] => {
    const bindings: string[] = [];
    const state = useEditorStore.getState();
    const bg = state.canvasConfig.background;

    if (mode === "image" && bg.type === "image" && bg.imageUrl === assetPath) {
      bindings.push("画布背景图片");
    }
    if (mode === "video" && bg.type === "video" && bg.videoUrl === assetPath) {
      bindings.push("画布背景视频");
    }

    for (const layer of state.layers) {
      if (layer.background) {
        if (mode === "image" && layer.background.type === "image" && layer.background.imageUrl === assetPath) {
          bindings.push(`图层「${layer.name}」背景图片`);
        }
        if (mode === "video" && layer.background.type === "video" && layer.background.videoUrl === assetPath) {
          bindings.push(`图层「${layer.name}」背景视频`);
        }
      }
    }

    for (const comp of state.components) {
      const config = comp.config || {};
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === "string" && value === assetPath) {
          bindings.push(`组件「${comp.name}」属性 ${key}`);
        }
      }
    }

    return bindings;
  }, [mode]);

  const cleanupAssetBindings = useCallback((assetPath: string) => {
    const state = useEditorStore.getState();
    const bg = state.canvasConfig.background;
    let bgChanged = false;
    const bgUpdates: Partial<typeof bg> = {};

    if (mode === "image" && bg.type === "image" && bg.imageUrl === assetPath) {
      bgUpdates.imageUrl = "";
      bgUpdates.type = "solid";
      bgUpdates.color = "#ffffff";
      bgChanged = true;
    }
    if (mode === "video" && bg.type === "video" && bg.videoUrl === assetPath) {
      bgUpdates.videoUrl = "";
      bgUpdates.type = "solid";
      bgUpdates.color = "#ffffff";
      bgChanged = true;
    }

    if (bgChanged) {
      state.setCanvasConfig({ background: { ...bg, ...bgUpdates } });
    }

    for (const layer of state.layers) {
      if (layer.background) {
        let layerBgChanged = false;
        const layerBgUpdates: Partial<typeof layer.background> = {};

        if (mode === "image" && layer.background.type === "image" && layer.background.imageUrl === assetPath) {
          layerBgUpdates.imageUrl = "";
          layerBgUpdates.type = "solid";
          layerBgUpdates.color = "#ffffff";
          layerBgChanged = true;
        }
        if (mode === "video" && layer.background.type === "video" && layer.background.videoUrl === assetPath) {
          layerBgUpdates.videoUrl = "";
          layerBgUpdates.type = "solid";
          layerBgUpdates.color = "#ffffff";
          layerBgChanged = true;
        }

        if (layerBgChanged) {
          state.updateLayer(layer.id, {
            background: { ...layer.background, ...layerBgUpdates },
          });
        }
      }
    }

    for (const comp of state.components) {
      const config = { ...comp.config };
      let compChanged = false;

      for (const [key, value] of Object.entries(config)) {
        if (typeof value === "string" && value === assetPath) {
          config[key] = "";
          compChanged = true;
        }
      }

      if (compChanged) {
        state.updateComponent(comp.id, { config });
      }
    }
  }, [mode]);

  const category = "backgrounds";
  const subcategory = mode === "image" ? "images" : "videos";

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const list = await invoke<AssetInfo[]>("list_assets", {
        category,
        subcategory,
      });
      setAssets(list);
    } catch (err) {
      console.warn("[AssetPicker] Failed to load assets:", err);
      setAssets([]);
    }
    setLoading(false);
  }, [mode]);

  useEffect(() => {
    if (open) {
      loadAssets();
      setSelectedPath(currentValue || null);
      setSearch("");
    }
  }, [open, mode, currentValue, loadAssets]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const result = await invoke<AssetInfo>("save_asset", {
        category,
        subcategory,
        fileName: file.name,
        data: Array.from(uint8),
      });
      setAssets((prev) => [result, ...prev]);
      setSelectedPath(result.path);
    } catch (err) {
      console.error("[AssetPicker] Upload failed:", err);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [mode]);

  const handleDelete = useCallback((asset: AssetInfo) => {
    const bindings = checkAssetBindings(asset.path);
    if (bindings.length > 0) {
      setDeleteTarget(asset);
      setDeleteBindings(bindings);
      setDeleteConfirmOpen(true);
    } else {
      performDelete(asset.path);
    }
  }, [checkAssetBindings]);

  const performDelete = useCallback(async (path: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_asset", { filePath: path });
      setAssets((prev) => prev.filter((a) => a.path !== path));
      if (selectedPath === path) setSelectedPath(null);
    } catch (err) {
      console.error("[AssetPicker] Delete failed:", err);
    }
  }, [selectedPath]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    cleanupAssetBindings(deleteTarget.path);
    await performDelete(deleteTarget.path);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
    setDeleteBindings([]);
  }, [deleteTarget, cleanupAssetBindings, performDelete]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
    setDeleteBindings([]);
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedPath) {
      onSelect(selectedPath);
      onClose();
    }
  }, [selectedPath, onSelect, onClose]);

  const handleRename = useCallback(async () => {
    if (!renamingAsset || !renameValue.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const newPath = await invoke<string>("rename_asset", {
        filePath: renamingAsset.path,
        newName: renameValue.trim(),
      });
      setAssets((prev) =>
        prev.map((a) =>
          a.path === renamingAsset.path
            ? { ...a, name: renameValue.trim(), path: newPath }
            : a
        )
      );
      if (selectedPath === renamingAsset.path) {
        setSelectedPath(newPath);
      }
      setRenamingAsset(null);
      setRenameValue("");
    } catch (err) {
      console.error("[AssetPicker] Rename failed:", err);
    }
  }, [renamingAsset, renameValue, selectedPath]);

  const filteredAssets = assets.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.mime_type.toLowerCase().includes(q);
  });

  const selectedAsset = assets.find((a) => a.path === selectedPath);

  const acceptTypes = mode === "image" ? ".svg,.jpg,.jpeg,.png,.gif,.webp,.bmp,.ai,.eps,.psd,.tiff,.tif,image/*" : "video/*";
  const title = mode === "image" ? "选择背景图片" : "选择背景视频";
  const uploadLabel = mode === "image" ? "上传图片" : "上传视频";

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              height: "80vh",
              maxHeight: 700,
              display: "flex",
              flexDirection: "column",
              m: 2,
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            py: 1,
            px: 2,
            cursor: "move",
            borderBottom: 1,
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {mode === "image" ? (
              <ImageIcon sx={{ fontSize: 18, color: "primary.main" }} />
            ) : (
              <VideoIcon sx={{ fontSize: 18, color: "primary.main" }} />
            )}
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>
              {title}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 2,
              py: 1,
              borderBottom: 1,
              borderColor: "divider",
              flexShrink: 0,
            }}
          >
            <TextField
              size="small"
              placeholder="搜索资源..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 12, py: 0.5 } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptTypes}
              style={{ display: "none" }}
              onChange={handleUpload}
            />
            <Button
              size="small"
              variant="contained"
              startIcon={<UploadIcon sx={{ fontSize: 14 }} />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ fontSize: 11, textTransform: "none", whiteSpace: "nowrap" }}
            >
              {uploadLabel}
            </Button>
            <Tooltip title="刷新">
              <IconButton size="small" onClick={loadAssets} disabled={loading}>
                <RefreshIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>

          <Box
            sx={{
              flex: 1,
              overflow: "auto",
              p: 1.5,
              "&::-webkit-scrollbar": { width: 4 },
              "&::-webkit-scrollbar-thumb": { borderRadius: 2 },
            }}
          >
            {loading && assets.length === 0 ? (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  加载中...
                </Typography>
              </Box>
            ) : filteredAssets.length === 0 ? (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 1 }}>
                {mode === "image" ? (
                  <ImageIcon sx={{ fontSize: 40, color: "text.disabled", opacity: 0.3 }} />
                ) : (
                  <VideoIcon sx={{ fontSize: 40, color: "text.disabled", opacity: 0.3 }} />
                )}
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {search ? "未找到匹配的资源" : `暂无${mode === "image" ? "图片" : "视频"}资源，点击上方按钮上传`}
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                  gap: 1,
                }}
              >
                {filteredAssets.map((asset) => (
                  <Box key={asset.path}>
                    <AssetThumbnail
                      asset={asset}
                      selected={selectedPath === asset.path}
                      onClick={() => setSelectedPath(asset.path)}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 9,
                        color: "text.secondary",
                        display: "block",
                        mt: 0.25,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        px: 0.25,
                      }}
                    >
                      {asset.name}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
            borderTop: 1,
            borderColor: "divider",
            flexShrink: 0,
            backgroundColor: (theme) =>
              theme.palette.mode === "dark"
                ? "rgba(18,18,24,0.95)"
                : "rgba(248,248,252,0.95)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 0 }}>
            {renamingAsset ? (
              <>
                <TextField
                  size="small"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") { setRenamingAsset(null); setRenameValue(""); }
                  }}
                  sx={{ flex: 1, minWidth: 0, "& .MuiInputBase-input": { fontSize: 11, py: 0.5 } }}
                  autoFocus
                />
                <IconButton size="small" onClick={handleRename} sx={{ color: "primary.main" }}>
                  <CheckIcon sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton size="small" onClick={() => { setRenamingAsset(null); setRenameValue(""); }} sx={{ color: "text.disabled" }}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </>
            ) : selectedAsset ? (
              <>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 11,
                    color: "text.primary",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  已选择: {selectedAsset.name}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 9, color: "text.disabled", flexShrink: 0 }}>
                  ({formatFileSize(selectedAsset.size)})
                </Typography>
              </>
            ) : (
              <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled" }}>
                请选择一个资源
              </Typography>
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            {selectedAsset && (
              <>
                <Tooltip title="重命名">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setRenamingAsset(selectedAsset);
                      setRenameValue(selectedAsset.name);
                    }}
                  >
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="预览">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setPreviewAsset(selectedAsset);
                      setPreviewOpen(true);
                    }}
                  >
                    <VisibilityIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="删除">
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(selectedAsset)}
                    sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            <Button
              size="small"
              variant="outlined"
              onClick={onClose}
              sx={{ fontSize: 11, textTransform: "none" }}
            >
              取消
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={!selectedPath}
              onClick={handleConfirm}
              sx={{ fontSize: 11, textTransform: "none" }}
            >
              确认选择
            </Button>
          </Box>
        </Box>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={handleDeleteCancel} maxWidth="xs" fullWidth>
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            py: 1.5,
            px: 2,
          }}
        >
          <WarningIcon sx={{ fontSize: 20, color: "warning.main" }} />
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>
            确认删除资源
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ px: 2, py: 1 }}>
          <DialogContentText sx={{ fontSize: 12, color: "text.primary", mb: 1.5 }}>
            资源「{deleteTarget?.name}」正在以下位置使用，删除后相关背景将重置为默认白色：
          </DialogContentText>
          <Paper
            variant="outlined"
            sx={{
              px: 1.5,
              py: 1,
              maxHeight: 160,
              overflow: "auto",
              "&::-webkit-scrollbar": { width: 4 },
              "&::-webkit-scrollbar-thumb": { borderRadius: 2 },
            }}
          >
            {deleteBindings.map((binding, idx) => (
              <Box
                key={idx}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  py: 0.5,
                  borderBottom: idx < deleteBindings.length - 1 ? 1 : 0,
                  borderColor: "divider",
                }}
              >
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: "warning.main",
                    flexShrink: 0,
                  }}
                />
                <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary" }}>
                  {binding}
                </Typography>
              </Box>
            ))}
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button size="small" onClick={handleDeleteCancel} sx={{ fontSize: 11, textTransform: "none" }}>
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            sx={{ fontSize: 11, textTransform: "none" }}
          >
            确认删除
          </Button>
        </DialogActions>
      </Dialog>

      <AssetPreviewDialog
        asset={previewAsset}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
