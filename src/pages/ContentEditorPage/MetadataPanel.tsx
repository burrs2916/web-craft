import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Autocomplete from '@mui/material/Autocomplete';
import {
  CaretDownIcon,
  CaretUpIcon,
  TagIcon,
  TextTIcon,
  ArticleIcon,
  ImageIcon,
  XIcon,
  GlobeIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { Content, ContentTag } from '../../proto';
import type { MediaAsset } from '../../proto/cms';

/** 发布元数据面板（FR-C2/C5）：标题、slug、分类、标签、摘要、SEO、封面图 / OG 图。 */
export function MetadataPanel({
  content,
  isDark,
  primaryColor,
  mutedColor,
  open,
  onToggle,
  setDirty,
  title,
  setTitle,
  slug,
  setSlug,
  category,
  setCategory,
  summary,
  setSummary,
  seoTitle,
  setSeoTitle,
  seoDescription,
  setSeoDescription,
  tags,
  setTags,
  siteTags,
  coverMedia,
  ogMedia,
  onSelectCover,
  onSelectOg,
  onRemoveCover,
  onRemoveOg,
}: {
  content: Content;
  isDark: boolean;
  primaryColor: string;
  mutedColor: string;
  open: boolean;
  onToggle: () => void;
  setDirty: (value: boolean) => void;
  title: string;
  setTitle: (value: string) => void;
  slug: string;
  setSlug: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  summary: string;
  setSummary: (value: string) => void;
  seoTitle: string;
  setSeoTitle: (value: string) => void;
  seoDescription: string;
  setSeoDescription: (value: string) => void;
  tags: string[];
  setTags: (value: string[]) => void;
  siteTags: ContentTag[];
  coverMedia: MediaAsset | null;
  ogMedia: MediaAsset | null;
  onSelectCover: () => void;
  onSelectOg: () => void;
  onRemoveCover: () => void;
  onRemoveOg: () => void;
}) {
  const { t } = useTranslation('cms');

  return (
    <Paper
      variant="outlined"
      sx={{
        width: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          px: 2, py: 1.25,
          display: 'flex', alignItems: 'center', gap: 1,
          cursor: 'pointer',
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: isDark ? 'rgba(22,27,34,0.4)' : 'rgba(45,212,191,0.04)',
        }}
        onClick={onToggle}
      >
        <ArticleIcon size={16} color={primaryColor} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {t('editor.meta_title')}
        </Typography>
        {open ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
      </Box>
      {open ? (
        <Stack spacing={2} sx={{ p: 2 }}>
          <TextField
            label={t('editor.title')}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            size="small"
            fullWidth
          />
          <TextField
            label={t('editor.slug')}
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setDirty(true);
            }}
            size="small"
            fullWidth
            helperText={t('editor.slug_hint')}
          />
          <TextField
            label={t('editor.category')}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setDirty(true);
            }}
            size="small"
            fullWidth
            placeholder={t('editor.category_placeholder')}
          />
          <Autocomplete<string, true, false, true>
            multiple
            freeSolo
            size="small"
            options={siteTags.map((x) => x.name)}
            value={tags}
            onChange={(_, value) => {
              setTags(value);
              setDirty(true);
            }}
            slotProps={{
              chip: {
                size: 'small',
                sx: {
                  height: 22,
                  fontSize: 12,
                  bgcolor: isDark ? 'rgba(45,212,191,0.14)' : 'rgba(15,118,110,0.10)',
                  color: primaryColor,
                  '& .MuiChip-deleteIcon': { color: primaryColor, opacity: 0.7 },
                },
              },
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('editor.tags')}
                placeholder={t('editor.tags_placeholder')}
                helperText={t('editor.tags_hint')}
              />
            )}
          />
          <TextField
            label={t('editor.summary')}
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              setDirty(true);
            }}
            size="small"
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            placeholder={t('editor.summary_placeholder')}
          />
          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextTIcon size={14} color={primaryColor} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t('editor.seo_title')}
            </Typography>
          </Box>
          <TextField
            label={t('editor.seo_title_label')}
            value={seoTitle}
            onChange={(e) => {
              setSeoTitle(e.target.value);
              setDirty(true);
            }}
            size="small"
            fullWidth
          />
          <TextField
            label={t('editor.seo_description_label')}
            value={seoDescription}
            onChange={(e) => {
              setSeoDescription(e.target.value);
              setDirty(true);
            }}
            size="small"
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
          />
          <Divider />
          {/* 封面图 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ImageIcon size={14} color={primaryColor} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t('editor.cover_image')}
            </Typography>
          </Box>
          {coverMedia ? (
            <Box
              sx={{
                position: 'relative',
                borderRadius: 1.5,
                overflow: 'hidden',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                bgcolor: isDark ? '#0A0E14' : '#F5F5F5',
              }}
            >
              <img
                src={`tauri://localhost/${coverMedia.thumb_path || coverMedia.storage_path}`}
                alt={coverMedia.filename}
                style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <Box sx={{ p: 1.5 }}>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {coverMedia.filename}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={onRemoveCover}
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 24,
                  height: 24,
                  bgcolor: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  '&:hover': { bgcolor: 'rgba(220,38,38,0.9)' },
                }}
              >
                <XIcon size={12} />
              </IconButton>
            </Box>
          ) : (
            <Button
              variant="outlined"
              size="small"
              startIcon={<ImageIcon size={16} />}
              onClick={onSelectCover}
              sx={{ textTransform: 'none', borderRadius: '8px', justifyContent: 'flex-start', py: 1.5 }}
              fullWidth
            >
              {t('editor.select_cover_image')}
            </Button>
          )}
          {/* OG 图 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <GlobeIcon size={14} color={primaryColor} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t('editor.og_image')}
            </Typography>
          </Box>
          {ogMedia ? (
            <Box
              sx={{
                position: 'relative',
                borderRadius: 1.5,
                overflow: 'hidden',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                bgcolor: isDark ? '#0A0E14' : '#F5F5F5',
              }}
            >
              <img
                src={`tauri://localhost/${ogMedia.thumb_path || ogMedia.storage_path}`}
                alt={ogMedia.filename}
                style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <Box sx={{ p: 1.5 }}>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ogMedia.filename}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={onRemoveOg}
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 24,
                  height: 24,
                  bgcolor: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  '&:hover': { bgcolor: 'rgba(220,38,38,0.9)' },
                }}
              >
                <XIcon size={12} />
              </IconButton>
            </Box>
          ) : (
            <Button
              variant="outlined"
              size="small"
              startIcon={<GlobeIcon size={16} />}
              onClick={onSelectOg}
              sx={{ textTransform: 'none', borderRadius: '8px', justifyContent: 'flex-start', py: 1.5 }}
              fullWidth
            >
              {t('editor.select_og_image')}
            </Button>
          )}
          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TagIcon size={14} color={primaryColor} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t('editor.publish_meta')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GlobeIcon size={14} color={mutedColor} />
            <Typography variant="caption" color="text.secondary">
              {content.status === 'published'
                ? `${t('editor.published_at')}: ${content.published_at ? new Date(content.published_at).toLocaleString() : '-'}`
                : `${t('editor.updated_at')}: ${new Date(content.updated_at).toLocaleString()}`}
            </Typography>
          </Box>
        </Stack>
      ) : null}
    </Paper>
  );
}