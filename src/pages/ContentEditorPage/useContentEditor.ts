import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useEditor } from '@tiptap/react';
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
} from '../../core/services/cms.service';
import { mediaGet } from '../../core/services/media.service';
import type { Site, Content, ContentTag, ContentVersion } from '../../proto';
import type { MediaAsset } from '../../proto/cms';
import { buildEditorExtensions } from './editorExtensions';

/**
 * 内容编辑器的状态与业务逻辑：站点/内容加载、发布元数据、标签、封面/OG 媒体、
 * 版本历史（存快照 / 列表 / 回滚）以及保存与发布。视图只消费返回的状态与回调。
 */
export function useContentEditor() {
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
    extensions: buildEditorExtensions(t('editor.content_placeholder') || 'Start writing...'),
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

  return {
    siteId,
    t,
    isDark,
    primaryColor,
    mutedColor,
    codeBorder,
    site,
    content,
    loading,
    error,
    setError,
    toast,
    setToast,
    saving,
    publishing,
    dirty,
    setDirty,
    metaOpen,
    setMetaOpen,
    versions,
    versionsOpen,
    setVersionsOpen,
    versionLoading,
    versionComment,
    setVersionComment,
    versionSaving,
    rollingBack,
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
    mediaOpen,
    setMediaOpen,
    coverMedia,
    ogMedia,
    editor,
    charCount,
    handleSave,
    handlePublish,
    handleSaveVersion,
    handleRollback,
    openMediaForCover,
    openMediaForOg,
    handleMediaSelect,
    handleRemoveCover,
    handleRemoveOg,
  };
}