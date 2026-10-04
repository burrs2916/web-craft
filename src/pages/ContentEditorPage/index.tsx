import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MediaLibraryDialog } from '../../features/cms/MediaLibraryDialog';
import { useContentEditor } from './useContentEditor';
import { EditorHeader } from './EditorHeader';
import { EditorColumn } from './EditorColumn';
import { MetadataPanel } from './MetadataPanel';
import { VersionHistoryPanel } from './VersionHistoryPanel';

/// 内容编辑器（FR-C1/C2/C3/C5）：TipTap 富文本 + Markdown 双源，右侧发布元数据面板。
/// 保存时同时落 content_json（ProseMirror JSON）与 content_md（Markdown，构建输入）。
export function ContentEditorPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('cms');
  const {
    siteId,
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
  } = useContentEditor();

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
      <EditorHeader
        siteName={site.name}
        title={title}
        typeLabel={typeLabel}
        statusLabel={statusLabel}
        status={content.status}
        dirty={dirty}
        saving={saving}
        publishing={publishing}
        onBack={() => navigate(`/sites/${siteId}`)}
        onSave={handleSave}
        onPublish={handlePublish}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 主体：编辑器 + 元数据面板 */}
      <Box sx={{ flex: 1, display: 'flex', gap: 2, minHeight: 0 }}>
        <EditorColumn
          editor={editor}
          charCount={charCount}
          isDark={isDark}
          primaryColor={primaryColor}
          mutedColor={mutedColor}
          codeBorder={codeBorder}
        />

        {/* 右侧：发布元数据 + 版本历史 */}
        <Box sx={{ width: 320, flexShrink: 0, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <MetadataPanel
            content={content}
            isDark={isDark}
            primaryColor={primaryColor}
            mutedColor={mutedColor}
            open={metaOpen}
            onToggle={() => setMetaOpen((v) => !v)}
            setDirty={setDirty}
            title={title}
            setTitle={setTitle}
            slug={slug}
            setSlug={setSlug}
            category={category}
            setCategory={setCategory}
            summary={summary}
            setSummary={setSummary}
            seoTitle={seoTitle}
            setSeoTitle={setSeoTitle}
            seoDescription={seoDescription}
            setSeoDescription={setSeoDescription}
            tags={tags}
            setTags={setTags}
            siteTags={siteTags}
            coverMedia={coverMedia}
            ogMedia={ogMedia}
            onSelectCover={openMediaForCover}
            onSelectOg={openMediaForOg}
            onRemoveCover={handleRemoveCover}
            onRemoveOg={handleRemoveOg}
          />

          <VersionHistoryPanel
            isDark={isDark}
            primaryColor={primaryColor}
            open={versionsOpen}
            onToggle={() => setVersionsOpen((v) => !v)}
            versions={versions}
            loading={versionLoading}
            comment={versionComment}
            setComment={setVersionComment}
            saving={versionSaving}
            rollingBack={rollingBack}
            onSaveVersion={handleSaveVersion}
            onRollback={handleRollback}
          />
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