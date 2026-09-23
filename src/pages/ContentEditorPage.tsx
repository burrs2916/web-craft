import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  TextField,
  Chip,
  Tooltip,
  Snackbar,
  Alert,
  Divider,
  Paper,
  Stack,
  Autocomplete,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { common, createLowlight } from 'lowlight';
import {
  ArrowLeftIcon,
  FloppyDiskIcon,
  PaperPlaneRightIcon,
  GlobeIcon,
  FileTextIcon,
  CaretDownIcon,
  CaretUpIcon,
  TagIcon,
  TextTIcon,
  ArticleIcon,
  ClockCounterClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ImageIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  getSite,
  getContent,
  saveContent,
  publishContent,
  listTags,
  createTag,
  setContentTags,
  listContentTags,
  saveContentVersion,
  listContentVersions,
  rollbackContent,
} from '../core/services/cms.service';
import { EditorToolbar } from '../components/editor/EditorToolbar';
import { CalloutExtension, LatexExtension, BookmarkExtension } from '../components/editor/extensions';
import { MediaLibraryDialog } from '../features/cms/MediaLibraryDialog';
import { mediaGet } from '../core/services/media.service';
import type { Site, Content, ContentTag, ContentVersion } from '../proto';
import type { MediaAsset } from '../proto/cms';

const lowlight = createLowlight(common);

