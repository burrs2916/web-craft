import { useState, useCallback, useEffect, startTransition } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import { useEditorStore } from "../../store/editorStore";

export function SceneTabBar() {
  const views = useEditorStore((s) => s.views);
  const activeViewId = useEditorStore((s) => s.activeViewId);
  const previewMode = useEditorStore((s) => s.previewMode);
  const switchView = useEditorStore((s) => s.switchView);
  const addView = useEditorStore((s) => s.addView);
  const removeView = useEditorStore((s) => s.removeView);
  const renameView = useEditorStore((s) => s.renameView);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleSwitch = useCallback(
    (_: React.SyntheticEvent, value: string) => {
      startTransition(() => {
        switchView(value);
      });
    },
    [switchView]
  );

  const handleAdd = useCallback(() => {
    const idx = views.length + 1;
    addView(`视图 ${idx}`);
  }, [addView, views.length]);

  const handleRemove = useCallback(
    (viewId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleteTarget(viewId);
    },
    [setDeleteTarget]
  );

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      removeView(deleteTarget);
    }
    setDeleteTarget(null);
  }, [deleteTarget, removeView]);

  const startEdit = useCallback((viewId: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(viewId);
    setEditingName(name);
  }, []);

  const confirmEdit = useCallback(() => {
    if (editingId && editingName.trim()) {
      const trimmed = editingName.trim();
      const duplicate = views.some((v) => v.id !== editingId && v.name === trimmed);
      if (duplicate) {
        return;
      }
      renameView(editingId, trimmed);
    }
    setEditingId(null);
  }, [editingId, editingName, renameView, views]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  useEffect(() => {
    if (!previewMode || views.length <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentIdx = views.findIndex((v) => v.id === activeViewId);
      if (e.key === "ArrowLeft" && currentIdx > 0) {
        e.preventDefault();
        startTransition(() => {
          switchView(views[currentIdx - 1].id);
        });
      } else if (e.key === "ArrowRight" && currentIdx < views.length - 1) {
        e.preventDefault();
        startTransition(() => {
          switchView(views[currentIdx + 1].id);
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewMode, views, activeViewId, switchView]);

  if (previewMode && views.length <= 1) {
    return null;
  }

  if (previewMode && views.length > 1) {
    return (
      <Box
        sx={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          backgroundColor: (theme) =>
            theme.palette.mode === "dark"
              ? "rgba(30,30,42,0.85)"
              : "rgba(255,255,255,0.85)",
          borderRadius: 1.5,
          px: 0.5,
          py: 0.25,
          backdropFilter: "blur(12px)",
          border: 1,
          borderColor: (theme) =>
            theme.palette.mode === "dark"
              ? "rgba(255,255,255,0.08)"
              : "rgba(0,0,0,0.06)",
          opacity: 1,
          transition: "opacity 0.2s",
          "&:hover": { opacity: 1 },
          userSelect: "none",
        }}
      >
        {views.map((view) => (
          <Box
            key={view.id}
            onClick={() => switchView(view.id)}
            sx={{
              px: 1.5,
              py: 0.5,
              fontSize: 12,
              cursor: "pointer",
              borderRadius: 1,
              color: activeViewId === view.id ? "primary.main" : "text.secondary",
              backgroundColor:
                activeViewId === view.id
                  ? (theme) =>
                      theme.palette.mode === "dark"
                        ? "rgba(144,202,249,0.15)"
                        : "rgba(25,118,210,0.08)"
                  : "transparent",
              fontWeight: activeViewId === view.id ? 600 : 400,
              transition: "all 0.15s",
              "&:hover": {
                backgroundColor:
                  activeViewId === view.id
                    ? (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(144,202,249,0.2)"
                          : "rgba(25,118,210,0.12)"
                    : (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
              },
            }}
          >
            {view.name}
          </Box>
        ))}
      </Box>
    );
  }

  const isDuplicateName = editingId
    ? views.some((v) => v.id !== editingId && v.name === editingName.trim())
    : false;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        height: 36,
        minHeight: 36,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        px: 0.5,
        userSelect: "none",
      }}
    >
      {views.length === 1 ? (
        <>
          <Box sx={{ display: "flex", alignItems: "center", px: 1.5, fontSize: 12, color: "text.primary" }}>
            {editingId === views[0].id ? (
              <TextField
                value={editingName}
                size="small"
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isDuplicateName) confirmEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                onBlur={() => {
                  if (!isDuplicateName) confirmEdit();
                }}
                autoFocus
                error={isDuplicateName}
                helperText={isDuplicateName ? "名称已存在" : undefined}
                sx={{
                  "& .MuiInputBase-input": { fontSize: 12, py: 0, px: 0.5, height: 20 },
                  "& .MuiOutlinedInput-root": { py: 0 },
                  "& .MuiFormHelperText-root": { fontSize: 9, mx: 0, mt: 0.5, lineHeight: 1 },
                  width: isDuplicateName ? 100 : 80,
                }}
              />
            ) : (
              <>
                <span
                  onDoubleClick={() => startEdit(views[0].id, views[0].name)}
                  style={{ cursor: "text" }}
                >
                  {views[0].name}
                </span>
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); startEdit(views[0].id, views[0].name); }}
                  sx={{ p: 0.15, ml: 0.5, opacity: 0.3, "&:hover": { opacity: 1 } }}
                >
                  <EditIcon sx={{ fontSize: 10 }} />
                </IconButton>
              </>
            )}
          </Box>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="添加视图">
            <IconButton size="small" onClick={handleAdd} sx={{ mx: 0.5 }}>
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <>
          <Tabs
            value={activeViewId}
            onChange={handleSwitch}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 36,
              flex: 1,
              "& .MuiTabs-indicator": { height: 2, bottom: 0 },
              "& .MuiTab-root": {
                minHeight: 36,
                px: 1.5,
                py: 0,
                fontSize: 12,
                textTransform: "none",
                minWidth: "auto",
              },
            }}
          >
            {views.map((view) => (
              <Tab
                key={view.id}
                value={view.id}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {editingId === view.id ? (
                      <TextField
                        value={editingName}
                        size="small"
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !isDuplicateName) confirmEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={() => {
                          if (!isDuplicateName) confirmEdit();
                        }}
                        autoFocus
                        error={isDuplicateName}
                        helperText={isDuplicateName ? "名称已存在" : undefined}
                        sx={{
                          "& .MuiInputBase-input": { fontSize: 12, py: 0, px: 0.5, height: 20 },
                          "& .MuiOutlinedInput-root": { py: 0 },
                          "& .MuiFormHelperText-root": { fontSize: 9, mx: 0, mt: 0.5, lineHeight: 1 },
                          width: isDuplicateName ? 100 : 80,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span
                          onDoubleClick={(e) => { e.stopPropagation(); startEdit(view.id, view.name); }}
                          style={{ cursor: "text" }}
                        >
                          {view.name}
                        </span>
                        {activeViewId === view.id && views.length > 1 && (
                          <>
                            <Box
                              component="span"
                              role="button"
                              tabIndex={0}
                              onClick={(e) => startEdit(view.id, view.name, e)}
                              sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", p: 0.15, opacity: 0.3, cursor: "pointer", borderRadius: 0.5, "&:hover": { opacity: 1 } }}
                            >
                              <EditIcon sx={{ fontSize: 10 }} />
                            </Box>
                            <Box
                              component="span"
                              role="button"
                              tabIndex={0}
                              onClick={(e) => handleRemove(view.id, e)}
                              sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", p: 0.15, opacity: 0.3, cursor: "pointer", borderRadius: 0.5, "&:hover": { opacity: 1 } }}
                            >
                              <CloseIcon sx={{ fontSize: 10 }} />
                            </Box>
                          </>
                        )}
                      </>
                    )}
                  </Box>
                }
              />
            ))}
          </Tabs>
          <Tooltip title="添加视图">
            <IconButton size="small" onClick={handleAdd} sx={{ mx: 0.5 }}>
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </>
      )}

      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>删除视图</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除视图"{views.find((v) => v.id === deleteTarget)?.name}"吗？该视图中的所有组件将被删除，此操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} size="small">取消</Button>
          <Button onClick={confirmDelete} color="error" size="small" variant="contained">删除</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
