import type { SxProps, Theme } from '@mui/material/styles';

/** 编辑器 Paper 的排版样式（ProseMirror 富文本渲染规则）。 */
export function getEditorPaperSx({
  isDark,
  primaryColor,
  mutedColor,
  codeBorder,
}: {
  isDark: boolean;
  primaryColor: string;
  mutedColor: string;
  codeBorder: string;
}): SxProps<Theme> {
  return {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    borderRadius: 2,
    '& .ProseMirror': {
      flex: 1,
      outline: 'none',
      px: 2.5,
      py: 2,
      minHeight: 0,
      color: isDark ? '#E8F1EC' : '#0E241D',
      fontSize: 14,
      lineHeight: 1.7,
      '& p.is-editor-empty:first-of-type::before': {
        content: 'attr(data-placeholder)',
        float: 'left',
        color: isDark ? '#484F58' : '#9E9E9E',
        pointerEvents: 'none',
        height: 0,
      },
      '& h1': { fontSize: '1.75rem', fontWeight: 700, mt: 2, mb: 1, color: isDark ? '#E8F1EC' : '#0E241D' },
      '& h2': { fontSize: '1.5rem', fontWeight: 700, mt: 1.75, mb: 0.75, color: isDark ? '#E8F1EC' : '#0E241D' },
      '& h3': { fontSize: '1.25rem', fontWeight: 600, mt: 1.5, mb: 0.5, color: isDark ? '#E8F1EC' : '#0E241D' },
      '& h4': { fontSize: '1.1rem', fontWeight: 600, mt: 1.25, mb: 0.5, color: isDark ? '#E8F1EC' : '#0E241D' },
      '& h5': { fontSize: '1rem', fontWeight: 600, mt: 1, mb: 0.5 },
      '& h6': { fontSize: '0.875rem', fontWeight: 600, mt: 1, mb: 0.5, color: mutedColor },
      '& p': { mb: 1 },
      '& ul, & ol': { pl: 2.5, mb: 1 },
      '& li': { mb: 0.25 },
      '& blockquote': {
        borderLeft: `3px solid ${primaryColor}`,
        pl: 2, py: 0.5, my: 1.5,
        bgcolor: `${primaryColor}10`,
        borderRadius: '0 4px 4px 0',
        color: mutedColor,
      },
      '& code': {
        bgcolor: isDark ? 'rgba(110,118,129,0.2)' : 'rgba(45,212,191,0.1)',
        color: isDark ? '#E8F1EC' : '#1D4ED8',
        px: 0.5,
        py: 0.15,
        borderRadius: 0.5,
        fontSize: '0.875em',
        fontFamily: 'monospace',
      },
      '& pre': {
        bgcolor: isDark ? 'rgba(22,27,34,0.8)' : 'rgba(0,0,0,0.04)',
        border: `1px solid ${codeBorder}`,
        borderRadius: 1.5,
        p: 2,
        my: 1.5,
        overflow: 'auto',
        '& code': {
          bgcolor: 'transparent',
          color: 'inherit',
          px: 0,
          py: 0,
          fontSize: '0.875em',
        },
      },
      '& table': {
        borderCollapse: 'collapse',
        width: '100%',
        my: 1.5,
        '& td, & th': {
          border: `1px solid ${codeBorder}`,
          px: 1.5,
          py: 0.75,
          textAlign: 'left',
        },
        '& th': {
          bgcolor: isDark ? 'rgba(22,27,34,0.6)' : 'rgba(45,212,191,0.06)',
          fontWeight: 600,
        },
      },
      '& hr': {
        border: 'none',
        borderTop: `1px solid ${codeBorder}`,
        my: 2,
      },
      '& a': {
        color: primaryColor,
        textDecoration: 'underline',
        '&:hover': { color: isDark ? '#93C5FD' : '#3B82F6' },
      },
      '& img': {
        maxWidth: '100%',
        borderRadius: 1,
        my: 1,
      },
      '& mark': {
        bgcolor: `${primaryColor}40`,
        color: 'inherit',
        borderRadius: 0.25,
        px: 0.25,
      },
      '& ul[data-type="taskList"]': {
        listStyle: 'none',
        pl: 0,
        '& li': {
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0.5,
          '& label': { mt: 0.25 },
        },
      },
      '& div[data-callout]': {
        '& [data-callout-content] p': { mb: 0.5 },
        '& [data-callout-content] p:last-child': { mb: 0 },
      },
      '& div[data-latex]': {
        '& .katex': { fontSize: '1.1em' },
        '& .katex-display': { margin: '0 !important' },
      },
      '& div[data-bookmark]': {
        '&:hover': { borderColor: `${primaryColor} !important` },
      },
    },
  };
}