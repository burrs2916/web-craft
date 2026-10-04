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
import type { Extensions } from '@tiptap/core';
import { CalloutExtension, LatexExtension, BookmarkExtension } from '../../components/editor/extensions';

export const lowlight = createLowlight(common);

/** 内容编辑器的 TipTap 扩展集合（Markdown 双源 + 表格 / 代码块 / 自定义扩展）。 */
export function buildEditorExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    Markdown.configure({
      markedOptions: { gfm: true, breaks: true },
    }),
    Placeholder.configure({
      placeholder,
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
  ];
}