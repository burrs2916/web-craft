import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { EditorToolbar } from '../../components/editor/EditorToolbar';
import { getEditorPaperSx } from './editorStyles';

interface CharCountStorage {
  characters: () => number;
  words: () => number;
}

/** 编辑器主列：工具栏 + TipTap 正文 + 字数统计。 */
export function EditorColumn({
  editor,
  charCount,
  isDark,
  primaryColor,
  mutedColor,
  codeBorder,
}: {
  editor: Editor | null;
  charCount: CharCountStorage | undefined;
  isDark: boolean;
  primaryColor: string;
  mutedColor: string;
  codeBorder: string;
}) {
  return (
    <Paper variant="outlined" sx={getEditorPaperSx({ isDark, primaryColor, mutedColor, codeBorder })}>
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
  );
}