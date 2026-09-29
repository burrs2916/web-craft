import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { sectionHeaderSx, sectionTitleSx } from './sharedStyles';

/** 可折叠分组容器（属性面板分组标题栏）。 */
export function CollapsibleSection({
  title,
  defaultExpanded = true,
  children,
}: {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Box onClick={() => setExpanded(!expanded)} sx={sectionHeaderSx}>
        <Typography sx={sectionTitleSx}>{title}</Typography>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
        )}
      </Box>
      {expanded && <Box sx={{ mt: 0.5, mb: 0.75, px: 0.25 }}>{children}</Box>}
    </Box>
  );
}
