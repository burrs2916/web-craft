import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { TRIGGER_LABEL, type TriggerCounts, type TriggerFilter } from '../shared';

interface Props {
  triggerFilter: TriggerFilter;
  triggerCounts: TriggerCounts;
  onTriggerFilterChange: (t: TriggerFilter) => void;
}

export function TriggerFilterChips({ triggerFilter, triggerCounts, onTriggerFilterChange }: Props) {
  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
      {(['all', 'manual', 'scheduled', 'rollback'] as const).map((t) => {
        const label = t === 'all' ? '全部' : TRIGGER_LABEL[t];
        const count = t === 'all' ? triggerCounts.all : triggerCounts[t];
        const active = triggerFilter === t;
        return (
          <Chip
            key={t}
            label={`${label} ${count}`}
            size="small"
            clickable
            onClick={() => onTriggerFilterChange(t)}
            sx={{
              height: 24,
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              borderRadius: '12px',
              cursor: 'pointer',
              bgcolor: active ? 'primary.main' : 'action.hover',
              color: active ? 'primary.contrastText' : 'text.secondary',
              border: 'none',
              '&:hover': { bgcolor: active ? 'primary.main' : 'action.selected' },
            }}
          />
        );
      })}
    </Box>
  );
}