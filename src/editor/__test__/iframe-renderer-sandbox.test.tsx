/**
 * iframe 编辑态安全加固契约锁（T3）。
 *
 * 锁的是什么：
 * 1. **编辑态强制收窄沙箱**：画布初始化时嵌入页即开始加载，若按用户配置（默认
 *    不启用沙箱）其脚本可弹窗 / 顶层导航 / 访问父页面 DOM。编辑态无论用户如何
 *    配置，iframe 一律注入 `sandbox="allow-scripts allow-forms"` —— 保留脚本渲染
 *    与表单提交，剥夺 allow-popups / allow-top-navigation / allow-same-origin。
 * 2. **预览态 / 发布端才放开完整策略**：预览态按用户配置输出 sandbox（空 = 不带
 *    sandbox 属性，绝不输出空属性 —— 空 sandbox 属性等于全限制沙箱，会锁死嵌入页）。
 *
 * 与发布端 `media-iframe.test.ts` 的契约互补：发布端只按用户配置输出（永不注入
 * 编辑态策略），因此两个测试文件可以相互对照锁定两端行为。
 */
import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { IframeRenderer } from "../renderers/IframeRenderer";

function renderIframe(config: Record<string, unknown>, mode: "edit" | "preview" = "edit") {
  return renderToStaticMarkup(
    <IframeRenderer config={config} componentId="test-iframe" mode={mode} width={480} height={320} />,
  );
}

function iframeTag(html: string): string {
  const m = html.match(/<iframe[^>]*>/);
  return m ? m[0] : "";
}

describe("IframeRenderer 编辑态 sandbox 安全加固", () => {
  test("编辑态：未配置沙箱也强制注入受控策略（allow-scripts allow-forms）", () => {
    const html = renderIframe({ src: "https://example.com/embed" }, "edit");
    expect(html).toContain("<iframe");
    expect(iframeTag(html)).toContain('sandbox="allow-scripts allow-forms"');
    // 不剥夺基础渲染能力：脚本 + 表单仍在
    expect(iframeTag(html)).not.toContain("allow-same-origin");
    expect(iframeTag(html)).not.toContain("allow-popups");
  });

  test("编辑态：用户显式配置的高权限策略也被收窄为受控策略", () => {
    const html = renderIframe(
      { src: "https://example.com/embed", sandbox: "allow-scripts allow-same-origin allow-forms allow-popups" },
      "edit",
    );
    expect(iframeTag(html)).toContain('sandbox="allow-scripts allow-forms"');
  });

  test("预览态：按用户配置输出 sandbox（空值不带空属性）", () => {
    const plain = renderIframe({ src: "https://example.com/embed" }, "preview");
    const noSb = iframeTag(plain);
    expect(noSb).not.toContain("sandbox");
    expect(noSb).not.toContain('sandbox=""');

    const locked = renderIframe(
      { src: "https://example.com/embed", sandbox: "allow-scripts allow-same-origin" },
      "preview",
    );
    expect(iframeTag(locked)).toContain('sandbox="allow-scripts allow-same-origin"');
  });

  test("自适应高度：开启 autoHeight 不改变编辑态沙箱收窄（画布沙箱优先）", () => {
    // 编辑画布态：autoHeight 被静默忽略（sandbox 收窄后无法读同源文档高度），
    // 强制沙箱策略仍然生效，不因 autoHeight 放行 allow-same-origin。
    const editHtml = renderIframe({ src: "https://example.com/embed", autoHeight: true }, "edit");
    const tag = iframeTag(editHtml);
    expect(tag).toContain('sandbox="allow-scripts allow-forms"');
    expect(tag).not.toContain("allow-same-origin");

    // 预览态：放开用户完整配置（autoHeight 的相对高度样式在 Emotion SSR 下不以
    // 内联样式呈现，样式行为由发布端 codegen 契约测试 media-iframe.test.ts 锁定）
    const previewHtml = renderIframe({ src: "https://example.com/embed", autoHeight: true }, "preview");
    expect(iframeTag(previewHtml)).not.toContain("sandbox");
  });
});