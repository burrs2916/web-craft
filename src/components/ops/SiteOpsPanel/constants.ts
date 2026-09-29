import type { ElementType } from 'react';
import {
  ArrowClockwiseIcon,
  FileTextIcon,
  CheckSquareIcon,
  ShieldCheckIcon,
  ClockIcon,
  HardDriveIcon,
  CpuIcon,
  PlugIcon,
  DatabaseIcon,
  ArchiveIcon,
  PulseIcon,
} from '@phosphor-icons/react';
import type { OpsDanger } from '../../../proto/ops';

export const CATEGORY_KEYS = ['all', 'web', 'cert', 'system', 'db', 'backup', 'deploy'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const ICON_MAP: Record<string, ElementType> = {
  'arrow-circular-clockwise': ArrowClockwiseIcon,
  'file-text': FileTextIcon,
  'check-square': CheckSquareIcon,
  'shield-check': ShieldCheckIcon,
  clock: ClockIcon,
  'hard-drive': HardDriveIcon,
  cpu: CpuIcon,
  plug: PlugIcon,
  database: DatabaseIcon,
  archive: ArchiveIcon,
  pulse: PulseIcon,
};

export const DANGER_COLOR: Record<OpsDanger, string> = {
  safe: '#66BB6A',
  careful: '#FFA726',
  dangerous: '#EF5350',
};

export function dangerLabel(d: OpsDanger) {
  return d === 'safe' ? '安全' : d === 'careful' ? '谨慎' : '危险';
}

export type OpsTab = 'env' | 'scripts' | 'tasks' | 'deploy' | 'history';