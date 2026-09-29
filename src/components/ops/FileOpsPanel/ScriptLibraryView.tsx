import type { RefObject } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { MagnifyingGlassIcon, TerminalIcon, PencilSimpleIcon } from '@phosphor-icons/react';

import type { OpsScript } from '../../../proto/ops';
import { SCRIPT_CATEGORIES, SCRIPT_GROUPS, DANGER_COLOR, SCRIPT_ICON_MAP } from './shared';

interface ScriptLibraryViewProps {
  scriptLoading: boolean;
  scripts: OpsScript[];
  scriptSearch: string;
  onSearchChange: (value: string) => void;
  scriptCategory: string;
  onCategoryChange: (value: string) => void;
  recentScriptIds: string[];
  searchInputRef: RefObject<HTMLInputElement>;
  connectionId?: string;
  onOpenScript: (script: OpsScript) => void;
}

export function ScriptLibraryView({
  scriptLoading,
  scripts,
  scriptSearch,
  onSearchChange,
  scriptCategory,
  onCategoryChange,
  recentScriptIds,
  searchInputRef,
  connectionId,
  onOpenScript,
}: ScriptLibraryViewProps) {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 子分类标题 */}
      <Box sx={{
        px: 2.5,
        pt: 2,
        pb: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
      }}>
        <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600, mb: 0.5 }}>
          运维脚本库
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          内置运维脚本，一键执行，安全可控
        </Typography>
        <TextField
          size="small"
          placeholder="搜索脚本...（按 / 快速聚焦）"
          fullWidth
          value={scriptSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          sx={{ mb: 1.5 }}
          inputRef={searchInputRef}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <MagnifyingGlassIcon size={16} />
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {SCRIPT_CATEGORIES.map((cat) => (
            <Chip
              key={cat.key}
              label={cat.label}
              size="small"
              color={scriptCategory === cat.key ? 'primary' : 'default'}
              variant={scriptCategory === cat.key ? 'filled' : 'outlined'}
              onClick={() => onCategoryChange(cat.key)}
              sx={{
                cursor: 'pointer',
                fontSize: 12,
                height: 24,
                '& .MuiChip-label': { px: 1.5 },
              }}
            />
          ))}
        </Box>

        {/* 最近运行 */}
        {recentScriptIds.length > 0 && (() => {
          const recentScripts = recentScriptIds
            .map((id) => scripts.find((s) => s.id === id))
            .filter((s): s is OpsScript => s !== undefined);
          if (recentScripts.length === 0) return null;
          return (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontSize: 11 }}>
                🕐 最近运行
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {recentScripts.map((s) => {
                  const Icon = SCRIPT_ICON_MAP[s.icon ?? ''] ?? TerminalIcon;
                  return (
                    <Chip
                      key={s.id}
                      size="small"
                      icon={<Icon size={12} color={DANGER_COLOR[s.dangerLevel]} weight="fill" />}
                      label={s.name.length > 12 ? s.name.slice(0, 12) + '…' : s.name}
                      onClick={() => onOpenScript(s)}
                      sx={{
                        cursor: 'pointer',
                        fontSize: 11,
                        height: 22,
                        bgcolor: 'action.hover',
                        '&:hover': { bgcolor: 'action.selected' },
                        '& .MuiChip-label': { px: 1, pl: 0.5 },
                        '& .MuiChip-icon': { ml: 0.75, mr: 0.25 },
                      }}
                    />
                  );
                })}
              </Box>
            </Box>
          );
        })()}
      </Box>

      {/* 脚本分组卡片列表 */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {scriptLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 2,
          }}>
            {(() => {
              // 构建脚本 ID → 脚本映射
              const scriptMap = new Map(scripts.map((s) => [s.id, s]));
              const keyword = scriptSearch.trim().toLowerCase();

              // 按分类过滤分组
              let groups = scriptCategory === 'all'
                ? SCRIPT_GROUPS
                : SCRIPT_GROUPS.filter((g) => g.category === scriptCategory);

              // 按搜索关键词过滤（匹配分组名或组内脚本名）
              if (keyword) {
                groups = groups.filter((g) => {
                  if (g.name.toLowerCase().includes(keyword)) return true;
                  if (g.description.toLowerCase().includes(keyword)) return true;
                  return g.scriptIds.some((id) => {
                    const s = scriptMap.get(id);
                    return s && (
                      s.name.toLowerCase().includes(keyword) ||
                      s.description.toLowerCase().includes(keyword)
                    );
                  });
                });
              }

              if (groups.length === 0) {
                return (
                  <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 10, color: 'text.secondary' }}>
                    {keyword ? <MagnifyingGlassIcon size={40} weight="light" /> : <TerminalIcon size={40} weight="light" />}
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {keyword ? '没有找到匹配的脚本' : '暂无脚本'}
                    </Typography>
                  </Box>
                );
              }

              return groups.map((group) => {
                const GroupIcon = group.icon;
                const groupScripts = group.scriptIds
                  .map((id) => scriptMap.get(id))
                  .filter((s): s is OpsScript => s !== undefined);

                // 自定义脚本（不在任何内置分组里的）单独处理，后面再加
                if (groupScripts.length === 0) return null;

                return (
                  <Card
                    key={group.key}
                    variant="outlined"
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'box-shadow 0.2s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      },
                    }}
                  >
                    <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                          }}
                        >
                          <GroupIcon size={20} weight="fill" />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
                            {group.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                            {group.description}
                          </Typography>
                        </Box>
                        <Chip
                          label={`${groupScripts.length} 项`}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 10,
                            bgcolor: 'action.hover',
                            color: 'text.secondary',
                          }}
                        />
                      </Box>
                    </CardContent>
                    <Divider />
                    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {groupScripts.map((s) => {
                        const runnable = s.enabled && connectionId;
                        const dangerColor = DANGER_COLOR[s.dangerLevel];
                        const ScriptIcon = SCRIPT_ICON_MAP[s.icon ?? ''] ?? TerminalIcon;
                        return (
                          <Box
                            key={s.id}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              py: 0.75,
                              px: 1,
                              borderRadius: 1,
                              opacity: s.enabled ? 1 : 0.5,
                              transition: 'background 0.15s',
                              '&:hover': {
                                bgcolor: 'action.hover',
                              },
                            }}
                          >
                            <ScriptIcon size={15} color={dangerColor} weight="fill" />
                            <Typography
                              variant="body2"
                              sx={{
                                flex: 1,
                                fontSize: 13,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={s.name}
                            >
                              {s.name.replace(/^(PostgreSQL|Redis|certbot)\s*/, '')}
                            </Typography>
                            {s.dangerLevel !== 'safe' && (
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  bgcolor: dangerColor,
                                  flexShrink: 0,
                                }}
                                title={s.dangerLevel === 'careful' ? '谨慎' : '危险'}
                              />
                            )}
                            <Button
                              size="small"
                              variant="text"
                              color={s.dangerLevel === 'dangerous' ? 'error' : 'primary'}
                              disabled={!runnable}
                              onClick={() => runnable && onOpenScript(s)}
                              sx={{
                                minWidth: 0,
                                px: 1,
                                py: 0.25,
                                fontSize: 12,
                                fontWeight: 500,
                              }}
                            >
                              运行
                            </Button>
                          </Box>
                        );
                      })}
                    </Box>
                  </Card>
                );
              });
            })()}

            {/* 自定义脚本区（未归入任何内置分组的脚本） */}
            {(() => {
              const builtinIds = new Set(SCRIPT_GROUPS.flatMap((g) => g.scriptIds));
              const customScripts = scripts.filter((s) => !builtinIds.has(s.id));
              if (customScripts.length === 0) return null;
              // 如果有分类过滤，也要过滤自定义脚本
              const filtered = scriptCategory === 'all'
                ? customScripts
                : customScripts.filter((s) => s.category === scriptCategory);
              if (filtered.length === 0) return null;
              return (
                <Card
                  variant="outlined"
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gridColumn: scriptCategory !== 'all' ? '1 / -1' : undefined,
                  }}
                >
                  <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: 'success.main',
                          color: 'success.contrastText',
                        }}
                      >
                        <PencilSimpleIcon size={20} weight="fill" />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
                          自定义脚本
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                          您创建的自定义运维脚本
                        </Typography>
                      </Box>
                      <Chip
                        label={`${filtered.length} 项`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 10,
                          bgcolor: 'action.hover',
                          color: 'text.secondary',
                        }}
                      />
                    </Box>
                  </CardContent>
                  <Divider />
                  <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {filtered.map((s) => {
                      const runnable = s.enabled && connectionId;
                      const dangerColor = DANGER_COLOR[s.dangerLevel];
                      const ScriptIcon = SCRIPT_ICON_MAP[s.icon ?? ''] ?? TerminalIcon;
                      return (
                        <Box
                          key={s.id}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            py: 0.75,
                            px: 1,
                            borderRadius: 1,
                            opacity: s.enabled ? 1 : 0.5,
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          <ScriptIcon size={15} color={dangerColor} weight="fill" />
                          <Typography variant="body2" sx={{ flex: 1, fontSize: 13 }}>
                            {s.name}
                          </Typography>
                          {s.dangerLevel !== 'safe' && (
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dangerColor }} />
                          )}
                          <Button
                            size="small"
                            variant="text"
                            color={s.dangerLevel === 'dangerous' ? 'error' : 'primary'}
                            disabled={!runnable}
                            onClick={() => runnable && onOpenScript(s)}
                            sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: 12 }}
                          >
                            运行
                          </Button>
                        </Box>
                      );
                    })}
                  </Box>
                </Card>
              );
            })()}
          </Box>
        )}
      </Box>
    </Box>
  );
}