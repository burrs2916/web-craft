import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";

initBuiltinCodegens();

function selectComp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "fs1",
    type: "form-select",
    name: "Select",
    transform: createDefaultTransform({ x: 100, y: 100, width: 280, height: 56 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

describe("form-select codegen：动态 API 选项", () => {
  test("静态模式：旧 options 文本自动迁移为 <option>，且不注入 dataLoader 取数脚本", () => {
    const ctx = { pageScripts: [], globalDataSources: {} } as never;
    const out = getCodegen("form-select")!(
      selectComp({ label: "城市", placeholder: "请选择", clearable: true, options: "广东|GD\n北京|BJ" }),
      ctx,
    );
    // 占位 + 静态两项均渲染（旧文本「显示名|提交值」）
    expect(out).toContain('value="GD"');
    expect(out).toContain('value="BJ"');
    expect(out).toContain("请选择");
    // 静态模式不应生成 dataLoader 取数骨架 / 全局钩子
    expect(out).not.toContain("__wcSel_");
    expect(out).not.toContain("__WC_API_BASE");
    expect(out).not.toContain("buildFetchUrl");
  });

  test("静态模式：items 数组（list-editor）+ 逐项图标渲染为 data-icon 并注入弹层", () => {
    const ctx = { pageScripts: [], globalDataSources: {} } as never;
    const out = getCodegen("form-select")!(
      selectComp({
        label: "城市",
        items: [
          { label: "北京", value: "BJ", icon: "material:home" },
          { label: "上海", value: "SH" },
        ],
      }),
      ctx,
    );
    // 提交值/显示名来自 items
    expect(out).toContain('value="BJ"');
    expect(out).toContain('value="SH"');
    // 有图标的项带 data-icon（内联 SVG），无图标的项不带
    expect(out).toContain("data-icon=");
    const bjOpt = (out.match(/<option[^>]*value="BJ"[^>]*>/) || [])[0];
    const shOpt = (out.match(/<option[^>]*value="SH"[^>]*>/) || [])[0];
    expect(bjOpt).toContain("data-icon=");
    expect(shOpt).not.toContain("data-icon=");
    // 触发器带独立图标容器 -ic，且编译期已填入选中项图标
    expect(out).toContain("-ic");
    // 弹层运行时注入 data-icon
    expect(out).toContain("getAttribute('data-icon')");
  });

  test("静态模式：items 中提交值留空时回退为显示名", () => {
    const ctx = { pageScripts: [], globalDataSources: {} } as never;
    const out = getCodegen("form-select")!(
      selectComp({ label: "城市", items: [{ label: "北京" }] }),
      ctx,
    );
    expect(out).toContain('value="北京"');
  });

  test("接口模式：注入 dataLoader 取数 + afterOptionsUpdate 钩子，且忽略静态 options", () => {
    const ctx = { pageScripts: [], globalDataSources: {} } as never;
    const out = getCodegen("form-select")!(
      selectComp({
        label: "城市",
        placeholder: "请选择",
        clearable: true,
        dataMode: "api",
        apiUrl: "https://api.example.com/cities",
        apiDataPath: "data.list",
        apiValueField: "code",
        apiLabelField: "name",
        // 即便填了静态 options，接口模式下也不应渲染
        options: "垃圾|TRASH",
      }),
      ctx,
    );
    // 静态选项被忽略
    expect(out).not.toContain('value="TRASH"');
    // dataLoader 取数骨架（与 list/table 同源：URL 拼接 / Token 注入）
    expect(out).toContain("__WC_API_BASE");
    expect(out).toContain("buildFetchUrl");
    // panelScript 暴露 afterOptionsUpdate 钩子，供数据到达后重建自定义面板
    expect(out).toContain("__wcSel_");
    expect(out).toContain("afterOptionsUpdate");
    // 接口字段映射逻辑被内联进 renderBody（取值/显示字段字面量）
    expect(out).toContain('"code"');
    expect(out).toContain('"name"');
    // 数据到达后灌入原生 select 并触发面板重建
    expect(out).toContain("afterOptionsUpdate()");
  });

  test("接口模式：绑定全局数据源后覆盖自带取数配置（取数地址取自全局源）", () => {
    const ctx = {
      pageScripts: [],
      globalDataSources: {
        ds1: { id: "ds1", dataMode: "api", apiUrl: "https://api.example.com/global", apiDataPath: "rows" },
      },
    } as never;
    const out = getCodegen("form-select")!(
      selectComp({ label: "项", dataSourceId: "ds1", options: "垃圾|TRASH" }),
      ctx,
    );
    expect(out).not.toContain('value="TRASH"');
    expect(out).toContain("__WC_API_BASE");
    expect(out).toContain("afterOptionsUpdate");
    // 取数地址取自全局源（global），而非组件自带
    expect(out).toContain("api.example.com/global");
  });

  test("接口模式：无占位时初始原生 select 为空（数据由脚本填充）", () => {
    const ctx = { pageScripts: [], globalDataSources: {} } as never;
    const out = getCodegen("form-select")!(
      selectComp({ label: "项", dataMode: "api", apiUrl: "https://api.example.com/x" }),
      ctx,
    );
    // 没有 placeholder/clearable → 初始 effective 为空，不应出现空占位 <option>
    expect(out).not.toContain('value="">');
    expect(out).toContain("__WC_API_BASE");
  });
});
