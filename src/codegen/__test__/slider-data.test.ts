import { describe, test, expect } from "vitest";
import { generateEventsScript } from "../scaffold/events";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { EventBinding, SceneComponent } from "../../types/editor";

initBuiltinCodegens();

/**
 * {{value}} 事件值注入 + 滑块动态数据 的契约锁（第 12 轮）。
 *
 * 背景：事件脚手架 execAction 的 callApi body 此前是**配置时写死的静态 JSON**——
 * 原生 change 事件虽能绑 callApi，但命令体带不上当前值，"拖滑块下发档位"断在最后一米。
 * 注入通道：触发事件的 detail.value（自定义事件，如开关）或 target.value（原生控件，
 * 如滑块/输入框）替换 params 里所有 "{{value}}" 占位符；无事件上下文时原样透传（零回归）。
 */
function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1", type: "form-slider", name: "form-slider",
    transform: createDefaultTransform({ x: 0, y: 0, width: 280, height: 56 }),
    layerId: "l1", zIndex: 0, locked: false, visible: true,
    config, children: [], parentId: null,
  };
}

const renderSlider = (config: Record<string, unknown>): string => getCodegen("form-slider")!(comp(config), { pageScripts: [], pageStyles: [] } as never);
/** 带收集器版本：按压反馈类规则落在 ctx.pageStyles（第 13 轮） */
const renderSliderFull = (config: Record<string, unknown>): { html: string; pageStyles: string[] } => {
  const pageStyles: string[] = [];
  const html = getCodegen("form-slider")!(comp(config), { pageScripts: [], pageStyles } as never);
  return { html, pageStyles };
};

function makeBinding(params: Record<string, unknown>): EventBinding {
  return {
    id: "b1", name: "测试绑定", enabled: true,
    sourceComponentId: "c1", sourceEvent: "change",
    targetComponentId: "c2", targetAction: "callApi",
    triggerSource: "interaction", params,
  } as unknown as EventBinding;
}

describe("事件脚手架：{{value}} 事件值注入", () => {
  const out = generateEventsScript([
    makeBinding({ url: "/api/device/level", method: "POST", body: { level: "{{value}}" } }),
  ]).inlineScript;

  test("handler 携带事件对象，execAction 第四参接收", () => {
    expect(out).toContain("var handler = function(e) {");
    expect(out).toContain("execAction(targetId, action, params, e);");
  });

  test("injectEventValue 定义在脚手架内（字符串替换 + 对象/数组递归）", () => {
    expect(out).toContain("function injectEventValue(x, val) {");
    expect(out).toContain("x.split('{{value}}').join(String(val))");
    expect(out).toContain("if (evt.detail && evt.detail.value !== undefined) evVal = evt.detail.value;");
    expect(out).toContain("else if (evt.target && evt.target.value !== undefined) evVal = evt.target.value;");
  });

  test("无事件绑定时脚手架不含注入逻辑（模板恒产出工具函数）", () => {
    const empty = generateEventsScript([]).inlineScript;
    // 有绑定才有 execAction 函数体；空绑定连执行器都不生成
    expect(empty).not.toContain("injectEventValue");
  });
});

