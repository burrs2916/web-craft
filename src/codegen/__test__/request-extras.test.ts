/**
 * 「请求扩展」口径锁 —— apiHeaders / apiBody 的写入口径 + 发布端契约。
 *
 * 背景：这两个键在 codegen 里有**三套互相冲突的写法**，而 UI 从未写过它们，所以雷一直没踩：
 *   ① 裸 `String(c.apiHeaders ?? "")`（约 23 处）；
 *   ② `JSON.stringify(c.apiHeaders ?? {})`（breadcrumb）→ 传字符串会**二次编码**；
 *   ③ `typeof v === "string" ? v : JSON.stringify(v ?? {})`（form 局部）。
 *
 * 发布端契约（`dataLoader.ts:60`）是 `var apiHeadersRaw = ${JSON.stringify(o.apiHeaders ?? "")}`，
 * 运行时 `JSON.parse(apiHeadersRaw)`，失败被 `catch(e){}` **静默吞掉**。由此推出唯一正确形状：
 *   · 传 **JSON 文本（string）** → 内嵌成 JS 字符串字面量 → `JSON.parse` 得对象 ✓
 *   · 传 **对象**            → 内嵌成 JS 对象字面量 → `JSON.parse` 抛错 → 请求头/体被**静默丢弃** ✗
 *   · 传 **已编码过的字符串** → `JSON.parse` 得**字符串** → `for (var k in extra)` 逐字符展开成垃圾头 ✗
 *
 * 所以本锁断言的不是"某处写法长什么样"，而是**写入者可用的三种输入都落到同一个可 parse 的对象**。
 */
import { describe, test, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import type { SceneDSL } from "../../types/scene";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { jsonObjectOf, jsonTextError, jsonTextField, jsonTextOfRows } from "../../editor/data/requestExtras";

beforeAll(() => {
  initBuiltinCodegens();
});

// ─────────────────────────── 口径纯函数 ───────────────────────────

describe("requestExtras 口径", () => {
  test("写侧：对象 → JSON 文本；已是文本则原样透传（不二次编码）", () => {
    expect(jsonTextField({ "X-Org": "demo" })).toBe('{"X-Org":"demo"}');
    // 关键：文本入参必须原样返回——这是 breadcrumb 当年踩的坑
    expect(jsonTextField('{"X-Org":"demo"}')).toBe('{"X-Org":"demo"}');
    expect(jsonTextField("")).toBe("");
    expect(jsonTextField(null)).toBe("");
    expect(jsonTextField(undefined)).toBe("");
  });

  test("行式写侧：空键丢弃；全空给 \"\"（表示未配置，而非 \"{}\"）", () => {
    expect(jsonTextOfRows([{ key: "X-Org", value: "demo" }])).toBe('{"X-Org":"demo"}');
    expect(jsonTextOfRows([{ key: "  ", value: "demo" }])).toBe("");
    expect(jsonTextOfRows([])).toBe("");
    // 键会被 trim
    expect(jsonTextOfRows([{ key: "  A  ", value: "1" }])).toBe('{"A":"1"}');
  });

  test("读侧：三种历史形状都收敛到同一对象（回显用）", () => {
    const want = { "X-Org": "demo" };
    expect(jsonObjectOf('{"X-Org":"demo"}')).toEqual(want); // 本口径产物
    expect(jsonObjectOf({ "X-Org": "demo" })).toEqual(want); // 对象形状（历史/全局源）
    expect(jsonObjectOf("")).toEqual({});
    expect(jsonObjectOf("{}")).toEqual({});
    expect(jsonObjectOf("not json")).toEqual({}); // 非法文本 → 空回显，不抛
    expect(jsonObjectOf(["a"])).toEqual({}); // 数组不是键值对
    expect(jsonObjectOf(123)).toEqual({});
  });

  test("读→写 往返稳定（行编辑器回显后提交不会漂移）", () => {
    const text = jsonTextOfRows([
      { key: "X-Org", value: "demo" },
      { key: "Accept", value: "application/json" },
    ]);
    const back = jsonTextOfRows(
      Object.entries(jsonObjectOf(text)).map(([key, value]) => ({ key, value })),
    );
    expect(back).toBe(text);
  });

  test("校验：非法 JSON 必须报错（否则用户以为配好了，发布端静默丢弃）", () => {
    expect(jsonTextError("")).toBeNull();
    expect(jsonTextError(null)).toBeNull();
    expect(jsonTextError('{"a":1}')).toBeNull();
    expect(jsonTextError("  ")).toBeNull();
    expect(jsonTextError('{"a":}')).not.toBeNull();
    expect(jsonTextError("{oops")).not.toBeNull();
    // 非文本（对象）按"已是对象"处理，一律合法
    expect(jsonTextError({ a: 1 })).toBeNull();
  });
});

// ─────────────────── 发布端契约：写入者产物必须可被运行时 parse ───────────────────

const baseComponent = (type: string, config: Record<string, unknown>): SceneComponent => ({
  id: "c1",
  type,
  name: type,
  transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 260 }),
  layerId: "l1",
  zIndex: 0,
  locked: false,
  visible: true,
  config,
  children: [],
  parentId: null,
});

const makeCtx = (component: SceneComponent): CodegenContext => {
  const scene: SceneDSL = {
    id: "req-extras",
    name: "Request Extras",
    status: "draft",
    tags: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 1024, height: 768 },
    views: [{ id: "v1", name: "V", components: [component], layers: [] }],
    apiConfig: { baseUrl: "", authEnabled: false, defaultHeaders: {}, timeout: 10000 },
  };
  return {
    view: scene.views![0]!,
    canvasConfig: scene.canvasConfig!,
    scene,
    preview: true,
    componentMap: new Map([[component.id, component]]),
    childrenByParent: new Map(),
    pageStyles: [],
    pageScripts: [],
    externalDeps: [],
    iconData: {},
  };
};

