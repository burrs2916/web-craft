/**
 * 回归测试：折叠面板（accordion）items 数据流
 *
 * 历史缺陷：
 * 1. 属性面板 items 用 textarea，而 defaultConfig.items 是数组 →
 *    MUI TextareaAutosize 收到数组 value 报 Invalid prop。
 *    改为 list-editor（ObjectListEditor）后 onChange 输出数组，
 *    codegen / 渲染器必须兼容数组形式。
 * 2. echart-custom：codegen 直接透传用户 JSON option，custom series
 *    无 renderItem（JSON 无法携带函数）→ ECharts "series.render is required"。
 */
import { describe, it, expect } from "vitest";
import { generateHTML } from "../../codegen/engine";
import type { SceneDSL } from "../../types/scene";

function genScene(config: Record<string, unknown>, type = "accordion"): SceneDSL {
  return {
    id: "t", name: "T", activeViewId: "v1",
    views: [{
      id: "v1", name: "Home",
      components: [{
        id: "c-1", type, name: "C",
        transform: { x: 0, y: 0, width: 360, height: 320, rotation: 0, scale: { x: 1, y: 1 } },
        layerId: "layer-1", zIndex: 1, locked: false, visible: true,
        config,
      }],
      layers: [{ id: "layer-1", name: "L1", order: 0, visible: true, opacity: 1 }],
      canvasConfig: { width: 1200, height: 800, padding: { top: 0, right: 0, bottom: 0, left: 0 } },
    }],
  } as unknown as SceneDSL;
}

describe("accordion items 数据流", () => {
  it("items 为数组（list-editor 输出）时 codegen 正常生成面板", () => {
    const html = generateHTML(genScene({
      items: [
        { title: "面板A", content: "内容A", icon: "star" },
        { title: "面板B", content: "内容B", icon: "" },
      ],
    }), { framework: "static-html", preview: true })[0].html;
    expect(html).toContain("面板A");
    expect(html).toContain("内容B");
    expect(html).toContain("data-wc-accordion");
  });

  it("items 为 JSON 字符串（旧场景数据）时仍兼容", () => {
    const html = generateHTML(genScene({
      items: '[{"title":"旧面板","content":"旧内容","icon":"info"}]',
    }), { framework: "static-html", preview: true })[0].html;
    expect(html).toContain("旧面板");
    expect(html).toContain("旧内容");
  });

  it("空 items 生成空态提示而非崩溃", () => {
    const html = generateHTML(genScene({ items: [] }), { framework: "static-html", preview: true })[0].html;
    expect(html).toContain("data-wc-accordion");
  });

  it("过渡动画：grid 0fr/1fr 替代 max-height hack", () => {
    const html = generateHTML(genScene({
      items: [{ title: "A", content: "内容A" }, { title: "B", content: "内容B" }],
    }), { framework: "static-html", preview: true })[0].html;
    // 旧的 9999px hack（可见动画仅占时长 ~1%，观感为瞬间跳变）必须移除
    expect(html).not.toContain("max-height:9999px");
    expect(html).not.toContain("maxHeight = '9999px'");
    // 新结构：expander/squeezer + grid-template-rows 过渡注入 pageStyles
    expect(html).toContain(".wc-acc-expander{display:grid;grid-template-rows:0fr");
    expect(html).toContain('grid-template-rows:1fr');
    expect(html).toContain(".wc-acc-squeezer");
    // 统一缓动 + 无障碍降级
    expect(html).toContain("cubic-bezier(.4,0,.2,1)");
    expect(html).toContain("prefers-reduced-motion");
    // 切换脚本只翻转 data-open，动画由 CSS 驱动
    expect(html).not.toContain("data-open-padding");
    expect(html).toContain("aria-expanded");
  });

  it("多实例 CSS 只注入一次", () => {
    const scene = {
      id: "t", name: "T", activeViewId: "v1",
      views: [{
        id: "v1", name: "Home",
        components: [1, 2].map((n) => ({
          id: `c-${n}`, type: "accordion", name: `A${n}`,
          transform: { x: 0, y: 0, width: 360, height: 320, rotation: 0, scale: { x: 1, y: 1 } },
          layerId: "layer-1", zIndex: n, locked: false, visible: true,
          config: { items: [{ title: "T", content: "C" }] },
        })),
        layers: [{ id: "layer-1", name: "L1", order: 0, visible: true, opacity: 1 }],
        canvasConfig: { width: 1200, height: 800, padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      }],
    } as unknown as SceneDSL;
    const html = generateHTML(scene, { framework: "static-html", preview: true })[0].html;
    const count = html.split(".wc-acc-expander{display:grid").length - 1;
    expect(count).toBe(1);
    // 两个实例都在
    expect((html.match(/data-wc-accordion/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("图标设计：iconColor 透传 + itemIconSize 独立于字号", () => {
    const html = generateHTML(genScene({
      itemIconSize: 24,
      items: [
        { title: "告警", content: "内容", icon: "star", iconColor: "#FF5252" },
        { title: "普通", content: "内容", icon: "settings", iconColor: "" },
      ],
    }), { framework: "static-html", preview: true })[0].html;
    // 图标颜色透传：inline-flex span 包裹
    expect(html).toContain('color:#FF5252');
    // 无 iconColor 的项不加颜色 span（不产生多余包裹）
    expect(html).not.toContain('color:undefined');
    // 图标尺寸使用独立 itemIconSize（24），而非标题字号 14
    expect(html).toContain("width:24px;height:24px");
    // 仍然输出面板标题
    expect(html).toContain("告警");
    expect(html).toContain("普通");
  });
});

describe("echart-custom renderItem 兜底", () => {
  it("用户 option 的 custom series 被补上兜底 renderItem", () => {
    const html = generateHTML(genScene({
      option: {
        xAxis: { type: "category", data: ["A", "B"] },
        yAxis: { type: "value" },
        series: [{ type: "custom", data: [[0, 10], [1, 20]] }],
      },
    }, "echart-custom"), { framework: "static-html", preview: true })[0].html;
    // 生成的运行时脚本必须包含兜底逻辑，否则发布页报 series.render is required
    expect(html).toContain('cs.type === "custom"');
    expect(html).toContain("cs.renderItem");
  });

  it("无 option 时不生成崩溃配置", () => {
    const html = generateHTML(genScene({}, "echart-custom"), { framework: "static-html", preview: true })[0].html;
    expect(html).toContain("echart-custom");
  });
});
