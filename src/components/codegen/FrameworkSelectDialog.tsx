import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Card,
  CardContent,
  Typography,
  Box,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { CodegenFramework } from '../../codegen/types';

interface FrameworkSelectDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (framework: CodegenFramework) => void;
  /** 对话框模式：预览、发布或构建部署 */
  mode?: 'preview' | 'publish' | 'deploy';
}

interface FrameworkOption {
  id: CodegenFramework;
  name: string;
  description: string;
  version: string;
  color: string;
  logo: string;
}

const FRAMEWORKS: FrameworkOption[] = [
  {
    id: 'static-html',
    name: 'Static HTML',
    version: '原生',
    description: '零依赖纯 HTML，渲染最快，适合快速预览',
    color: '#e34c26',
    logo: 'H',
  },
  {
    id: 'vue',
    name: 'Vue',
    version: '3.x',
    description: '渐进式 JavaScript 框架，CDN 即时渲染，适合轻量预览',
    color: '#42b883',
    logo: 'V',
  },
  {
    id: 'react',
    name: 'React',
    version: '18.x',
    description: '组件化 UI 库，Babel 浏览器编译，生态最丰富',
    color: '#61dafb',
    logo: 'R',
  },
  {
    id: 'angular',
    name: 'Angular',
    version: '14.x',
    description: '企业级框架，SystemJS JIT 编译，功能最完整',
    color: '#dd0031',
    logo: 'A',
  },
];

export function FrameworkSelectDialog({ open, onClose, onSelect, mode = 'preview' }: FrameworkSelectDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [hovered, setHovered] = useState<CodegenFramework | null>(null);
  const subtitle = mode === 'deploy'
    ? '选择一个前端框架来构建并部署到服务器'
    : mode === 'publish'
    ? '选择一个前端框架来生成发布文件'
    : '选择一个前端框架来渲染你的网站预览';
  const titleText = mode === 'deploy' ? '构建并部署' : '选择预览框架';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        transition: { timeout: 250 },
        paper: {
          sx: {
            borderRadius: 3,
            backgroundColor: isDark ? '#1e1e2e' : '#ffffff',
          },
        },
      }}
    >
      <DialogTitle sx={{ textAlign: 'center', pb: 2, pt: 3 }}>
        <Box component="span" sx={{ display: 'block', fontSize: 20, fontWeight: 700 }}>
          {titleText}
        </Box>
        <Box component="span" sx={{ display: 'block', fontSize: 14, color: 'text.secondary', mt: 0.5 }}>
          {subtitle}
        </Box>
      </DialogTitle>
      <DialogContent sx={{ px: 3, pt: 2, pb: 3, overflow: 'visible' }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {FRAMEWORKS.map((fw) => (
            <Box
              key={fw.id}
              sx={{ flex: '1 1 200px', maxWidth: '25%' }}
            >
              <Card
                onClick={() => onSelect(fw.id)}
                onMouseEnter={() => setHovered(fw.id)}
                onMouseLeave={() => setHovered(null)}
                sx={{
                  cursor: 'pointer',
                  height: '100%',
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: hovered === fw.id ? fw.color : isDark ? '#333' : '#e0e0e0',
                  backgroundColor: isDark ? '#2a2a3e' : '#fafafa',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: fw.color,
                    transform: 'translateY(-4px)',
                    boxShadow: `0 8px 24px ${fw.color}33`,
                  },
                }}
              >
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  {/* Logo */}
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      mx: 'auto',
                      mb: 2,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: fw.color,
                      color: '#fff',
                      fontSize: 28,
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      boxShadow: `0 4px 12px ${fw.color}44`,
                    }}
                  >
                    {fw.logo}
                  </Box>
                  {/* Name + Version */}
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
                    {fw.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: fw.color,
                      fontWeight: 600,
                      display: 'block',
                      mb: 1,
                    }}
                  >
                    v{fw.version}
                  </Typography>
                  {/* Description */}
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      fontSize: 12,
                      lineHeight: 1.5,
                      mt: 1,
                    }}
                  >
                    {fw.description}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
        <Button onClick={onClose} color="inherit" sx={{ borderRadius: 2 }}>
          取消
        </Button>
      </DialogActions>
    </Dialog>
  );
}
