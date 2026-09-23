/**
 * React CDN 模板生成器
 *
 * 原设计用 dangerouslySetInnerHTML 包裹组件 HTML，但该方式不执行 <script> 标签，
 * 且多视图合并后产生多个重复 id="root" 和同名 function App()，导致渲染崩溃。
 *
 * 当前设计：直接输出组件 HTML + 页面脚本，行为与 static-html 一致。
 * 页面脚本（navbar hover、pane switcher、anchor scroll）使用 document 级事件委托，
 * 无需 React 渲染即可工作。
 */

import type { AssembleParams } from "../types";
import { escapeHTML, REJECTION_GUARD_SCRIPT, joinScripts } from "../layout";

export function assembleReactHTML(p: AssembleParams): string {
  const headParts: string[] = [
    `  <meta charset="UTF-8">`,
    `  <meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `  <title>${escapeHTML(p.title)}</title>`,
  ];

  if (p.description) {
    headParts.push(`  <meta name="description" content="${escapeHTML(p.description)}">`);
  }
  if (p.keywords.length > 0) {
    headParts.push(`  <meta name="keywords" content="${escapeHTML(p.keywords.join(", "))}">`);
  }
  if (p.favicon) {
    headParts.push(`  <link rel="icon" href="${escapeHTML(p.favicon)}">`);
  }
  for (const dep of p.externalDeps) {
    headParts.push(`  <link rel="stylesheet" href="${dep}">`);
  }

  const bodyStyle = [
    "margin: 0",
    "padding: 0",
    `font-family: ${p.fontFamily}`,
    "background: #1a1a2e",
  ];

  const css = `
  * { box-sizing: border-box; }
  body { ${bodyStyle.join("; ")}; }
  ${p.bgStyle.css ? `.canvas-bg { ${p.bgStyle.css} }` : ""}
  ${p.pageStyles.join("\n  ")}
`;

  // 从 bodyContent 中提取内联 <script> 标签
  // 原因：bodyContent 可能包含组件生成的 <script>（navbar init、pane switcher 等），
  // 提取后与 pageScripts 合并，统一放在 body 末尾，确保 DOM 先渲染、脚本后执行
  let cleanBody = p.bodyContent;
  const extractedScripts: string[] = [];
  cleanBody = cleanBody.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_m, content) => {
    const trimmed = content.trim();
    if (trimmed) extractedScripts.push(trimmed);
    return "";
  });
  const allScripts = [...p.pageScripts, ...extractedScripts];

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
${REJECTION_GUARD_SCRIPT}
${headParts.join("\n")}
  <style>
${css}
  </style>
${p.headScripts ?? ""}
</head>
<body>
${cleanBody}
${p.bgStyle.html ?? ""}
${allScripts.length > 0 ? `<script>\n${joinScripts(allScripts).replace(/<\/script/gi, "<\\/script")}\n  </script>` : ""}
</body>
</html>`;

  return p.preview ? html : minifyHTML(html);
}

function minifyHTML(html: string): string {
  return html
    .replace(/\n\s*\n/g, "\n")
    .replace(/  +/g, "  ");
}
