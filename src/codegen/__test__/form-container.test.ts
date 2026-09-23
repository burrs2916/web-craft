/**
 * 表单容器 codegen 回归测试 — 验证：
 * 1. 容器输出 <form> 并包裹子控件
 * 2. 子控件带 name（优先 fieldName，缺省用 label）
 * 3. 注入一次页面级提交脚本 WCFORM_SUBMIT
 */
import { describe, test, expect } from "vitest";
import { generateHTML } from "../engine";
import { generateProjectScaffold } from "../scaffold";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

function buildScene(): { scene: SceneDSL; html: string; scripts: string } {
  initBuiltinCodegens();
  const scene: SceneDSL = {
    id: "form-test",
    name: "Form Test",
    status: "draft",
    tags: [],
    metadata: { localWorkDir: "/tmp/web-craft-form" },
    createdAt: 0,
    updatedAt: 0,
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
    views: [{
      id: "v1",
      name: "Form",
      layers: [{
        id: "l1", name: "Form", type: "layer", parentId: null, isDefault: true,
        children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true,
      }],
      components: [
        {
          id: "fc1",
          type: "form-container",
          name: "表单容器",
          transform: createDefaultTransform({ x: 20, y: 20, width: 400, height: 360 }),
          layerId: "l1",
          zIndex: 0,
          locked: false,
          visible: true,
          config: {
            submitMethod: "POST",
            submitUrl: "https://api.example.com/submit",
            submitText: "提交",
            showSubmit: true,
          },
          children: ["inp1", "sel1"],
        },
        {
          id: "inp1",
          type: "form-input",
          name: "输入框",
          parentId: "fc1",
          transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 56 }),
          layerId: "l1",
          zIndex: 0,
          locked: false,
          visible: true,
          config: {
            label: "姓名",
            fieldName: "userName",
            required: true,
            placeholder: "请输入姓名",
          },
        },
        {
          id: "sel1",
          type: "form-select",
          name: "下拉选择",
          parentId: "fc1",
          transform: createDefaultTransform({ x: 0, y: 60, width: 400, height: 56 }),
          layerId: "l1",
          zIndex: 0,
          locked: false,
          visible: true,
          config: {
            label: "城市",
            options: "北京\n上海",
          },
        },
      ],
    }],
  };
  const pages = generateHTML(scene, { framework: "static-html", preview: false });
  const html = pages[0].html;
  return { scene, html, scripts: html };
}

