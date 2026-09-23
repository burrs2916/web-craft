# WebCraft Codegen 架构优化方案

> 目标：统筹编辑区组件组合与 codegen 生成逻辑，实现单一配置源、视图/图层与目录结构强关联、认证组合联动，使生成代码架构达到最优解。
> 状态：§3.1–§3.5 已落地（代码已实现，本文档曾标注"实施中"与实际不符）；§五 架构分层已落地
> 核验：2026-09-18 只读诊断确认全部改造已在 `src/codegen` 代码落地，详见各节 ✅ 标记与代码引用。

## 一、现状问题（审计结论）

### 1.1 双链路各自为政
- **engine.ts**（预览 / static-html / CDN）：每视图一个 HTML，支持多图层分组渲染，`generateGlobalConfigScript` 注入 `__WC_*` 全局到 `<head>`。
- **scaffold/**（发布工程 React/Vue/Angular）：生成完整工程（pages/、scripts/、路由等），页面脚本为 `src/scripts/{events|data|page-scripts}-{fileName}.js`。

### 1.2 双源配置（核心问题）
- 数据层运行时（`scaffold/data.ts`）：读 `window.__WC_API_BASE / __WC_AUTH_ENABLED / __WC_TOKEN_*`，未注入时回退内联默认值。✅ 已统一协议。
- 认证层（`components/auth.ts` 8 个 codegen）：**硬编码组件 config**——`TOKEN_STORAGE = "localStorage"` 内联进生成脚本，不读 `__WC_*` 全局，导致：
  - 认证组合（Login / AuthGuard / Logout / UserProfile / ApiKey / OAuth / SSO / Register）各自持有独立 token 配置，无法联动统筹；
  - scene.apiConfig 全局认证配置对认证组件无效。
  - ⚠️ 上述为历史现状，已于 §3.2 修正：`components/auth.ts` 8 类认证组件已全部改为 `var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || "localStorage"` 形式读取全局、组件 config 仅作兜底，grep 全文件零硬编码。
- `generateGlobalConfigScript` 仅在 `scene.apiConfig` 存在时注入，且只扫描第一个 `auth-login-form` 提取 token 配置；**scaffold 三框架发布工程完全不注入 `__WC_*`**（grep 确认 0 处）。

### 1.3 共享交互脚本跨页面重复
- navbar / sidebar / tabs / pane / anchor / modal / drawer 的交互脚本均带 `__wc*Init` 防重标记，但各页面脚本各自全量携带（如 page-1 脚本 1952 行），跨页面重复生成同一段逻辑。

### 1.4 视图/图层 ↔ 目录关联现状
- 视图 → `src/pages/*.tsx`（单图层单文件）；多图层 → `src/pages/{Page}/layers/{Layer}.tsx` ✅
- 脚本 → `src/scripts/{events|data|page-scripts}-{fileName}.js`（fileName 关联视图）✅
- 缺口：页面文件内无视图/图层/文件映射注释；README 目录结构未覆盖 scripts/；共享脚本无独立模块。

## 二、目标架构

```
SceneDSL (views / layers / components / apiConfig / globalComponents)
   │
   ├─ engine.ts ────────── static-html / 预览（每视图一 HTML）
   │     └─ 注入 __WC_*（复用共享 generateGlobalConfigScript）
   │
   └─ scaffold/ ────────── 发布工程（React/Vue/Angular）
         ├─ 全局配置：index.html head 注入 __WC_*（单一配置源）
         ├─ pages/{View}.tsx        ← 视图（注释内带视图/图层映射）
         │    └─ layers/{Layer}.tsx ← 图层（多图层时）
         ├─ scripts/shared-ui.js    ← 公共交互脚本（__wc*Init 防重，全站一份）
         └─ scripts/{events|data|page-scripts}-{view}.js ← 视图特有逻辑
```

### 核心原则
1. **单一配置源**：认证/数据组件运行时统一读 `window.__WC_*`，组件 config 仅作为编辑期默认值兜底。
2. **组合统筹**：认证组合内 token 配置以"显式配置优先、login-form 为权威源"，注入全局后全组联动。
3. **目录可追溯**：任一视图/图层/组件均可从生成代码目录结构反查。
4. **保持既有约定**：三层字段一致、ECharts batch/stream/realtime 旧语义、认证 fetch 不迁移 useApiDataFetch、不破坏现有测试断言路径。

## 三、改造清单

### 3.1 共享全局配置生成（新建 `scaffold/globalConfig.ts`）
- 将 engine 的 `generateGlobalConfigScript` 提为共享函数（导出）；
- 增强认证扫描：扫描视图 + 全局组件中**所有认证组件**，按优先级提取 token 配置：
  - 显式配置优先（组件 config 中设置了非默认 tokenStorage/tokenKey 的），排序最高的为权威；
  - 无显式配置时以 `auth-login-form` 为权威源；仍无则默认值；
- 任一认证组件或 `apiConfig` 存在即注入（不依赖 apiConfig 之有无单独判断 auth）。

### 3.2 认证组件统一读全局（改 `components/auth.ts`）
- 8 个 codegen 生成脚本中 token 相关变量改形式：
  `var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || "localStorage";`
  `var TOKEN_KEY = window.__WC_TOKEN_KEY || "auth_token";`
  `var TOKEN_HEADER = window.__WC_TOKEN_HEADER || "Authorization";`
  `var TOKEN_PREFIX = window.__WC_TOKEN_PREFIX !== undefined ? window.__WC_TOKEN_PREFIX : "Bearer ";`
- 未注入全局（老场景/单组件预览）时回退内联默认，向后兼容。

### 3.3 scaffold 三框架注入全局配置
- react.ts / vue.ts / angular.ts：`index.html` head 注入 `generateGlobalConfigScript(scene, 全量组件)` 产物；
- main 入口（main.tsx / main.ts / main.ts）无需改动（head script 先于业务脚本执行）。

### 3.4 公共交互脚本抽取（改 scaffold/utils.ts + 三框架）
- 新增 `extractSharedScripts(scripts)`: 识别含 `__wc[A-Z]\w*Init` 标记的共享交互脚本，去重后单独成 `src/scripts/shared-ui.js`；
- 页面 `page-scripts-{fileName}.js` 仅保留视图特有/组件特有脚本（事件、数据、auth 等）；
- 页面组件 useEffect 顺序：`initSharedUI()` → `initPageScripts()` → `initEvents()` → `initDataLayer()`（shared 先于页面）。

### 3.5 目录结构与注释增强 ✅ 已落地
- 页面文件头部注释生成"视图/图层/脚本映射"（视图 id、图层清单、对应 layers/ 与 scripts/ 文件）；
- README 目录结构补全 `scripts/`（shared-ui.js + events/data/page-scripts）与"视图→文件"映射表。

## 四、兼容性保障
- 测试断言路径保持：`src/pages/Home.tsx`、`src/scripts/events-home.js`、`src/scripts/data-home.js` 不变；
- 单图层单文件、多图层目录化均保留（不强制单图层也拆 layers/ 目录，避免破坏既有断言与产物形态）；
- ECharts 27 类型共用运行时不变；`__WC_*` 8 个全局变量名与既有约定不变；
- 产物验收：tsc --noEmit + vite build 零错误 + vitest 全绿（既有 58 用例）+ 新增认证全局配置断言。

## 五、前后端分离 + 分层映射（已落地）

> 在既有优化之上，进一步统一四种发布模板（React / Vue / Angular / static-html）的架构分层，
> 让生成产物严格遵循"CSS / JS / HTML 分离 + 前后端分离 + 主流设计模式"，并与编辑器四大工具建立显式映射。

### 5.1 编辑器四大工具 ↔ 生成结构映射

| 编辑器 | React / Vue | Angular | static-html |
| --- | --- | --- | --- |
| 画布 Canvas | `styles/global.css` + `.env` | `src/styles.css` + `.env` | `assets/css/style.css` |
| 视图 View | `pages/*.tsx/.vue` + `styles/pages/*.css` | `*.component.ts` + `*.component.css` | `*.html` + `assets/css/pages/*.css` |
| 图层 Layer | `pages/{P}/layers/*`（样式收敛到页面 CSS） | `layers/*.ts`（样式交 component.css） | `<div class="layer-*">`（样式交页面 CSS） |
| 组件 Component | 组件 HTML + `scripts/*` + `api/*` | 组件 HTML + `scripts/*` + `api/*` | 组件 HTML + 内联脚本 + `assets/js/http.js` |

### 5.2 前后端分离（Facade + 拦截器）
- **新增共享 `scaffold/shared/apiClient.ts`**：
  - `buildEnvContent()` → `.env`（仅 Vite 模板 React/Vue：`VITE_API_BASE_URL` / 鉴权头配置）；
  - `buildAngularEnvironmentContent()` → `src/environments/environment.ts`（Angular CLI 不读 .env，走标准 environments 模式）；
  - `buildHttpClientSource(ts|js, variant)` → `src/api/http.ts`：fetch 封装 + 拦截器（相对路径拼 base、自动注入 `Authorization`、JSON 序列化、统一错误），暴露 `window.__wc_http`；variant=vite 读 `import.meta.env`（`as any` 断言避免依赖 vite/client 类型），variant=angular-env 读 environment.ts；
  - `buildApiIndexSource()` → `src/api/index.ts`：类型化业务接口入口（`userApi` 等）；
  - `buildStaticHttpClientSource()` → 静态站专用 IIFE 版 `assets/js/http.js`。
- React / Vue 产出 `.env` + `src/api/`；Angular 产出 `src/environments/environment.ts` + `src/api/`；static-html 产出 `assets/js/http.js`。
- 数据层 / 事件层已通过共享运行时助手 `__wc_getToken` / `__wc_buildUrl` 实现同类拦截行为，保持向后兼容。

### 5.2.1 逻辑审查修复（2026-09-17 全量审计）
1. **base 拼接自相矛盾（P0）**：http.ts `resolveUrl` 曾豁免 `/api/` 前缀，而 api/index.ts 生成的路径全是 `/api/*` → `VITE_API_BASE_URL` 对业务接口永不生效；且与事件 callApi、数据 `__wc_buildUrl`（只豁免绝对 URL）行为不一致。已统一为"仅绝对 URL 豁免"。
2. **Angular 产物无法编译（P0）**：曾生成 `.env`（Angular CLI 不读）且 http.ts 依赖 `import.meta.env`（无 vite/client 类型，`ng build` TS2339）。已改为标准 `src/environments/environment.ts` + import environment。
3. **React 单图层无 CSS 分离（P0）**：单图层页面仍内联 `pageStyle` + `<style dangerouslySetInnerHTML>` 注入组件样式。已抽到 `src/styles/pages/{Page}.css` 并 import。
4. **多图层 componentStyles 丢失（P1）**：React/Vue/Angular 多图层分支的页面 CSS 未包含 `body.styles`（accordion 等组件样式丢失；Angular 为改造回归）。四模板已统一补齐；React 多图层页面同步去除重复内联 pageStyle。
5. **.env token 变量死配置（P2）**：`VITE_API_TOKEN_HEADER/PREFIX、VITE_AUTH_STORAGE/TOKEN_KEY` 曾生成但从未被读取。已接入 http 客户端配置解析链（构建期 env → 运行期 window.__WC_* → 默认值）。

### 5.2.2 产物级审查修复（2026-09-17 第二轮：产物可用性）
1. **产物 tsc strict 编译失败（P0）**：生成的 `src/api/http.ts` 函数全无类型注解（TS7006 implicit any ×11+）、`credentials` 字面量类型不匹配（TS2769）、`__webcraft_memory_cache` 未声明（TS2339），`npm run build`（tsc && vite build）直接失败。已全函数类型化（ReqOptions/HttpResponse 真正投入使用），`api/index.ts` 同步补 `id: string | number` / `data: unknown`。
2. **tsconfig 缺 allowJs（P0）**：页面 `import { initEvents } from '../scripts/events-*.js'` 而三框架 tsconfig 均未开 `allowJs` → TS2307 找不到模块。已给 react/vue/angular tsconfig 加 `"allowJs": true`。
3. **表单校验正则被模板字符串吞转义（P0，预览同样中招）**：form.ts 以模板字符串注入 WCFORM_SUBMIT 脚本，源码中 `\s` `\d` `\.` 为无效转义 → 运行时变 `[^s@]`、`d{9}`，邮箱放行垃圾值、手机号永远校验失败。已改为 `\\s` `\\d` `\\.`（影响预览与全部模板产物）。
4. **表单空 URL 提交（P1）**：`o.url` 为空时 fetch('') 打到当前页。已加 `if(!o.url)` 拦截 + 明确提示。
5. **新增产物级冒烟测试**（`__test__/outputSmoke.test.ts`）：生成 http.ts/index.ts/environment.ts 写临时目录后用真实 `tsc --strict --noEmit` 校验零错误；tsconfig allowJs 断言；form-container 测试补正则转义与空 URL 断言。堵住"生成器自身全绿、产物挂掉"的测试盲区。

### 5.3 CSS / JS / HTML 严格分离（四模板统一）
- 页面画布样式、图层定位/透明度样式、组件样式统一抽离到独立样式文件：
  - React / Vue → `src/styles/pages/{Page}.css`（页面组件 import，不再内联 `pageStyle` / `<style scoped>`）；
  - Angular → `*.component.css`（`styleUrls` 引入，不再内联 `styles: [...]`）；
  - static-html → `assets/css/pages/{fileName}.css`（`<link>` 引入，移除页面 div 内联 style 与内联 `<style>`）。
- 共享 `scaffold/shared/webstyles.ts` 提供 `buildPageCSS` / `buildLayerCSS` / `buildGlobalCSSTokens`，保证四模板样式结构一致。

### 5.4 设计模式小结
- **Facade + 拦截器**：统一 http 客户端收敛鉴权/错误/响应抽取，业务层面向 `src/api/index.ts` 服务函数；
- **各框架惯用范式**：Vue SFC + `<script setup>`、Angular 组件 `styleUrls` + DI、React Hooks + 路由分层；
- **12-Factor 环境配置**：`.env` 独立于代码。

### 5.5 落地与验证
- 四个模板 README 各增"架构（前后端分离 · 分层映射）"章节，含上述映射表与设计模式说明；
- `scaffold.test.ts` 新增 2 组用例：① 四模板统一接入 env/api/http；② 单图层/多图层样式抽离与页面 CSS 断言；
- 验收：`tsc --noEmit` 零错误，vitest 全绿（225 用例）。