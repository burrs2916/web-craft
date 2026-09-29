import Box from '@mui/material/Box';
import { getProviderColor } from './constants';

/// 供应商颜色圆点：根据名称哈希自动分配颜色，用于视觉区分
export function ProviderDot({ name, size = 10 }: { name: string; size?: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: getProviderColor(name),
        flexShrink: 0,
      }}
    />
  );
}