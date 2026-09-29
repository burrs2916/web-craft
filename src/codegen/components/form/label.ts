import { readAuthEnabled } from "../../../editor/data/authMode";
import { cssText } from "../../../editor/data/cssDecls";
import { labelInnerCss, labelTextCss, resolveLabelStyle } from "../../../editor/data/labelStyle";
import { LABEL_FIT } from "../../../editor/data/scaleFit";
import { resolveEffectiveDataConfig } from "../../../shared/resolveDataConfig";
import { dataLoaderScript } from "../../dataLoader";
import { escapeHTML } from "../../layout";
import { SCALE_OUTER_CSS, scaleSkeleton, scaleSkeletonScript } from "../../shared/scaleSkeleton";
import type { ComponentCodegenFn } from "../../types";



/**
 * form-label 组件 → HTML
 *
 * 样式取值全部来自 `resolveLabelStyle`（与编辑区 FormLabelRenderer 同一份口径），
 * 含默认行高 1.4375（MUI FormLabel 约定）、字间距（0 则不输出）、星号色、垂直摆放。
 * - 刻意**不输出 `text-align`**：外层是 flex 容器，只有 `justify-content` 生效，前者是噪音。
 * - 刻意用 `<span>` 而非 `<label>`：本组件没有 `for` 也没有可关联的表单后代，
 *   用 `<label>` 会违反 HTML 规范并让辅助技术误判"标注了某个控件"。
 *   （radio 的组标签必须用 `<label>` 是因为校验运行时要 `querySelector('label')` 变色，
 *    本组件不参与校验，没有该需求。）
 * - 本轮起输出「外形 → 缩放舞台 → 缩放内层」三层（`scaleSkeleton`）：舞台按 align/vAlign
 *   摆放自然尺寸内容并供脚本量取尺寸，内层只被 transform 缩放 → 编辑区与发布页的
 *   「居中 + 随框等比缩放」由同一份 `fitFactor`/`LABEL_FIT` 决定。
 */
/**
 * form-label 组件 → HTML
 *
 * 结构（与编辑区渲染器逐层同构）：
 *   外形 outer（100%×100%·字体栈） → 缩放舞台 stage（按 align/vAlign 摆放）
 *     → 缩放内层 inner（内容自然尺寸 + **外观层**：底色/内边距/圆角/不透明度）
 *       → 文字 span（排版声明）→ 文字节点 span + 可选后缀 + 可选必填星号
 *
 * 三条口径都只读 `editor/data/labelStyle.ts`（`resolveLabelStyle` / `labelTextCss` /
 * `labelInnerCss`），编辑区展开的是同一份对象，产物里不再出现本文件自己写的样式字面量。
 *
 * **外观层刻意挂在内层**：只有被 `transform: scale()` 缩放的那一层，底色与内边距才会
 * 跟着拖动框一起等比放大缩小；挂到 outer 上就会出现「框变大、标签底色纹丝不动」。
 *
 * 动态文案：`dataMode=api`（或绑定全局数据源）时由统一取数骨架 `dataLoaderScript` 拉取，
 * 按 `apiTextField` 从响应取文字后写进文字节点。首屏先输出静态文案占位、数据到达再替换，
 * 与编辑区「数据未到达显示静态文案」一致。`authEnabled` 三态即认证/非认证接入的切换点。
 */
export const formLabelCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config as Record<string, unknown>;
  const s = resolveLabelStyle(c);
  const scaleFit = c.scaleFit !== false;
  const uid = "flb-" + Math.random().toString(36).slice(2, 9);

  // ── 数据源：绑定全局源时以全局源覆盖组件自带取数配置（与编辑端同一函数） ──
  const dsId = String(c.dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c, boundSource) as Record<string, unknown>)
    : c;
  const isApi = String(eff.dataMode ?? "static") === "api" && Boolean(dsId || eff.apiUrl || eff.apiPath);
  const authEnabled =
    readAuthEnabled(eff.authEnabled);

  const spanStyles = cssText(labelTextCss(s));
  const reqStar = s.required
    ? `<span style="color:${s.errorColor};margin-left:2px">*</span>`
    : "";
  const suffixHTML = s.suffix ? `<span>${escapeHTML(s.suffix)}</span>` : "";
  // 文字节点单独包一层：接口数据到达时只替换这一层的 textContent（不会连带抹掉后缀与星号），
  // 且 textContent 赋值天然免疫注入，不需要转义。静态与接口两种模式结构完全一致。
  const control =
    `<span style="${spanStyles}">` +
    `<span id="${uid}v">${escapeHTML(s.text)}</span>` +
    suffixHTML +
    reqStar +
    `</span>`;

  const apiScript = isApi
    ? dataLoaderScript({
        container: `var el=document.getElementById('${uid}');`,
        apiUrl: String(eff.apiUrl ?? ""),
        apiPath: String(eff.apiPath ?? ""),
        apiMethod: String(eff.apiMethod ?? "GET"),
        apiHeaders:
          typeof eff.apiHeaders === "string" ? eff.apiHeaders : JSON.stringify(eff.apiHeaders ?? {}),
        apiBody: typeof eff.apiBody === "string" ? eff.apiBody : JSON.stringify(eff.apiBody ?? {}),
        apiInterval: Number(eff.apiInterval ?? 0) || 0,
        apiDataPath: String(eff.apiDataPath ?? ""),
        authEnabled,
        renderBody: [
          `var f=${JSON.stringify(String(eff.apiTextField ?? c.apiTextField ?? ""))};`,
          `var keys=f?[f]:['text','label','name','value','title'];`,
          `var out='';`,
          `if(typeof data==='string'||typeof data==='number'||typeof data==='boolean'){out=String(data);}`,
          `else if(data&&typeof data==='object'){`,
          `  for(var i=0;i<keys.length;i++){`,
          `    var x=keys[i].split('.').reduce(function(a,k){return a==null?undefined:a[k];},data);`,
          `    if(x!==undefined&&x!==null&&x!==''){out=String(x);break;}`,
          `  }`,
          `}`,
          // 取不到值就保留首屏的静态文案占位，而不是把标签清空
          `var v=document.getElementById('${uid}v');if(v&&out)v.textContent=out;`,
        ].join("\n"),
      })
    : "";

  return (
    `<div id="${uid}" style="${SCALE_OUTER_CSS}">` +
    scaleSkeleton({
      uid,
      control,
      spec: LABEL_FIT,
      align: s.align,
      vAlign: s.vAlign,
      // 自然尺寸盒：宽度由内容决定（换行会让缩放基准随框宽漂移）+ 外观层
      innerStyle: cssText(labelInnerCss(s)),
      scaleFit,
    }) +
    `</div>` +
    scaleSkeletonScript(uid, LABEL_FIT, scaleFit) +
    apiScript
  );
};
