import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { SWITCH_FIT, fitFactor } from "../../editor/data/scaleFit";

initBuiltinCodegens();

const ctx = { pageScripts: [] } as never;

function comp(config: Record<string, unknown>, w = 200, h = 40): SceneComponent {
  return {
    id: "c1",
    type: "switch",
    name: "switch",
    transform: createDefaultTransform({ x: 0, y: 0, width: w, height: h }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function render(config: Record<string, unknown>): string {
  const fn = getCodegen("switch");
  expect(fn, "缺少 switch 的 codegen").toBeTruthy();
  return fn!(comp(config), ctx);
}

/**
 * switch（基础控制型开关）契约锁。
 *
 * 已合并旧 form-switch（面板隐藏、注册保留供旧场景渲染），能力 = 看状态 + 发命令 + 可选表单提交。
 * 与编辑区渲染器两端同源，锁八件事：
 *   1. 缩放骨架两端同源（SWITCH_FIT 内联进 scaleSkeletonScript，refW/refH = 注册表 defaultSize）；
 *   2. 状态属性铁律：track/thumb 的状态属性只进类规则（.${uid}.on …），inline 只有静态声明；
 *   3. 表单提交 opt-in：fieldName 填写才输出隐藏 input[name]（checkbox 提交布尔值），留空零表单痕迹；
 *   4. 必填校验：fieldName + required → data-vrules + fc-err + liveValidate；
 *      required 无 fieldName → 不出校验（必填只在提交场景有意义）；
 *   5. 交互：interactive 开 → 点击脚本（乐观翻转 on 类 + 镜像 input.checked + 派发冒泡 change）；
 *      interactive 关或 disabled → 无脚本无 pointer；
 *   6. 回读：api 模式挂 dataLoaderScript 骨架，coerceState 期望值/词表镜像与 switchData.ts 同步；
 *   7. 认证三态与轮询间隔透传；
 *   8. 帮助文字 fc-help 与错误让位。
 */
describe("switch：缩放骨架两端同源", () => {
  test("三层骨架 + 缩放脚本内联 SWITCH_FIT（refW/refH = defaultSize 200×40）", () => {
    const out = render({});
    expect(out).toMatch(/class="sw-[a-z0-9]+-st"/);
    expect(out).toMatch(/class="sw-[a-z0-9]+-in"/);
    expect(out).toContain(
      `var RW=${SWITCH_FIT.refW},RH=${SWITCH_FIT.refH},MIN=${SWITCH_FIT.min},MAX=${SWITCH_FIT.max}`,
    );
    expect(out).toContain("__wcFit");
    // 缩放系数公式与编辑区 fitFactor 同源
    expect(fitFactor(400, 20, SWITCH_FIT)).toBe(0.5); // min(400/200, 20/40) = 0.5
    expect(out).toContain("f=Math.min(w/RW,h/RH)");
  });
});

describe("switch：状态属性铁律与表单边界", () => {
  test("track/thumb 状态属性只由类规则给，inline 无 background/left 状态声明", () => {
    const out = render({ checked: true });
    // 类规则：开启态轨道/滑块
    expect(out).toMatch(/\.sw-[a-z0-9]+\.on \.sw-track\{background:#1976d2/);
    expect(out).toMatch(/\.sw-[a-z0-9]+\.on \.sw-thumb\{left:\d+px;background:#1976d2\}/);
    // 关闭态基线规则也在类层
    expect(out).toMatch(/\.sw-[a-z0-9]+ \.sw-track\{background:/);
    // sw-track / sw-thumb 的 inline style 不含状态声明（background:/left:）；
    // transition 里的属性名（background .2s）是静态声明，不在禁令内
    const trackInline = out.match(/class="sw-track" style="([^"]*)"/);
    expect(trackInline).toBeTruthy();
    expect(trackInline![1]).not.toContain("background:");
    expect(trackInline![1]).not.toContain("opacity:");
    const thumbInline = out.match(/class="sw-thumb" style="([^"]*)"/);
    expect(thumbInline).toBeTruthy();
    expect(thumbInline![1]).not.toContain("left:");
    expect(thumbInline![1]).not.toContain("background:");
  });

  test("checked=true 时根节点带 on 类（静态初始态）", () => {
    expect(render({ checked: true })).toMatch(/class="sw-[a-z0-9]+ on"/);
    expect(render({ checked: false })).toMatch(/class="sw-[a-z0-9]+"/);
    expect(render({ checked: false })).not.toMatch(/class="sw-[a-z0-9]+ on"/);
  });

  test("表单提交 opt-in：fieldName 填写才输出隐藏 input[name]；留空零表单痕迹", () => {
    // 留空：无隐藏 input、无校验（纯控制开关不污染表单数据）
    const plain = render({});
    expect(plain).not.toContain("type=\"checkbox\"");
    expect(plain).not.toContain("__WCVALIDATE");
    expect(plain).not.toContain("data-vrules");
    // 填写：隐藏 checkbox 带生成 name；必填星号只在 required 时出现
    const withField = render({ fieldName: "power" });
    expect(withField).toMatch(/<input type="checkbox" id="sw-[a-z0-9]+" name="power"/);
    expect(withField).not.toContain("data-vrules");
    const withReq = render({ fieldName: "power", required: true });
    expect(withReq).toMatch(/<input type="checkbox" id="sw-[a-z0-9]+" name="power"/);
    expect(withReq).toContain("data-vrules");
    expect(withReq).toContain("required");
    expect(withReq).toMatch(/fc-err/);
    expect(withReq).toContain("__WCVALIDATE");
    // required 无 fieldName：不出校验（必填只在提交场景有意义）
    const reqOnly = render({ required: true });
    expect(reqOnly).not.toContain("data-vrules");
  });

  test("交互脚本镜像 input.checked（提交取值与视觉同源），change 在 input 上派发冒泡", () => {
    const out = render({ fieldName: "power" });
    expect(out).toContain("input.checked = next");
    expect(out).toContain("(input || root).dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: next } })");
    // 必填实时校验挂在隐藏 input 的 change 上（liveValidateScript 只在 fieldName+required 时注入）
    const withReq = render({ fieldName: "power", required: true });
    expect(withReq).toContain("d.addEventListener('change',v)");
  });

  test("disabled：灰显 not-allowed、无点击脚本；表单收集跳过（input disabled）", () => {
    const out = render({ fieldName: "power", disabled: true });
    expect(out).toContain("cursor:not-allowed;opacity:.38");
    expect(out).not.toContain("__wcSw");
    expect(out).toMatch(/name="power"[^>]* disabled/);
  });

  test("帮助文字：fc-help 常驻、有校验规则时让位（初始 display:none）+ 让位脚本", () => {
    expect(render({ helperText: "长按 3 秒强制断电" })).toMatch(
      /class="fc-help"[^>]*display:block[^>]*>长按 3 秒强制断电</,
    );
    const withVa = render({ fieldName: "power", required: true, helperText: "长按 3 秒强制断电" });
    expect(withVa).toMatch(/class="fc-help"[^>]*display:none/);
    // helperYieldScript：错误提示与帮助文字互斥同步
    expect(withVa).toMatch(/getElementById\('sw-[a-z0-9]+h'\)/);
  });
});

describe("switch：交互（乐观翻转 + change 事件）", () => {
  test("interactive 默认开：点击脚本翻转 on 类并派发冒泡 change（detail.value）", () => {
    const out = render({});
    expect(out).toContain("cursor:pointer");
    expect(out).toContain("root.classList.toggle('on', next)");
    expect(out).toContain("new CustomEvent('change', { bubbles: true, detail: { value: next } })");
    // 防重复绑定的卫兵
    expect(out).toContain("root.__wcSw");
  });

  test("interactive=false：只读展示，无点击脚本、无 pointer", () => {
    const out = render({ interactive: false });
    expect(out).not.toContain("cursor:pointer");
    expect(out).not.toContain("__wcSw");
    expect(out).not.toContain("CustomEvent");
  });
});

describe("switch：接口回读", () => {
  test("api 模式 + 有地址：挂 dataLoaderScript 骨架，renderBody 按 coerceState 切 on 类", () => {
    const out = render({ dataMode: "api", apiUrl: "https://api.example.com/power" });
    expect(out).toContain("var apiUrl = \"https://api.example.com/power\"");
    expect(out).toContain("el.classList.toggle('on', st === true)");
    // coerceState 手工镜像的期望值通道（开关特有语义：期望值优先于词表）
    expect(out).toContain("var ONV = \"\", OFFV = \"\"");
    // 内置词表镜像（与 editor/data/switchData.ts 同步）
    expect(out).toContain("',true,1,on,open,opened,yes,run,running,active,开,开启,打开,运行,运行中,启动,启用,在线,'");
    expect(out).toContain("',false,0,off,close,closed,no,stop,stopped,inactive,关,关闭,停止,停机,停用,离线,'");
    // 回读不到明确状态保持现状（开关没有 unknown 态）
    expect(out).toContain("if (st === null) return;");
  });

  test("期望值 onValue/offValue 写进运行时（不区分大小写比较）", () => {
    const out = render({ dataMode: "api", apiUrl: "https://a.b/c", onValue: "Running", offValue: "Stopped" });
    expect(out).toContain('var ONV = "running", OFFV = "stopped"');
  });

  test("api 模式但无地址：不注入取数脚本（与 progress 的 api-no-url 口径一致）", () => {
    const out = render({ dataMode: "api", apiUrl: "" });
    expect(out).not.toContain("var apiUrl");
  });

  test("static 模式不注入取数脚本", () => {
    const out = render({});
    expect(out).not.toContain("var apiUrl");
  });

  test("认证三态原样字面量化（true/false/null），轮询间隔透传", () => {
    const t = render({ dataMode: "api", apiUrl: "https://a.b/c", authEnabled: true, apiInterval: 5 });
    expect(t).toContain("var authEnabled = true");
    expect(t).toContain("var apiInterval = 5");
    const f = render({ dataMode: "api", apiUrl: "https://a.b/c", authEnabled: false });
    expect(f).toContain("var authEnabled = false");
    const n = render({ dataMode: "api", apiUrl: "https://a.b/c", authEnabled: null });
    expect(n).toContain("var authEnabled = null");
  });
});