describe("form-container codegen", () => {
  const { html, scripts } = buildScene();

  test("输出 <form> 并包裹子控件与提交按钮", () => {
    expect(html).toContain("<form ");
    expect(html).toMatch(/name="userName"/);
    expect(html).toContain("北京");
    expect(html).toContain("type=\"submit\"");
  });

  test("字段绝对定位叠加：子控件按画布坐标定位（对齐编辑区渲染）", () => {
    // 画布 EditorCanvasComponent 以绝对定位叠加渲染容器子控件，
    // 发布端必须同样处理 —— 否则字段被流式布局重排，位置与编辑区大幅偏差
    expect(html).toContain('data-form-field="1"');
    expect(html).toContain('data-component-type="form-input"');
    // 字段单元按拖放坐标绝对定位（边框开启时按外缘原点补偿 1px）
    const inpCell = html.match(/<div data-component-id="inp1"[^>]*>/)?.[0] ?? "";
    expect(inpCell).toContain("position:absolute");
    expect(inpCell).toContain("left:-1px");
    expect(inpCell).toContain("top:-1px");
    expect(inpCell).toContain("width:400px");
    expect(inpCell).toContain("height:56px");
    const selCell = html.match(/<div data-component-id="sel1"[^>]*>/)?.[0] ?? "";
    expect(selCell).toContain("top:59px");
    // form 自身是定位基准，子控件不会相对页面对齐（修复"按钮/字段跑向顶部"）
    expect(html).toMatch(/<form [^>]*position: relative/);
    // 提交按钮保持在表单流内（非独立绝对定位跳到页面顶部）
    const submitBtn = html.match(/<button[^>]*class="fc-submit"[^>]*>/)?.[0] ?? "";
    expect(submitBtn).not.toContain("position:absolute");
  });

  test("提交脚本注入为裸 JS：不出现嵌套 <script>（修复 preview 报 Unexpected token '<'）", () => {
    // WCFORM_SUBMIT 必须以裸 JS 进入页面底部的单个 <script>，不得再包一层 <script id=...>
    expect(html).toContain("/*__WCFORM__*/window.WCFORM_SUBMIT");
    expect(html).not.toContain("<script><script");
    expect(html).not.toContain('<script id="__WCFORM__">');
    // 底部脚本块数量与结构：每个 data-fc 表单只注入一次提交逻辑
    expect((html.match(/__WCFORM__/g) ?? []).length).toBe(1);
  });

  test("缺省 name 时按 label 生成（中文标签保留）", () => {
    expect(html).toMatch(/name="城市"/);
  });

  test("全局提交脚本只注入一次", () => {
    expect(scripts).toContain("WCFORM_SUBMIT");
    expect(scripts.split("WCFORM_SUBMIT=").length - 1).toBe(1);
  });

  test("校验正则反斜杠转义正确（修复模板字符串吞 \\s/\\d/\\. 致 email/phone/number 校验失效）", () => {
    // 产物文本必须是 \s \d \.（单反斜杠）；若生成器模板字符串漏写双反斜杠，
    // 运行时会变成 [^s@]、d{9}，邮箱放行垃圾值、手机号永远校验失败
    expect(scripts).toContain("/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/");
    expect(scripts).toContain("/^1[3-9]\\d{9}$/");
    expect(scripts).toContain("/^-?\\d+(\\.\\d+)?$/");
    // 不得出现被吃掉反斜杠的坏正则
    expect(scripts).not.toContain("[^s@]");
    expect(scripts).not.toContain("9d{9}");
  });

  test("表单未配置提交地址时拦截提交（不发 fetch('') 无效请求）", () => {
    expect(scripts).toContain("if(!o.url)");
    expect(scripts).toContain("表单未配置提交地址");
  });

  test("提交按钮在字段区(flex:1)之后：空表单/单列也不贴顶部", () => {
    // 字段区占位（flex:1 minHeight:40，对齐编辑区）把提交按钮压到表单底部
    const fieldIdx = html.indexOf('flex:1;min-height:40px');
    const btnIdx = html.indexOf('class="fc-submit"');
    expect(fieldIdx).toBeGreaterThan(-1);
    expect(btnIdx).toBeGreaterThan(fieldIdx);
    // 空表单（无子控件）：仅有的提交按钮同样被 flex:1 占位区推到末尾
    const emptyScene: SceneDSL = {
      id: "form-empty", name: "Form Empty", status: "draft", tags: [], metadata: {},
      createdAt: 0, updatedAt: 0,
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
      views: [{
        id: "v1", name: "Form",
        layers: [{ id: "l1", name: "F", type: "layer", parentId: null, isDefault: true, children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true }],
        components: [{
          id: "fc-empty", type: "form-container", name: "表单", transform: createDefaultTransform({ x: 20, y: 20, width: 400, height: 300 }), layerId: "l1", zIndex: 0, locked: false, visible: true, config: { showSubmit: true, submitText: "提交", columns: 1 }, children: [],
        }],
      }],
    };
    const emptyHtml = generateHTML(emptyScene, { framework: "static-html", preview: true })[0].html;
    const eField = emptyHtml.indexOf('flex:1;min-height:40px');
    const eBtn = emptyHtml.indexOf('class="fc-submit"');
    expect(eField).toBeGreaterThan(-1);
    expect(eBtn).toBeGreaterThan(eField);
  });

  test("children 引用兜底：仅靠 children 数组（无 parentId）也能生成子字段", () => {
    const scene: SceneDSL = {
      id: "form-fb",
      name: "Form Fallback",
      status: "draft",
      tags: [],
      metadata: { localWorkDir: "/tmp/web-craft-form-fb" },
      createdAt: 0,
      updatedAt: 0,
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
      views: [{
        id: "v1",
        name: "Form",
        layers: [{ id: "l1", name: "Form", type: "layer", parentId: null, isDefault: true, children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true }],
        components: [
          {
            id: "fc1",
            type: "form-container",
            name: "表单容器",
            transform: createDefaultTransform({ x: 20, y: 20, width: 400, height: 200 }),
            layerId: "l1",
            zIndex: 0,
            locked: false,
            visible: true,
            config: { submitMethod: "POST", submitUrl: "https://a.com/s", showSubmit: true },
            children: ["inpX"],
          },
          {
            // 子组件未设置 parentId，仅被 fc1.children 引用
            id: "inpX",
            type: "form-input",
            name: "邮箱",
            transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 56 }),
            layerId: "l1",
            zIndex: 0,
            locked: false,
            visible: true,
            config: { label: "邮箱", fieldName: "email" },
          },
        ],
      }],
    };
    const pages = generateHTML(scene, { framework: "static-html", preview: false });
    expect(pages[0].html).toMatch(/<form /);
    expect(pages[0].html).toMatch(/name="email"/);
  });

  test("发布脚手架：表单容器子字段生成且不独立平铺", () => {
    const { scene } = buildScene();
    const files = generateProjectScaffold(scene, "static-html");
    const index = files.find((f) => f.path === "index.html")?.content ?? "";
    expect(index).toMatch(/<form /);
    expect(index).toMatch(/name="userName"/);
    // 表单容器与输入框各出现一次：字段在 form 内部递归渲染，不再被平铺为独立顶级组件
    expect((index.match(/data-component-type="form-container"/g) ?? []).length).toBe(1);
    expect((index.match(/data-component-type="form-input"/g) ?? []).length).toBe(1);
  });

  test("表单 v2：头部标题/副标题渲染", () => {
    const scene: SceneDSL = {
      id: "form-v2",
      name: "Form V2",
      status: "draft",
      tags: [],
      metadata: { localWorkDir: "/tmp/web-craft-form-v2" },
      createdAt: 0,
      updatedAt: 0,
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
      views: [{
        id: "v1",
        name: "Form",
        layers: [{ id: "l1", name: "Form", type: "layer", parentId: null, isDefault: true, children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true }],
        components: [{
          id: "fc1",
          type: "form-container",
          name: "表单容器",
          transform: createDefaultTransform({ x: 20, y: 20, width: 400, height: 360 }),
          layerId: "l1",
          zIndex: 0,
          locked: false,
          visible: true,
          config: {
            showHeader: true, title: "联系我们", subtitle: "请填写以下信息",
            columns: 2, showReset: true, resetText: "清空",
            authToken: "disabled", afterAction: "message",
            children: [],
          },
          children: [],
        }],
      }],
    };
    const pages = generateHTML(scene, { framework: "static-html", preview: false });
    const html = pages[0].html;
    expect(html).toContain("联系我们");
    expect(html).toContain("请填写以下信息");
  });

  test("表单 v2：多列栅格渲染", () => {
    const scene: SceneDSL = {
      id: "form-grid",
      name: "Form Grid",
      status: "draft",
      tags: [],
      metadata: { localWorkDir: "/tmp/web-craft-form-grid" },
      createdAt: 0,
      updatedAt: 0,
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
      views: [{
        id: "v1",
        name: "Form",
        layers: [{ id: "l1", name: "Form", type: "layer", parentId: null, isDefault: true, children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true }],
        components: [{
          id: "fc1",
          type: "form-container",
          name: "表单容器",
          transform: createDefaultTransform({ x: 20, y: 20, width: 400, height: 360 }),
          layerId: "l1",
          zIndex: 0,
          locked: false,
          visible: true,
          config: { columns: 3 },
          children: [],
        }],
      }],
    };
    const html = generateHTML(scene, { framework: "static-html", preview: false })[0].html;
    // 编辑区"字段 N"占位栅格是编辑态提示，不发布；真实子控件按画布坐标绝对定位
    expect(html).toMatch(/<form /);
    expect(html).not.toContain("grid-template-columns");
    expect(html).not.toContain("字段 1");
  });

  test("表单 v2：重置按钮渲染", () => {
    const scene: SceneDSL = {
      id: "form-reset",
      name: "Form Reset",
      status: "draft",
      tags: [],
      metadata: { localWorkDir: "/tmp/web-craft-form-reset" },
      createdAt: 0,
      updatedAt: 0,
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
      views: [{
        id: "v1",
        name: "Form",
        layers: [{ id: "l1", name: "Form", type: "layer", parentId: null, isDefault: true, children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true }],
        components: [{
          id: "fc1",
          type: "form-container",
          name: "表单容器",
          transform: createDefaultTransform({ x: 20, y: 20, width: 400, height: 360 }),
          layerId: "l1",
          zIndex: 0,
          locked: false,
          visible: true,
          config: { showReset: true, resetText: "清空" },
          children: [],
        }],
      }],
    };
    const html = generateHTML(scene, { framework: "static-html", preview: false })[0].html;
    expect(html).toContain("type=\"reset\"");
    expect(html).toContain("清空");
  });

  test("表单 v2：子控件校验 data-vrules 与提交脚本校验逻辑", () => {
    initBuiltinCodegens();
    const scene: SceneDSL = {
      id: "form-val",
      name: "Form Validate",
      status: "draft",
      tags: [],
      metadata: { localWorkDir: "/tmp/web-craft-form-val" },
      createdAt: 0,
      updatedAt: 0,
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
      views: [{
        id: "v1",
        name: "Form",
        layers: [{ id: "l1", name: "Form", type: "layer", parentId: null, isDefault: true, children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true }],
        components: [
          {
            id: "fc1",
            type: "form-container",
            name: "表单容器",
            transform: createDefaultTransform({ x: 20, y: 20, width: 400, height: 300 }),
            layerId: "l1",
            zIndex: 0,
            locked: false,
            visible: true,
            config: { submitMethod: "POST", submitUrl: "https://a.com/s", showSubmit: true, authToken: "disabled" },
            children: ["inpReq", "inpEmail"],
          },
          {
            id: "inpReq",
            type: "form-input",
            name: "姓名",
            parentId: "fc1",
            transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 56 }),
            layerId: "l1",
            zIndex: 0,
            locked: false,
            visible: true,
            config: { label: "姓名", fieldName: "name", required: true, validateMessage: "请填写姓名" },
          },
          {
            id: "inpEmail",
            type: "form-input",
            name: "邮箱",
            parentId: "fc1",
            transform: createDefaultTransform({ x: 0, y: 60, width: 400, height: 56 }),
            layerId: "l1",
            zIndex: 0,
            locked: false,
            visible: true,
            config: { label: "邮箱", fieldName: "email", validateType: "email", validateMessage: "邮箱格式有误" },
          },
        ],
      }],
    };
    const pages = generateHTML(scene, { framework: "static-html", preview: false });
    const html = pages[0].html;
    // required → data-vrules 携带 required 与自定义文案
    expect(html).toContain("data-vrules=");
    expect(html).toMatch(/required/);
    expect(html).toContain("请填写姓名");
    // email 校验规则
    expect(html).toContain("邮箱格式有误");
    // 错误提示元素存在
    expect(html).toContain("fc-err");
    // 提交脚本含校验循环与错误标红/聚焦（核心规则逻辑收敛到共享 __WCVALIDATE 运行时）
    expect(html).toContain("__WCVALIDATE__");
    expect(html).toContain("window.__WCVALIDATE=function");
    expect(html).toContain("querySelectorAll('[data-vrules]')");
    expect(html).toContain("firstErr.scrollIntoView");
    // 错误环走 box-shadow inset（边框环由 box-shadow 绘制，校验态同机制标红）
    expect(html).toContain("o.style.boxShadow=msg?('inset 0 0 0 '+bw+'px '+col):''");
    // 三级认证 disabled → 公开访问（opts 为 JSON 双引号）
    expect(html).toContain('"authMode":"disabled"');
  });

  test("表单 v2：数字区间校验 min/max 进入 data-vrules 并被运行时执行", () => {
    initBuiltinCodegens();
    const scene: SceneDSL = {
      id: "form-range",
      name: "Form Range",
      status: "draft",
      tags: [],
      metadata: { localWorkDir: "/tmp/web-craft-form-range" },
      createdAt: 0,
      updatedAt: 0,
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
      views: [{
        id: "v1",
        name: "Form",
        layers: [{ id: "l1", name: "Form", type: "layer", parentId: null, isDefault: true, children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true }],
        components: [
          {
            id: "fc1",
            type: "form-container",
            name: "表单容器",
            transform: createDefaultTransform({ x: 20, y: 20, width: 400, height: 240 }),
            layerId: "l1",
            zIndex: 0,
            locked: false,
            visible: true,
            config: { submitMethod: "POST", submitUrl: "https://a.com/s", showSubmit: true },
            children: ["inpNum"],
          },
          {
            id: "inpNum",
            type: "form-input",
            name: "年龄",
            parentId: "fc1",
            transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 56 }),
            layerId: "l1",
            zIndex: 0,
            locked: false,
            visible: true,
            config: { label: "年龄", fieldName: "age", validateType: "number", validateMin: 1, validateMax: 120 },
          },
        ],
      }],
    };
    const pages = generateHTML(scene, { framework: "static-html", preview: false });
    const html = pages[0].html;
    expect(html).toContain('data-vrules=');
    expect(html).toMatch(/"minVal":1/);
    expect(html).toMatch(/"maxVal":120/);
    // 运行时含 min/max 边界判定（parseFloat(v)<parseFloat(rules.minVal) / ...>...）
    expect(html).toMatch(/parseFloat\(v\)<parseFloat\(rules\.minVal\)/);
    expect(html).toMatch(/parseFloat\(v\)>parseFloat\(rules\.maxVal\)/);
  });

  test("输入框样式：聚焦边框色由 CSS 驱动、悬浮标签缺口、字数统计为下方流式行", () => {
    initBuiltinCodegens();
    const scene: SceneDSL = {
      id: "form-style",
      name: "Form Style",
      status: "draft",
      tags: [],
      metadata: { localWorkDir: "/tmp/web-craft-form-style" },
      createdAt: 0,
      updatedAt: 0,
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
      views: [{
        id: "v1",
        name: "Form",
        layers: [{ id: "l1", name: "Form", type: "layer", parentId: null, isDefault: true, children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true }],
        components: [
          {
            id: "fc1",
            type: "form-container",
            name: "表单容器",
            transform: createDefaultTransform({ x: 20, y: 20, width: 400, height: 160 }),
            layerId: "l1",
            zIndex: 0,
            locked: false,
            visible: true,
            config: { submitMethod: "POST", submitUrl: "https://a.com/s", showSubmit: true },
            children: ["inpS"],
          },
          {
            id: "inpS",
            type: "form-input",
            name: "账号",
            parentId: "fc1",
            transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 56 }),
            layerId: "l1",
            zIndex: 0,
            locked: false,
            visible: true,
            config: {
              label: "账号", fieldName: "account", labelPlacement: "inside",
              placeholder: "请输入账号",
              borderColor: "#d0d0d8", focusBorderColor: "#1976d2",
              clearable: true, maxLength: 50, showCount: true,
            },
          },
        ],
      }],
    };
    const html = generateHTML(scene, { framework: "static-html", preview: false })[0].html;
    // 1) 边框走 fieldset 实线覆盖层（data-ring 缺口，聚焦改 border-color，不挤压文字）
    expect(html).toContain("fc-outline");
    expect(html).toContain("border:1px solid #d0d0d8");
    // 2) 聚焦变色规则（边框色）与悬浮标签上移规则存在
    expect(html).toContain(":focus-within .fc-outline{border-color:#1976d2}");
    expect(html).toContain("input:not(:placeholder-shown) ~ .fc-flabel");
    // 3) 占位提示常驻可见（一般输入框都有提示信息）
    expect(html).toContain(' placeholder="请输入账号"');
    expect(html).toContain("input::placeholder{color:#333333;opacity:.5}");
    // 4) 字数统计为下方流式行（flex 尾部右对齐，非字段内绝对定位方块）
    expect(html).toMatch(/<span id="[^"]*n"[^>]*align-self:flex-end/);
  });
});