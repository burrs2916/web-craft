import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useSceneStore } from '../store/sceneStore';
import type { SceneDSL } from '../types/scene';

// 8 个预设渐变封面
const COVER_GRADIENTS = [
  'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
  'linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)',
  'linear-gradient(135deg, #34D399 0%, #6EE7B7 100%)',
  'linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)',
  'linear-gradient(135deg, #EF4444 0%, #F87171 100%)',
  'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
  'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)',
];

function getDefaultGradient(sceneId: string): string {
  let hash = 0;
  for (let i = 0; i < sceneId.length; i++) {
    hash = (hash * 31 + sceneId.charCodeAt(i)) | 0;
  }
  return COVER_GRADIENTS[Math.abs(hash) % COVER_GRADIENTS.length];
}

interface EditWebsiteInfoDialogProps {
  open: boolean;
  scene: SceneDSL | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function EditWebsiteInfoDialog({ open, scene, onClose, onSaved }: EditWebsiteInfoDialogProps) {
  const updateScene = useSceneStore((s) => s.updateScene);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState<string>(COVER_GRADIENTS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 对话框打开时填充当前值
  useEffect(() => {
    if (open && scene) {
      setName(scene.name || '');
      setDescription(scene.description || '');
      setCover(scene.thumbnail || getDefaultGradient(scene.id));
      setError(null);
    }
  }, [open, scene]);

  const handleSubmit = useCallback(async () => {
    if (!scene || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updates: Partial<SceneDSL> = {
        name: name.trim(),
        description: description.trim() || undefined,
        thumbnail: cover || undefined,
      };
      await updateScene(scene.id, updates);
      onSaved?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[EditWebsiteInfoDialog] save failed:', msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [scene, name, description, cover, updateScene, onSaved, onClose]);

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>编辑网站信息</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {/* 网站名称 */}
          <TextField
            autoFocus
            label="网站名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !saving) void handleSubmit();
            }}
            size="small"
            fullWidth
          />

          {/* 网站描述 */}
          <TextField
            label="网站描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
          />

          {/* 封面预览 */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              封面预览
            </Typography>
            <Box
              sx={{
                width: '100%',
                height: 80,
                borderRadius: 1,
                background: cover,
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
          </Box>

          {/* 渐变封面选择 */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              选择配色
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {COVER_GRADIENTS.map((g) => (
                <Box
                  key={g}
                  onClick={() => setCover(g)}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1,
                    background: g,
                    cursor: 'pointer',
                    border: cover === g ? '2px solid #1976d2' : '2px solid transparent',
                    transition: 'border-color 0.15s',
                    '&:hover': { opacity: 0.85 },
                  }}
                />
              ))}
            </Box>
          </Box>

          {error && (
            <Alert severity="error" sx={{ fontSize: 13 }}>
              {error}
            </Alert>
          )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small" disabled={saving}>
          取消
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          variant="contained"
          size="small"
          disabled={saving || !name.trim()}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