/// 内容编辑器（FR-C1/C2/C3/C5）：TipTap 富文本 + Markdown 双源，右侧发布元数据面板。
/// 保存时同时落 content_json（ProseMirror JSON）与 content_md（Markdown，构建输入）。
export function ContentEditorPage() {
  const { siteId = '', contentId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('cms');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primaryColor = isDark ? '#60A5FA' : '#1D4ED8';
  const mutedColor = isDark ? '#8FA3B0' : '#5A6B64';
  const codeBorder = isDark ? 'rgba(48,54,61,0.6)' : 'rgba(0,0,0,0.08)';

  const [site, setSite] = useState<Site | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [metaOpen, setMetaOpen] = useState(true);
  // 版本历史（FR-C7）：手动存快照 + 列表 + 回滚
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionComment, setVersionComment] = useState('');
  const [versionSaving, setVersionSaving] = useState(false);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  // 发布元数据（独立于编辑器正文）
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [category, setCategory] = useState('');
  const [summary, setSummary] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  // 标签（FR-C8）：当前内容标签名 + 站点全部标签（供联想）
  const [tags, setTags] = useState<string[]>([]);
  const [siteTags, setSiteTags] = useState<ContentTag[]>([]);

  // 媒体库对话框
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaSelectMode, setMediaSelectMode] = useState<'cover' | 'og' | 'inline'>('cover');
  const [coverMedia, setCoverMedia] = useState<MediaAsset | null>(null);
  const [ogMedia, setOgMedia] = useState<MediaAsset | null>(null);

  // 编辑器内容源：从 content_json 或 content_md 提取初始 Markdown
  const [initialMd, setInitialMd] = useState('');
  // 初始内容同步完成前，onUpdate 不标记 dirty（避免 setContent 误触发）
  const initialSyncDoneRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: true },
      }),
      Placeholder.configure({
        placeholder: t('editor.content_placeholder') || 'Start writing...',
      }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CodeBlockLowlight.configure({ lowlight }),
      TextStyle,
      Color,
      Image.configure({ inline: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      CharacterCount,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Superscript,
      Subscript,
      CalloutExtension,
      LatexExtension,
      BookmarkExtension,
    ],
    content: initialMd,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'note-editor-content' },
    },
    onUpdate: () => {
      if (initialSyncDoneRef.current) setDirty(true);
    },
  });

  // 同步元数据字段
  useEffect(() => {
    if (!content) return;
    setTitle(content.title);
    setSlug(content.slug);
    setCategory(content.category);
    setSummary(content.summary);
    setSeoTitle(content.seo_title);
    setSeoDescription(content.seo_description);
  }, [content]);

  // 异步加载 content 后，将初始 Markdown 推入编辑器（默认 content 已空，推入后 ONCE）
  useEffect(() => {
    if (!content || !editor) return;
    const md = content.content_md || '';
    setInitialMd(md);
    const raf = requestAnimationFrame(() => {
      if (editor && md) {
        const json = editor.markdown?.parse(md);
        if (json) editor.commands.setContent(json);
      }
      initialSyncDoneRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
    // 仅在 content.id 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content?.id, editor]);

  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    Promise.all([getSite(siteId), getContent(contentId), listTags(siteId)])
      .then(([s, c, siteTagList]) => {
        if (!s) {
          navigate('/sites', { replace: true });
          return;
        }
        setSite(s);
        setSiteTags(siteTagList);
        if (!c) {
          setError(t('editor.not_found'));
        } else {
          setContent(c);
          listContentTags(c.id)
            .then((names) => setTags(names))
            .catch(() => setTags([]));
          // 加载封面图和 OG 图媒体资产
          if (c.cover_media_id) {
            mediaGet({ assetId: c.cover_media_id })
              .then((asset) => { if (asset) setCoverMedia(asset); })
              .catch(() => {});
          }
          if (c.og_image_media_id) {
            mediaGet({ assetId: c.og_image_media_id })
              .then((asset) => { if (asset) setOgMedia(asset); })
              .catch(() => {});
          }
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [siteId, contentId, navigate, t]);

  const charCount = editor?.storage.characterCount;

  const handleSave = useCallback(async () => {
    if (!content || !editor) return;
    if (!title.trim()) {
      setError(t('editor.title_required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next: Content = {
        ...content,
        title: title.trim(),
        slug: slug.trim(),
        category: category.trim(),
        summary: summary.trim(),
        seo_title: seoTitle.trim(),
        seo_description: seoDescription.trim(),
        cover_media_id: coverMedia?.id || null,
        og_image_media_id: ogMedia?.id || null,
        content_json: JSON.stringify(editor.getJSON()),
        content_md: editor.getMarkdown() || '',
      };
      const saved = await saveContent(next);
      setContent(saved);
      // 标签：按名 find-or-create，再全量替换关联
      const normalized = Array.from(new Set(tags.map((x) => x.trim()).filter(Boolean)));
      const tagIds: string[] = [];
      for (const name of normalized) {
        const existing = siteTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          tagIds.push(existing.id);
        } else {
          const created = await createTag(siteId, name);
          tagIds.push(created.id);
          setSiteTags((prev) => [...prev, created]);
        }
      }
      await setContentTags(saved.id, tagIds);
      setTags(normalized);
      setDirty(false);
      setToast(t('editor.saved'));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [content, editor, title, slug, category, summary, seoTitle, seoDescription, tags, siteTags, siteId, t]);

  const handlePublish = useCallback(async () => {
    if (!content) return;
    // 发布前先落盘当前编辑内容，保证线上与编辑态一致
    if (dirty) {
      await handleSave();
    }
    setPublishing(true);
    setError(null);
    try {
      const published = await publishContent(content.id);
      setContent(published);
      setToast(t('editor.published'));
    } catch (e) {
      setError(String(e));
    } finally {
      setPublishing(false);
    }
  }, [content, dirty, handleSave, t]);

  const loadVersions = useCallback(async () => {
    if (!content) return;
    setVersionLoading(true);
    try {
      setVersions(await listContentVersions(content.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setVersionLoading(false);
    }
  }, [content]);

  const handleSaveVersion = useCallback(async () => {
    if (!content) return;
    setVersionSaving(true);
    setError(null);
    try {
      await saveContentVersion(content.id, versionComment);
      setVersionComment('');
      setVersionsOpen(true);
      await loadVersions();
      setToast(t('editor.version_saved'));
    } catch (e) {
      setError(String(e));
    } finally {
      setVersionSaving(false);
    }
  }, [content, versionComment, loadVersions, t]);

  const handleRollback = useCallback(async (versionNo: number) => {
    if (!content || !editor) return;
    if (!window.confirm(t('editor.version_restore_confirm', { no: versionNo }))) return;
    setRollingBack(versionNo);
    setError(null);
    try {
      const restored = await rollbackContent(content.id, versionNo);
      setContent(restored);
      const md = restored.content_md || '';
      const json = editor.markdown?.parse(md);
      if (json) editor.commands.setContent(json);
      initialSyncDoneRef.current = true;
      setDirty(false);
      setToast(t('editor.version_restored', { no: versionNo }));
      await loadVersions();
    } catch (e) {
      setError(String(e));
    } finally {
      setRollingBack(null);
    }
  }, [content, editor, loadVersions, t]);

  // —— 媒体库选择处理 ——
  const openMediaForCover = () => {
    setMediaSelectMode('cover');
    setMediaOpen(true);
  };

  const openMediaForOg = () => {
    setMediaSelectMode('og');
    setMediaOpen(true);
  };

  const handleMediaSelect = (asset: MediaAsset) => {
    if (mediaSelectMode === 'cover') {
      setCoverMedia(asset);
      setDirty(true);
    } else if (mediaSelectMode === 'og') {
      setOgMedia(asset);
      setDirty(true);
    } else if (mediaSelectMode === 'inline' && editor) {
      const publicPath = `/assets/${asset.storage_path}`;
      editor.chain().focus().setImage({ src: publicPath, alt: asset.filename }).run();
      setDirty(true);
    }
    setMediaOpen(false);
  };

  const handleRemoveCover = () => {
    setCoverMedia(null);
    setDirty(true);
  };

  const handleRemoveOg = () => {
    setOgMedia(null);
    setDirty(true);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (!site || !content) {
    return (
      <Box sx={{ p: 3, width: '100%' }}>
        <Alert severity="error">{error ?? t('editor.not_found')}</Alert>
      </Box>
    );
  }

  const typeLabel = t(`contents.type_${content.type}`) as string;
  const statusLabel = t(`contents.status_${content.status}`) as string;

  return (
    <Box sx={{ p: 3, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexShrink: 0 }}>
        <IconButton onClick={() => navigate(`/sites/${siteId}`)} size="small">
          <ArrowLeftIcon size={20} />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {title || t('editor.untitled')}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {site.name} · {typeLabel}
          </Typography>
        </Box>
        <Chip
          icon={<FileTextIcon size={14} />}
          label={typeLabel}
          size="small"
          variant="outlined"
        />
        <Chip
          label={statusLabel}
          size="small"
          variant="outlined"
          color={content.status === 'published' ? 'success' : content.status === 'scheduled' ? 'warning' : 'default'}
        />
        <Tooltip title={t('editor.save_hint')}>
          <span>
            <Button
              variant="contained"
              startIcon={<FloppyDiskIcon size={16} weight="bold" />}
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? <CircularProgress size={16} /> : null}
              {t('editor.save')}
            </Button>
          </span>
        </Tooltip>
        {content.status !== 'published' ? (
          <Tooltip title={t('editor.publish_hint')}>
            <span>
              <Button
                variant="outlined"
                color="success"
                startIcon={<PaperPlaneRightIcon size={16} weight="bold" />}
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? <CircularProgress size={16} /> : null}
                {t('editor.publish')}
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 主体：编辑器 + 元数据面板 */}
      <Box sx={{ flex: 1, display: 'flex', gap: 2, minHeight: 0 }}>
        {/* 编辑器列 */}
        <Paper
          variant="outlined"
          sx={{
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
          }}
        >
          <EditorToolbar editor={editor} />
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', minHeight: 0 }}>
            <EditorContent editor={editor} />
          </Box>
          {charCount ? (
            <Box sx={{ px: 2, py: 0.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end' }}>
              <Typography variant="caption" color="text.secondary">
                {charCount.characters()} chars · {charCount.words()} words
              </Typography>
            </Box>
          ) : null}
        </Paper>

        {/* 右侧：发布元数据 + 版本历史 */}
        <Box sx={{ width: 320, flexShrink: 0, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            onClick={() => setMetaOpen((v) => !v)}
          >
            <ArticleIcon size={16} color={primaryColor} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
              {t('editor.meta_title')}
            </Typography>
            {metaOpen ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
          </Box>
          {metaOpen ? (
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
                    onClick={handleRemoveCover}
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
                  onClick={openMediaForCover}
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
                    onClick={handleRemoveOg}
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
                  onClick={openMediaForOg}
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

        {/* 版本历史面板（FR-C7）：手动存快照 + 列表 + 回滚 */}
        <Paper
          variant="outlined"
          sx={{ width: '100%', borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          <Box
            sx={{
              px: 2, py: 1.25,
              display: 'flex', alignItems: 'center', gap: 1,
              cursor: 'pointer',
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: isDark ? 'rgba(45,212,191,0.04)' : 'rgba(15,118,110,0.04)',
            }}
            onClick={() => setVersionsOpen((v) => !v)}
          >
            <ClockCounterClockwiseIcon size={16} color={primaryColor} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
              {t('editor.version_title')}
            </Typography>
            {versionsOpen ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
          </Box>
          {versionsOpen ? (
            <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 360, overflow: 'auto' }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  value={versionComment}
                  onChange={(e) => setVersionComment(e.target.value)}
                  placeholder={t('editor.version_save_placeholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSaveVersion();
                    }
                  }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={versionSaving ? <CircularProgress size={14} /> : <ClockCounterClockwiseIcon size={14} />}
                  onClick={handleSaveVersion}
                  disabled={versionSaving}
                  sx={{ flexShrink: 0 }}
                >
                  {t('editor.version_save')}
                </Button>
              </Box>
              {versionLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                  <CircularProgress size={22} />
                </Box>
              ) : versions.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  {t('editor.version_empty')}
                </Typography>
              ) : (
                versions.map((v) => (
                  <Box
                    key={v.id}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1,
                      py: 0.75, px: 0.5, borderRadius: 1,
                      '&:hover': { bgcolor: isDark ? 'rgba(45,212,191,0.06)' : 'rgba(15,118,110,0.05)' },
                    }}
                  >
                    <Chip
                      label={`v${v.version_no}`}
                      size="small"
                      sx={{
                        height: 20, fontSize: 11, fontWeight: 700,
                        bgcolor: isDark ? 'rgba(45,212,191,0.14)' : 'rgba(15,118,110,0.10)',
                        color: primaryColor,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block', fontWeight: 600,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {v.comment || t(`editor.version_trigger_${v.trigger}`, { defaultValue: v.trigger })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(v.created_at).toLocaleString()}
                      </Typography>
                    </Box>
                    <Tooltip title={t('editor.version_restore')}>
                      <IconButton
                        size="small"
                        onClick={() => void handleRollback(v.version_no)}
                        disabled={rollingBack === v.version_no}
                      >
                        {rollingBack === v.version_no ? <CircularProgress size={14} /> : <ArrowCounterClockwiseIcon size={15} />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))
              )}
            </Box>
          ) : null}
        </Paper>
        </Box>
      </Box>

      <Snackbar
        open={!!toast}
        autoHideDuration={2000}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {/* 媒体库对话框 */}
      <MediaLibraryDialog
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        siteId={siteId}
        selectMode={true}
        onSelect={handleMediaSelect}
      />
    </Box>
  );
}
