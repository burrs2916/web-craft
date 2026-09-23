import { test, beforeAll, describe, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { componentRegistry } from "../../editor/registry";
import { registerFormComponents } from "../../editor/registerFormComponents";
import { registerBasicComponents } from "../../editor/registerBasicComponents";
import { registerTableComponents } from "../../editor/registerTableComponents";
import { registerIconComponents } from "../../editor/registerIconComponents";
import { registerDecorationComponents } from "../../editor/registerDecorationComponents";
import { registerLayoutComponents } from "../../editor/registerLayoutComponents";

initBuiltinCodegens();
beforeAll(() => {
  registerBasicComponents();
  registerLayoutComponents();
  registerFormComponents();
  registerTableComponents();
  registerIconComponents();
  registerDecorationComponents();
});

let seed = 42;
beforeAll(() => {
  // codegen 的 uid 用 Math.random —— 不钉死就无法做「同配置两次渲染必须逐字相同」的比对
  Math.random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
});

/**
 * 属性栏诚实性全量回归锁（2026-09-20 第 10 轮建立）。
 *
 * 对六组（表单/媒体/表格/图标/装饰/形状）的每个标量面板字段：换一组对照值渲染两次 codegen，
 * 产物（html + pageStyles + pageScripts）必须发生变化。**完全不变的即「假控件」——
 * 面板承诺了却改不动画面的字段一律禁止**，除非命中下方 CONDITIONAL_ALLOWED 白名单。
 *
 * 白名单 = 「条件激活」字段：基线配置下不参与产物，但条件成立后真实生效（有注释说明条件）。
 * 新增此类字段必须在这里登记；从 codegen 摘除假字段后应把对应项移出白名单。
 *
 * 实现要点（踩过的坑）：
 * 1. 组件级 codegen 直接返回字符串，但会向 ctx.pageStyles / ctx.pageScripts 追加内容
 *    （datav 边框的 strokeWidth 就在 pageStyles）→ 每次渲染用全新 ctx 并比对全量产物；
 * 2. 每次渲染前重置随机序列起点，否则 uid 漂移会让「同配置两次渲染」必然不同；
 * 3. 对照值保留原始类型：布尔 false 被 String 化成 "false" 后，`c.showSubmit !== false`
 *    这类严格比较会把字符串当真值 → 候选失效，产生海量误报；
 * 4. defaultConfig 常缺键（undefined），有效默认值来自解析函数兜底 → 每字段试多个候选。
 */

/** 条件激活白名单（type.key → 生效条件说明） */
const CONDITIONAL_ALLOWED = new Set([
  // 标题区只在有标题/副标题时渲染（面板 help 已注明）
  "form-container.showHeader",
  // 列数只驱动编辑区空态占位示意；发布端子控件按画布位置自由排布（help 已注明）
  "form-container.columns",
  // 图标只在选项条目配置了 icon 时渲染
  "form-segmented.showIcon",
  // 标签位置只在标签文案非空时可见（默认标签为空 → 切换位置不改产物）
  "form-segmented.labelPlacement",
  // 同上：评分的标签默认也为空（hasFloat/hasTop 都要求 label 非空）
  "form-rate.labelPlacement",
  // 副标题颜色只在副标题文案非空时出现
  "audio.subtitleColor",
  // 空态三件套：只在数据为空时渲染
  "table.emptyText", "table.emptyColor", "table.emptyBg",
  // 合法日期 / JSON 才参与解析（基线候选值是非法占位串）
  "calendar.value", "calendar.marks", "tree.data",
  // 描述列表：标题样式只在标题非空时输出；gap/斑马纹只在有条目时可见
  "descriptions.titleColor", "descriptions.titleFontSize", "descriptions.gap", "descriptions.striped",
  // 空态文案：树数据为空时渲染
  "tree.emptyText",
  // 描边色只在边框宽度 > 0 时参与（先色后宽是常规操作流，故不 hidden）
  "decoration-cross.stroke", "decoration-dot.stroke", "decoration-gradient.stroke", "decoration-gradient.strokeWidth",
]);

const ctxTemplate = { pageScripts: [], pageStyles: [], iconData: {}, globalDataSources: {} };

function comp(type: string, config: Record<string, unknown>): SceneComponent {
  // 容器 = defaultSize × 2：宽度足以触发一切几何相关逻辑。
  // 历史：曾统一 320×120，但字段型「文字随框缩放」的 factor = min(w/refW, h/refH)，
  // 320×120 对 textarea（ref 280×120）恰好 factor=1，scaleFit toggle 恒无变化 → 误报假控件。
  const def = componentRegistry.get(type);
  const dw = (def?.defaultSize.width ?? 320) * 2;
  const dh = (def?.defaultSize.height ?? 120) * 2;
  return {
    id: "c1", type, name: type,
    transform: createDefaultTransform({ x: 0, y: 0, width: dw, height: dh }),
    layerId: "l1", zIndex: 0, locked: false, visible: true, config, children: [], parentId: null,
  };
}

function render(type: string, config: Record<string, unknown>): string {
  const fn = getCodegen(type);
  if (!fn) return "";
  const c2 = { ...ctxTemplate, pageScripts: [], pageStyles: [] };
  seed = 42; // 重置随机序列：两次渲染必须逐字相同
  const html = fn(comp(type, config), c2 as never);
  return html + "\u0000styles\u0000" + c2.pageStyles.join("|") + "\u0000scripts\u0000" + c2.pageScripts.join("|");
}

/** 媒体基线补 src（资源键统一叫 source），否则整个元素不渲染、字段全部失活 */
const BASE_ENRICH: Record<string, Record<string, unknown>> = {
  image: { source: "https://example.com/a.png" },
  video: { source: "https://example.com/a.mp4", poster: "" },
  audio: { source: "https://example.com/a.mp3" },
};

/** 校验组字段：只在开启校验（有规则）时写入 data-vrules → 这些组件基线统一 required:true */
const VALIDATE_KEYS = new Set(["validateType", "validateMessage", "errorColor"]);

/** dataMode 需要完整数据源接线（apiUrl/全局源）才改变产物，由 data-config / 数据源专项测试覆盖 */
const SKIP_KEYS = new Set(["dataMode"]);

const SCALAR = new Set(["text", "number", "color", "select", "toggle", "slider", "textarea"]);

const GROUPS: Record<string, string> = {
  表单: "ccat_form",
  媒体: "ccat_media",
  表格: "ccat_table",
  图标: "ccat_icon",
  装饰: "ccat_decoration",
  形状: "ccat_shape",
};

describe("属性栏诚实性全量回归锁", () => {
  for (const [gname, cat] of Object.entries(GROUPS)) {
    test(gname, () => {
      const fakes: string[] = [];
      for (const def of componentRegistry.getByCategory(cat)) {
        const type = def.type;
        const schema = def.configSchema ?? [];
        const base = {
          ...(def.defaultConfig ?? {}),
          ...(BASE_ENRICH[type] ?? {}),
          // 校验组字段所在组件：开启必填让校验规则落进 data-vrules
          ...(schema.some((f) => VALIDATE_KEYS.has(f.key)) ? { required: true } : {}),
        } as Record<string, unknown>;
        const a = render(type, base);
        const a2 = render(type, base);
        // 同配置两次渲染必须逐字相同（uid 已钉死）——否则后续比对全是噪音
        expect(a, `${type}: 同配置两次渲染不同`).toBe(a2);
        for (const f of schema) {
          if (!SCALAR.has(String(f.type))) continue;
          if (SKIP_KEYS.has(f.key)) continue;
          if (f.hidden?.(base)) continue;
          const cur = base[f.key];
          const cands: unknown[] = [];
          if (f.type === "toggle") {
            cands.push(cur !== true);
          } else if (f.type === "select") {
            let n = 0;
            for (const o of (f.options ?? []) as Array<{ value: unknown }>) {
              if (String(o.value) !== String(cur)) { cands.push(o.value); if (++n >= 2) break; }
            }
          } else if (f.type === "number" || f.type === "slider") {
            const n = Number(cur);
            if (f.min != null && String(f.min) !== String(cur)) cands.push(f.min);
            if (f.max != null && String(f.max) !== String(cur)) cands.push(f.max);
            if (!cands.length && Number.isFinite(n)) cands.push(n === 0 ? 7 : n + 1);
          } else if (f.type === "textarea") {
            cands.push(String(cur ?? "") + "_x");
          } else if (f.type === "color") {
            cands.push("#111111");
          } else {
            cands.push(String(cur ?? "") + "_x");
          }
          // 去重但保留原始类型（布尔/数字不能被 String 化）
          const seen = new Set<string>();
          const uniq: unknown[] = [];
          for (const v of cands) {
            const k = typeof v + ":" + String(v);
            if (seen.has(k) || String(v) === String(cur)) continue;
            seen.add(k);
            uniq.push(typeof cur === "number" || f.type === "number" || f.type === "slider" ? Number(v) : v);
          }
          if (!uniq.length) continue;
          let changed = false;
          for (const next of uniq) {
            if (render(type, { ...base, [f.key]: next }) !== a) { changed = true; break; }
          }
          if (!changed && !CONDITIONAL_ALLOWED.has(`${type}.${f.key}`)) {
            fakes.push(`${type}.${f.key} (${f.group}/${f.type})`);
          }
        }
      }
      expect(fakes, `假控件（面板承诺了却改不动产物，需修 codegen 或登记白名单）：\n${fakes.join("\n")}`).toEqual([]);
    });
  }
});
