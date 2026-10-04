import { Box, FormHelperText } from '@mui/material';
import type { ReactNode } from 'react';
import { BRAND } from './constants';

/**
 * 自造可靠 outlined 字段容器（模块级定义，避免每次 render 生成新组件类型导致
 * input 子树反复卸载重挂、焦点丢失）。详见 constants.ts 顶部说明。
 */
export const OutlinedField = ({
  label,
  required,
  error,
  helperText,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: boolean;
  helperText?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) => (
  <Box sx={{ position: 'relative', width: '100%' }}>
    <Box
      component="label"
      htmlFor={htmlFor}
      sx={{
        position: 'absolute',
        top: 0,
        left: 10,
        transform: 'translateY(-50%)',
        px: 0.5,
        fontSize: 12,
        lineHeight: 1.2,
        fontWeight: 500,
        color: error ? '#FF7B72' : 'text.secondary',
        bgcolor: 'background.paper',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {label}
      {required && (
        <Box component="span" sx={{ color: '#FF7B72', ml: 0.25 }}>
          *
        </Box>
      )}
    </Box>
    <Box
      sx={{
        border: `1px solid ${error ? '#FF7B72' : 'rgba(45,212,191,0.30)'}`,
        borderRadius: 1.5,
        bgcolor: 'background.paper',
        color: 'text.primary',
        transition: 'border-color .15s ease, box-shadow .15s ease',
        '&:focus-within': {
          borderColor: BRAND,
          boxShadow: `0 0 0 1px ${BRAND}`,
        },
      }}
    >
      {children}
    </Box>
    {helperText != null && (
      <FormHelperText error={error} sx={{ mx: 0, mt: 0.5 }}>
        {helperText}
      </FormHelperText>
    )}
  </Box>
);