import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import {
  SWITCH_TRACK_OFF_COLOR,
  SWITCH_TRACK_OFF_OPACITY,
  SWITCH_TRACK_ON_OPACITY,
  SWITCH_THUMB_OFF_COLOR,
} from "../../editor/data/toggleStyle";

initBuiltinCodegens();

/**
 * 回归锁：**「状态切换时才变化的 CSS 属性」绝不能写在 inline style 上**。
 *
 * 根因（真实故障，一次性打坏三个表单控件）：样式表里的状态规则（`.x input:checked ~ …`、
 * `:focus-within …`）优先级**低于**目标元素的内联 style 声明（inline 恒胜过任何非 !important
 * 的样式表规则）。于是只要把 background/left/display 这类"状态要变的属性"写进 inline，
 * 对应的状态规则就被永久压死 —— 交互时 checked 确实翻转（JS 状态正常），但画面毫无变化。
 *
 * 实测证据（无头 Chrome 读 computed style，且 `*{transition:none}` 排除过渡起点干扰）：
 * - form-checkbox：原 `svgIcon` 给图标写 inline `display:block` → `.ic-on{display:none}` 失效，
 *   勾选/未勾选两个图标同时可见、被 flex 挤成 21px，点击无变化。
 * - form-radio：同上（图标被挤成 19px）。
 * - form-switch：`.sw-thumb` 写 inline `left:9px`/`background`、`.sw-track` 写 inline `background`/`opacity`
 *   → 选中态规则失效，点击后 thumb 恒在 left:9px、颜色不变（旧写法实测 A/B 对照确认）。
 *
 * jsdom 不实现 CSS 级联，故无法用 computed style 断言这类问题；此处锁定可静态校验的不变量：
 * 目标元素开标签里不得出现状态规则会改的属性 + 样式表必须同时给出基础态与状态规则。
 */
const mk = (type: string, config: Record<string, unknown>): SceneComponent => ({
  id: "c1",
  type,
  name: type,
  transform: createDefaultTransform({ x: 0, y: 0, width: 220, height: 40 }),
  layerId: "l1",
  zIndex: 0,
  locked: false,
  visible: true,
  config,
  children: [],
  parentId: null,
});

const ctx = { pageScripts: [] } as never;

const render = (type: string, config: Record<string, unknown>): string =>
  getCodegen(type)!(mk(type, config), ctx);

const uidOf = (html: string, prefix: string): string =>
  (html.match(new RegExp(`class="(${prefix}[a-z0-9]+)"`)) || [])[1] || "";

/** 取指定 class 的第一个开标签 */
const openTag = (html: string, cls: string): string =>
  (html.match(new RegExp(`<[a-z]+\\b[^>]*\\bclass="${cls}"[^>]*>`)) || [])[0] || "";

describe("切换型图标（.ic-on/.ic-off）不得带 inline display", () => {
  const cases: Array<[string, string, Record<string, unknown>, string]> = [
    ["form-checkbox", "复选框（中号）", { label: "同意服务条款" }, "fcb-"],
    ["form-checkbox", "复选框（小号）", { label: "同意", size: "small" }, "fcb-"],
    ["form-radio", "单选组", { label: "性别", options: "男\n女" }, "frd-"],
  ];

  for (const [type, label, config, prefix] of cases) {
    test(`${label}：图标无 inline display，样式表含基础态与勾选态`, () => {
      const out = render(type, config);
      const uid = uidOf(out, prefix);
      expect(uid).toBeTruthy();

      const tags = [...out.matchAll(/<svg\b[^>]*\bclass="ic-(?:on|off)"[^>]*>/g)].map((m) => m[0]);
      // 复选框 1 组（on/off 各一）；单选组每个选项各一组 → 偶数且至少 2 个
      expect(tags.length).toBeGreaterThanOrEqual(2);
      expect(tags.length % 2).toBe(0);
      for (const tag of tags) expect(tag).not.toMatch(/\bdisplay\s*:/);

      expect(out).toContain(`.${uid} .ic-on{display:none}`);
      expect(out).toContain(`.${uid} .ic-off{display:block}`);
      expect(out).toContain(`.${uid} input:checked ~ * .ic-on{display:block}`);
      expect(out).toContain(`.${uid} input:checked ~ * .ic-off{display:none}`);
    });
  }

  test("复选框半选：只渲染横线图标，不产出 on/off 切换对", () => {
    const out = render("form-checkbox", { label: "全选", indeterminate: true });
    expect([...out.matchAll(/<svg\b[^>]*\bclass="ic-(?:on|off)"/g)]).toEqual([]);
    expect(out).not.toContain(".ic-on{");
  });

  test("svgIcon 仍带 inline display:block（其他非切换型图标依赖，不得因本修复被改掉）", () => {
    const out = render("form-input", { label: "姓名", clearable: true });
    const svgs = [...out.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
    expect(svgs.length).toBeGreaterThan(0);
    expect(svgs.every((s) => s.includes("display:block"))).toBe(true);
  });
});

describe("开关（.sw-track/.sw-thumb）状态属性不得 inline", () => {
  const out = render("form-switch", { label: "启用通知", accentColor: "#1976d2" });
  const uid = uidOf(out, "fsw-");

  test("轨道与滑块的 background/left/opacity 不写在 inline 上", () => {
    const track = openTag(out, "sw-track");
    const thumb = openTag(out, "sw-thumb");
    expect(track).toBeTruthy();
    expect(thumb).toBeTruthy();
    for (const tag of [track, thumb]) {
      expect(tag).not.toMatch(/\bbackground(-color)?\s*:/);
      expect(tag).not.toMatch(/\bleft\s*:/);
      expect(tag).not.toMatch(/\bopacity\s*:/);
    }
    // 过渡属性留在 inline 无妨（状态规则不涉及 transition）
    expect(track).toContain("transition:background");
    expect(thumb).toContain("transition:left");
  });

  test("样式表同时给出基础态与选中态规则", () => {
    // 默认取值直接读唯一口径 `toggleStyle.ts`，而不是把字面量再抄一遍 ——
    // 这条锁管的是「声明落在哪一层」，取值本身由口径文件负责，抄第二份必然漂移。
    expect(out).toContain(
      `.${uid} .sw-track{background:${SWITCH_TRACK_OFF_COLOR};opacity:${SWITCH_TRACK_OFF_OPACITY}}`,
    );
    expect(out).toContain(`.${uid} .sw-thumb{left:9px;background:${SWITCH_THUMB_OFF_COLOR}}`);
    expect(out).toContain(
      `.${uid} input:checked ~ .sw .sw-track{background:#1976d2;opacity:${SWITCH_TRACK_ON_OPACITY}}`,
    );
    expect(out).toContain(`.${uid} input:checked ~ .sw .sw-thumb{left:29px;background:#1976d2}`);
  });
});
