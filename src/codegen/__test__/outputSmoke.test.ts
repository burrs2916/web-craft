/**
 * 产物级冒烟测试 —— 生成的代码必须真正可用
 *
 * 之前的测试只断言字符串包含，导致"生成器自身全绿、产物 tsc 挂掉"的盲区
 * （http.ts 函数无类型注解 → strict 编译 11+ 错误；页面 import .js 无 allowJs → TS2307）。
 * 此处直接把产物写入临时目录，用真实 tsc --strict 验证编译通过。
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { generateProjectScaffold } from "../scaffold";
import { initBuiltinCodegens } from "../components";
import type { ProjectFile } from "../scaffold/types";
import type { SceneDSL } from "../../types/scene";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

// 最小测试场景：一个文本组件即可触发完整 scaffold 管线
const testScene: SceneDSL = {
  id: "smoke-scene",
  name: "Smoke Site",
  status: "draft",
  tags: [],
  metadata: {},
  createdAt: 0,
  updatedAt: 0,
  canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
  views: [{
    id: "v1",
    name: "Home",
    components: [{
      id: "c1",
      type: "text",
      name: "Title",
      transform: createDefaultTransform({ x: 100, y: 50, width: 400, height: 80 }),
      layerId: "l1",
      zIndex: 0,
      locked: false,
      visible: true,
      config: { content: "Hello", fontSize: 32, color: "#ffffff", textAlign: "center", fontWeight: "bold", fontFamily: "inherit" },
      children: [],
      parentId: null,
    }, {
      id: "c2",
      type: "form-button",
      name: "Btn",
      transform: createDefaultTransform({ x: 300, y: 300, width: 120, height: 40 }),
      layerId: "l1",
      zIndex: 1,
      locked: false,
      visible: true,
      config: { text: "Click", variant: "contained", bgColor: "#1976d2", textColor: "#ffffff", fontSize: 14, borderRadius: 4 },
      children: [],
      parentId: null,
    }],
    layers: [],
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
    eventBindings: [{
      id: "evt1",
      sourceComponentId: "c2",
      sourceEvent: "click",
      targetComponentId: "c1",
      targetAction: "toggle",
      triggerSource: "interaction",
    }],
  }],
};

initBuiltinCodegens();

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-smoke-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function tscCheck(files: { name: string; content: string }[]): void {
  for (const f of files) {
    fs.writeFileSync(path.join(tmpDir, f.name), f.content, "utf-8");
  }
  const projectTsc = path.resolve(__dirname, "../../../node_modules/typescript/bin/tsc");
  execFileSync("node", [
    projectTsc,
    "--noEmit",
    "--strict",
    "--target", "ES2020",
    "--moduleResolution", "bundler",
    "--module", "esnext",
    "--skipLibCheck",
    "--lib", "ES2020,DOM,DOM.Iterable",
    path.join(tmpDir, files[0].name),
  ], { cwd: tmpDir, stdio: "pipe" });
}

describe("产物 TS strict 编译冒烟", () => {
  test("react: src/api/http.ts + index.ts 通过 tsc --strict（零类型错误）", () => {
    const files = generateProjectScaffold(testScene, "react");
    tscCheck([
      { name: "http.ts", content: read(files, "src/api/http.ts") },
      { name: "index.ts", content: read(files, "src/api/index.ts") },
    ]);
  });

  test("vue: src/api/http.ts + index.ts 通过 tsc --strict", () => {
    const files = generateProjectScaffold(testScene, "vue");
    tscCheck([
      { name: "http.ts", content: read(files, "src/api/http.ts") },
      { name: "index.ts", content: read(files, "src/api/index.ts") },
    ]);
  });

  test("angular: src/api/http.ts + index.ts + environment.ts 通过 tsc --strict（且不依赖 import.meta.env）", () => {
    const files = generateProjectScaffold(testScene, "angular");
    const http = read(files, "src/api/http.ts");
    expect(http).not.toContain("import.meta.env");
    tscCheck([
      { name: "http.ts", content: http.replace("../environments/environment", "./environment") },
      { name: "index.ts", content: read(files, "src/api/index.ts") },
      { name: "environment.ts", content: read(files, "src/environments/environment.ts") },
    ]);
  });
});

describe("产物 tsconfig 允许导入 .js 脚本模块", () => {
  for (const framework of ["react", "vue", "angular"] as const) {
    test(`${framework}: tsconfig.json 含 allowJs（页面 import scripts/*.js 不再 TS2307）`, () => {
      const files = generateProjectScaffold(testScene, framework);
      const tsconfig = JSON.parse(read(files, "tsconfig.json"));
      expect(tsconfig.compilerOptions.allowJs).toBe(true);
      // 页面确实 import 了无扩展名 .js 模块 → allowJs 是必需的
      const page = files.find((f) => f.path.startsWith("src/pages/"));
      if (page) {
        expect(page.content).toMatch(/import \{ init\w+ \} from '[^']*scripts\/[^']+'/);
      }
    });
  }
});

function read(files: ProjectFile[], p: string): string {
  const f = files.find((x) => x.path === p);
  if (!f) throw new Error(`产物缺少 ${p}`);
  return f.content;
}