/**
 * 复刻运行时：抽出 `var <name>Raw = <字面量>;` 的字面量 → 先当 JSON 解析（应得**字符串**，
 * 因为内嵌的是 JS 字符串字面量）→ 再 parse 一次得对象。两步都必须成立：
 *   第一步拿到非字符串 ⇒ 写入者给了对象/或已被 String() 成 "[object Object]"；
 *   第二步 parse 抛错或拿到非对象 ⇒ 运行时拿不到键值对（头/体被静默丢弃或展开成垃圾）。
 *
 * 注意取产物要含 `ctx.pageScripts`：部分组件（echarts 族）把 loader 放进 runtime IIFE
 * 推进 pageScripts，不从返回值出来。
 */
const fullArtifact = (html: string, ctx: CodegenContext): string => `${html}\n${ctx.pageScripts.join("\n")}`;

const parseRawVar = (artifact: string, varName: string): unknown => {
  const m = artifact.match(new RegExp(`var ${varName} = (.*?);`));
  expect(m, `产物里没有 ${varName}`).toBeTruthy();
  const literalValue = JSON.parse(m![1]!) as unknown; // 等价于运行时拿到 apiHeadersRaw
  expect(typeof literalValue, `${varName} 内嵌后必须是字符串（否则运行时 JSON.parse 抛错被吞）`).toBe("string");
  return JSON.parse(literalValue as string) as unknown;
};

// 覆盖三套历史写法各自的代表：表/指标卡（裸 String）/ 图标族（breadcrumb 曾是双编码）/
// 图表族（echarts 走 dataFetchParts + jsonField）/ 进度（裸 String）
const CANDIDATES = ["table", "metric", "breadcrumb", "echart-bar", "progress"];

describe("发布端契约：apiHeaders/apiBody 的形状必须可被 runtime parse", () => {
  test("面板产物（行式 JSON 文本）经 codegen 内嵌后仍解析为对象", () => {
    const headersText = jsonTextOfRows([
      { key: "X-Org", value: "demo" },
      { key: "Accept", value: "application/json" },
    ]);
    const bodyText = '{"q":"cpu"}';
    // 写入者只能生产字符串
    expect(typeof headersText).toBe("string");

    const checked: string[] = [];
    for (const type of CANDIDATES) {
      const codegen = getCodegen(type);
      expect(codegen, `${type} 无 codegen`).toBeTruthy();
      const comp = baseComponent(type, {
        dataMode: "api",
        apiUrl: "https://api.example.com/stats",
        apiMethod: "POST",
        apiHeaders: headersText,
        apiBody: bodyText,
      });
      const ctx = makeCtx(comp);
      const artifact = fullArtifact(codegen!(comp, ctx), ctx);
      if (!artifact.includes("var apiHeadersRaw =")) continue; // 该组件不产生统一骨架
      checked.push(type);
      expect(parseRawVar(artifact, "apiHeadersRaw"), `${type}: 请求头未解析为对象`).toEqual({
        "X-Org": "demo",
        Accept: "application/json",
      });
      expect(parseRawVar(artifact, "apiBodyRaw"), `${type}: 请求体未解析为对象`).toEqual({ q: "cpu" });
    }
    // 冻结清单：任一组件停止产生统一骨架（或新增）都必须有人显式确认
    expect(checked.sort()).toEqual(["breadcrumb", "echart-bar", "metric", "progress", "table"]);
  });

  test("负向：直传对象会被运行时静默丢弃（这就是必须收口径的原因）", () => {
    const codegen = getCodegen("table")!;
    const comp = baseComponent("table", {
      dataMode: "api",
      apiUrl: "https://api.example.com/stats",
      apiMethod: "POST",
      apiHeaders: { "X-Org": "demo" }, // ← 对象形状（历史三套写法之一）
    });
    const ctx = makeCtx(comp);
    const artifact = fullArtifact(codegen(comp, ctx), ctx);
    const m = artifact.match(/var apiHeadersRaw = (.*?);/);
    expect(m).toBeTruthy();
    // 裸 String() 会把对象变成 "[object Object]" —— 一个"看起来像字符串"的毒值
    const literalValue = JSON.parse(m![1]!) as unknown;
    expect(literalValue).toBe("[object Object]");
    // 运行时 JSON.parse("[object Object]") 抛 SyntaxError → 被 catch(e){} 吞掉 → 请求头**静默丢失**
    expect(() => JSON.parse(literalValue as string)).toThrow();
  });
});

// ─────────────────────────── 源码守卫 ───────────────────────────

describe("源码守卫：禁止二次编码 apiHeaders/apiBody", () => {
  test("codegen 里不得再出现无 typeof 守卫的 JSON.stringify(<cfg>.apiHeaders|apiBody)", () => {
    const root = path.resolve(process.cwd(), "src/codegen/components");
    const offenders: string[] = [];
    const re = /JSON\.stringify\(\s*[A-Za-z_$][\w.$]*\.api(?:Headers|Body)\b/;
    for (const file of fs.readdirSync(root)) {
      if (!file.endsWith(".ts")) continue;
      const full = path.join(root, file);
      const src = fs.readFileSync(full, "utf8");
      src.split("\n").forEach((line, i) => {
        if (!re.test(line)) return;
        // 允许：同一行有 typeof 守卫（`typeof x === "string" ? x : JSON.stringify(x ?? {})`）
        if (/\btypeof\b/.test(line)) return;
        offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `二次编码会把字符串再包一层，运行时得到字符串而非对象：\n${offenders.join("\n")}`).toEqual([]);
  });
});