describe("form-slider：动态数据（metric/progress/switch 同一套键与语义）", () => {
  test("static 模式零脚本（产物与历史逐字节一致的前提）", () => {
    const out = renderSlider({ label: "档位", value: 30 });
    expect(out).not.toContain("__wcSld_");
    expect(out).not.toContain("var apiUrl");
    expect(out).toContain('value="30"');
  });

  test("api 模式 + 有地址：dataLoaderScript 骨架 + update 回调镜像三部件公式", () => {
    const out = renderSlider({ label: "档位", dataMode: "api", apiUrl: "https://a.b/level", apiDataPath: "data.level", valueSuffix: "%" });
    expect(out).toContain('var apiUrl = "https://a.b/level"');
    expect(out).toContain('var apiDataPath = "data.level"');
    expect(out).toContain('window["__wcSld_');
    // clamp 与百分比公式（与 oninput 同一原点）
    expect(out).toContain("if (n < min) n = min;");
    expect(out).toContain("(n - min) / (max - min) * 100");
    // 单位后缀镜像（标签行回显与气泡共用）
    expect(out).toContain('var suffix = "%"');
    // 四部件同步：隐藏 range 取值 + 填充条 + 滑块 + 回显
    expect(out).toContain("if (input) input.value = n;");
    expect(out).toContain('track.style.width = p + "%"');
    expect(out).toContain('val.textContent = txt');
    // 回读不到明确数值保持现状（滑块没有 "--" 语义）
    expect(out).toContain("if (n === null) return;");
  });

  test("coerceNum 手工镜像与 progressData.ts 同步（数字串/对象 unwrap）", () => {
    const out = renderSlider({ dataMode: "api", apiUrl: "https://a.b/l" });
    expect(out).toContain("v.value != null ? v.value : (v.percent != null ? v.percent : v.current)");
  });

  test("field 数据源绑定：监听包装层 data-update 事件（数据引擎派发目标）", () => {
    const out = renderSlider({ field: "level", dataMode: "datasource", dataSourceId: "ds1" });
    expect(out).toContain('el.addEventListener("data-update"');
    expect(out).toContain('d["level"] !== undefined ? d["level"] : d.value');
  });

  test("api 模式无地址：不注入任何取数脚本（与 progress 的 api-no-url 口径一致）", () => {
    const out = renderSlider({ dataMode: "api", apiUrl: "" });
    expect(out).not.toContain("var apiUrl");
    expect(out).not.toContain("__wcSld_");
  });

  test("认证三态原样字面量化 + 轮询间隔透传", () => {
    expect(renderSlider({ dataMode: "api", apiUrl: "https://a.b/l", authEnabled: true, apiInterval: 5 })).toContain("var authEnabled = true");
    expect(renderSlider({ dataMode: "api", apiUrl: "https://a.b/l", authEnabled: false })).toContain("var authEnabled = false");
    expect(renderSlider({ dataMode: "api", apiUrl: "https://a.b/l", authEnabled: null })).toContain("var authEnabled = null");
    expect(renderSlider({ dataMode: "api", apiUrl: "https://a.b/l", apiInterval: 5 })).toContain("var apiInterval = 5");
  });

  test("staticData 显式存在时优先（metric/progress 同款），并夹进 [min,max]", () => {
    // 静态源值 80 覆盖默认 value 30
    const out = renderSlider({ value: 30, staticData: 80 });
    expect(out).toContain('value="80"');
    // 越界夹紧：staticData 500 > max 100 → 100
    const clamped = renderSlider({ value: 30, staticData: 500 });
    expect(clamped).toContain('value="100"');
    // 不可解析 → 回退静态 value
    const bad = renderSlider({ value: 30, staticData: "abc" });
    expect(bad).toContain('value="30"');
  });

  test("回读值按 step 量化（api 返回 72.5 而 step=1 时显示与提交值对齐）", () => {
    const out = renderSlider({ dataMode: "api", apiUrl: "https://a.b/l", step: 1 });
    expect(out).toContain("Math.round((n - min) / stepV) * stepV");
  });

  test("拖动竞态守卫：拖动中跳过回读（pointerdown 起 / pointerup 止）", () => {
    const out = renderSlider({ dataMode: "api", apiUrl: "https://a.b/l" });
    expect(out).toContain('input.addEventListener("pointerdown", function(){ dragging = true; })');
    expect(out).toContain('window.addEventListener("pointerup", function(){ dragging = false; })');
    // update 首行短路：拖动中不碰任何部件
    expect(out).toMatch(/function update\(v\) \{\s*\n\s*if \(dragging\) return;/);
  });
});

describe("form-slider：刻度数值标注（showTickLabels，两端同一公式）", () => {
  test("开启后按等分公式渲染数值（0/25/50/75/100），挂在刻度线下方", () => {
    const out = renderSlider({ showTicks: true, showTickLabels: true, min: 0, max: 100, tickCount: 5 });
    expect(out).toContain('data-slider-tick-label');
    expect(out).toContain(">0</span>");
    expect(out).toContain(">25</span>");
    expect(out).toContain(">50</span>");
    expect(out).toContain(">75</span>");
    expect(out).toContain(">100</span>");
    // 与刻度同一百分比原点（left:%）+ 挂在 tickSize/2+2 下方
    expect(out).toMatch(/left:25%;top:6px/);
  });

  test("非整数等分保留最多两位小数并去尾零（min 0 max 1 tick 3 → 0/0.5/1）", () => {
    const out = renderSlider({ showTicks: true, showTickLabels: true, min: 0, max: 1, tickCount: 3 });
    expect(out).toContain(">0.5</span>");
    expect(out).not.toContain(">0.50</span>");
  });

  test("未开启时不渲染标注（零回归）", () => {
    const out = renderSlider({ showTicks: true });
    expect(out).not.toContain("data-slider-tick-label");
  });
});

describe("form-slider：按压反馈（第 13 轮 P2）", () => {
  test("状态类规则进 ctx.pageStyles：transform/box-shadow 只在 .sl-pressing 规则层（铁律）", () => {
    const { pageStyles } = renderSliderFull({ label: "档位", value: 30 });
    expect(pageStyles).toHaveLength(1);
    const rule = pageStyles[0];
    expect(rule).toContain(".sl-pressing [data-slider-thumb]");
    expect(rule).toContain("transform:scale(1.2)");
    // medium 档 thumb=16 → 环宽 8px，强调色 15% 透明度
    expect(rule).toContain("box-shadow:0 0 0 8px #1976d226");
  });

  test("input 挂 pointerdown/up/cancel/blur 四事件切状态类；thumb 带 transition（不碰 left）", () => {
    const out = renderSlider({ label: "档位" });
    expect(out).toContain("onpointerdown=");
    expect(out).toContain("classList.add('sl-pressing')");
    expect(out).toContain("onpointerup=");
    expect(out).toContain("onpointercancel=");
    expect(out).toContain("onblur=");
    expect(out).toContain("classList.remove('sl-pressing')");
    // 过渡只声明 transform/box-shadow —— left 由拖动脚本逐帧改写，不能被过渡拖慢
    expect(out).toMatch(/data-slider-thumb style="[^"]*transition:transform \.15s ease, box-shadow \.15s ease/);
  });

  test("thumb 设 pointer-events:none：事件穿透到 input，抓取拖动生效（拖不动根因修复）", () => {
    const out = renderSlider({ label: "档位" });
    // 抓拇指时最顶层必须回到隐藏 range，否则 pointerdown 落在拇指 div 上、原生 range 收不到 press
    expect(out).toMatch(/data-slider-thumb style="[^"]*pointer-events:none/);
  });

  test("disabled：不挂 handler、不注入规则（原生 range 不响应指针）", () => {
    const { html, pageStyles } = renderSliderFull({ label: "档位", disabled: true });
    expect(html).not.toContain("onpointerdown");
    expect(html).not.toContain("sl-pressing");
    expect(pageStyles).toHaveLength(0);
  });
});
