/**
 * 「随拖动框等比缩放」的**唯一取值口径** —— 编辑区渲染器与发布端 codegen 共用。
 *
 * 背景：部分组件的内容有固定的自然尺寸（评分星条、图标、装饰形状、徽标…），
 * 既不该被拉伸变形，也不该在框变大变小时纹丝不动。既定做法是：以「设计基准尺寸」
 * 为 factor=1 的参照，取宽高两个方向的较小比例做等比缩放，并夹在 [min,max] 之间
 * 防止极端尺寸下失真或不可见。
 *
 * 为什么必须收口：编辑区曾用这套公式、发布端却完全不做缩放 —— 同一份配置在画布上
 * 会随框放大、发布后却固定不变，"所见即所得"当场失效。两端现在只读本文件。
 */

import { type CssDecls, alignToFlex, vAlignToFlex } from "./cssDecls";

export interface ScaleFitSpec {
  /** 设计基准宽（此尺寸下 factor=1） */
  refW: number;
  /** 设计基准高 */
  refH: number;
  /** 缩放下限（防止框很小时内容消失） */
  min: number;
  /** 缩放上限（防止框很大时内容糊掉） */
  max: number;
}

/**
 * 由容器实际尺寸算等比缩放系数。
 * 容器尺寸未测得（0/NaN）时返回 1（按自然尺寸渲染，不缩不胀）。
 */
export function fitFactor(width: number, height: number, spec: ScaleFitSpec): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const f = Math.min(width / spec.refW, height / spec.refH);
  if (!Number.isFinite(f)) return 1;
  return Math.min(Math.max(f, spec.min), spec.max);
}

/**
 * 评分（form-rate）：设计基准 220×40 = 注册表 `defaultSize`，夹在 0.4~6 倍。
 *
 * 修正记录：此值原为 126×30（星条自然宽 × 图标高），与注册表 defaultSize 220×40 不符，
 * 于是「拖进来即 1 倍」这条全族不变式在评分上失效——默认框里星条被放大到 1.33 倍
 * （`min(220/126, 40/30)`），而标签/复选框/单选/开关/分段/按钮在默认框里都是 1 倍。
 * 现有 220×40 后与 `form-group-scale.test.ts` 的 refW/refH 契约一致。
 */
export const RATE_FIT: ScaleFitSpec = { refW: 220, refH: 40, min: 0.4, max: 6 };

/* ──────────────────────────────────────────────
 * 表单组件组的等比缩放基准（refW/refH 恒等于注册表的 defaultSize，勿另写一份）
 *
 * 判定标准：只有「内容有自然尺寸」的控件才该等比缩放——标签、复选框、单选组、
 * 开关、分段控制器。字段型（input/textarea/select/date/time/number/file）的内容
 * 本来就是「铺满拖动框」，铺满即已满足「随框放大缩小」，再叠一层 transform 反而
 * 会让边框环与字段层脱开，属于视觉回归，故刻意不给它们 scaleFit。
 * ────────────────────────────────────────────── */

/**
 * 表单标签（form-label）：设计基准 32×22（与注册表 defaultSize 同步；拖入即 1 倍）。
 *
 * 基准不再取"宽松容器 72×24"，而是尽量贴合默认文案「标签」（14px·MUI 字体栈下约 28×20）
 * 再加 2px 余量 → 拖入即 1 倍且拖动框紧贴文字，不再有 22px 的居中留白，布局定位更精准。
 * 想让文字离框更远时，调大拖动框或加 `paddingX/paddingY`（外观层）即可，而非靠默认大框撑开。
 */
export const LABEL_FIT: ScaleFitSpec = { refW: 32, refH: 22, min: 0.5, max: 8 };
/**
 * 复选框（form-checkbox）：设计基准 200×42。
 *
 * refH 必须 ≥ 内容自然高（图标盒 42px，见渲染器的 `boxSize` 档位）：
 * 若照抄 32 会让「默认框装不下自己的内容」——内层 42px 溢出 32px 的框 5px 上下。
 * 修正后默认框内 factor=1 且恰好装下；小于基准的框则按比例缩到装下为止。
 * 同步：注册表 `defaultSize.height` 亦为 42（本文件的 refW/refH 恒等于 defaultSize）。
 */
export const CHECKBOX_FIT: ScaleFitSpec = { refW: 200, refH: 42, min: 0.5, max: 6 };
/** 单选组（form-radio）：设计基准 280×100 */
export const RADIO_FIT: ScaleFitSpec = { refW: 280, refH: 100, min: 0.4, max: 6 };
/** 开关（form-switch）：设计基准 200×40 */
export const SWITCH_FIT: ScaleFitSpec = { refW: 200, refH: 40, min: 0.5, max: 6 };
/** 分段控制器（form-segmented）：设计基准 320×44 */
export const SEGMENTED_FIT: ScaleFitSpec = { refW: 320, refH: 44, min: 0.4, max: 6 };

/**
 * 进度条（progress）圆形：设计基准 = 实际 `circleSize`（默认 80），夹 0.25~2。
 *
 * 与表单族 `LABEL_FIT` 同一来由，但圆形的「自然尺寸」不是常量——它随 `circleSize`
 * 配置变，故这里给一个**由配置算出的 spec 构造器**。编辑区 `ProgressRenderer` 与发布端
 * `progress.ts` 都读它，保证「圆形随拖动框等比缩放」两端逐值同源：此前只有编辑区用
 * ResizeObserver 缩放，发布端写死固定圆，框非 80×80 时两端明显不一致（所见≠所得）。
 */
export function progressCircleFit(circleSize: number): ScaleFitSpec {
  return { refW: circleSize, refH: circleSize, min: 0.25, max: 2 };
}

/* ──────────────────────────────────────────────
 * 字段型控件的「排版密度」缩放（第 11 轮新增，与上面的 transform 缩放是**两种机制**）
 *
 * 背景：字段型（input/textarea/select/date/time/number/file）按设计铺满拖动框，
 * 框放大后字号纹丝不动——在 4K 大屏上会出现「框很大、字很小」的失调。
 * `scaleFit` 开关（默认关）打开后：字号（含派生的图标宽、行高）按
 * 「框相对注册表 defaultSize 的倍率」等比缩放，factor 在**编译期**算出
 * （字段型没有缩放骨架、没有运行时量测脚本，编辑区读 props width/height，
 * 发布端读 transform.width/height，两者同源）。
 *
 * 为什么不给它们 transform 缩放骨架：字段层与边框环必须严格重合，
 * 叠一层 transform 会让两者脱开（历史结论，见 form-group-scale.test.ts）；
 * 只乘字号则完全不碰几何。
 * ────────────────────────────────────────────── */

/** 字段型控件的缩放基准表：refW/refH 恒等于注册表 defaultSize（守卫测试锁死，勿另写） */
export const FIELD_FITS: Record<string, ScaleFitSpec> = {
  "form-input": { refW: 280, refH: 56, min: 0.5, max: 4 },
  "form-textarea": { refW: 280, refH: 120, min: 0.5, max: 4 },
  "form-select": { refW: 280, refH: 56, min: 0.5, max: 4 },
  "form-date": { refW: 280, refH: 56, min: 0.5, max: 4 },
  "form-time": { refW: 280, refH: 56, min: 0.5, max: 4 },
  "form-number": { refW: 200, refH: 56, min: 0.5, max: 4 },
  "form-file": { refW: 280, refH: 96, min: 0.5, max: 4 },
  // 滑块（第 12 轮纳入）：同为字段型（铺满框、无 transform 骨架），只乘 fontSize/labelFontSize
  "form-slider": { refW: 280, refH: 56, min: 0.5, max: 4 },
  // 级联选择（第 28 轮纳入）：字段型（触发器铺满字段层、弹层随框缩放），只乘字号
  "form-cascader": { refW: 280, refH: 56, min: 0.5, max: 4 },
};

/**
 * 字段型控件的编译期缩放系数。
 *
 * @param type     组件类型（查 FIELD_FITS）
 * @param width    容器宽（编辑区 = props.width，发布端 = transform.width）
 * @param height   容器高
 * @param enabled  面板开关（config.scaleFit === true）
 * @returns 开关关闭 / 未知类型 / 尺寸未测得时恒为 1（零回归）
 */
export function fieldScaleFactor(type: string, width: number, height: number, enabled: boolean): number {
  if (!enabled) return 1;
  const spec = FIELD_FITS[type];
  if (!spec) return 1;
  return fitFactor(width, height, spec);
}

/* ──────────────────────────────────────────────
 * 缩放骨架的**声明口径**（编辑区 sx 与发布端 style 属性读同一份）
 *
 * 这两层的字面量曾只写在发布端 `codegen/scaleFit.ts` 的字符串里，编辑区各组件
 * 自己另写一份，于是「编辑区的舞台/内层」与「发布端的舞台/内层」慢慢分叉
 * （flex:1 1 auto vs width:100%、有没有 min-width:0 …）。现在两边都从这里取。
 * ────────────────────────────────────────────── */

/** 面板水平对齐值（缩放舞台用） */
export type StageAlign = "left" | "center" | "right";
/** 面板垂直对齐值（缩放舞台用） */
export type StageVAlign = "top" | "center" | "bottom";

/**
 * 缩放舞台的**默认**摆放 —— 自然尺寸内容在拖动框内的默认位置，只此一份。
 *
 * 为什么是 center：本仓库已完成组件的既定观感就是"内容在拖动框内居中"——
 * 基础组 `text` 的 `textAlign` 默认 center，图标组 `icon` 的 `align` 默认 center，
 * 表格组 `pagination`、布局组 `divider` 同理。表单组此前各自硬编码 `?? "left"`，
 * 同一份需求在四个组件里写了四遍，且与本仓库观感相反；收口到此常量后
 * 面板 defaultConfig、编辑区渲染器、发布端 codegen 三处只读同一个值。
 */
export const STAGE_ALIGN_DEFAULT = "center";
/** 缩放舞台的默认垂直摆放（历史上一直是 center，此处只是把字面量收口） */
export const STAGE_VALIGN_DEFAULT = "center";

/**
 * 面板配置 → 缩放舞台的水平摆放的**唯一取值口径**。
 *
 * 为什么需要这个函数：`STAGE_ALIGN_DEFAULT` 收口之后，仍然出现"发布端读常量、编辑区
 * 渲染器各写一份 `?? "left"`"的分叉 —— switch / checkbox / radio 三个组件在配置里
 * **没有 `align` 键**（老场景、或面板值被清空）时，画布靠左、发布端居中，同一份数据
 * 两种观感。根因不是常量没定，而是"回退"这一步被写了两遍：两端各自对 `align` 求值。
 * 现在两端只调本函数，"默认摆放是什么"这件事在仓库里只有一个答案。
 *
 * 注意：`align` 显式给了非法值时不会回退到默认（原样交给 `alignToFlex` 兜底成
 * flex-start），以保证历史行为不静默改变。
 */
export function stageAlignOf(config: Record<string, unknown>): string {
  return String(config.align ?? STAGE_ALIGN_DEFAULT);
}

/** 面板配置 → 缩放舞台的垂直摆放（口径同上） */
export function stageVAlignOf(config: Record<string, unknown>): string {
  return String(config.vAlign ?? STAGE_VALIGN_DEFAULT);
}

/**
 * 缩放舞台：铺满 + 按 align/vAlign 摆放（发布端脚本读它的 clientWidth/clientHeight 算系数）。
 *
 * 两个参数都不传时即「居中显示」——因此 icon / rate / pagination 等既有调用方
 * 只要显式传了自己的面板值，行为与历史逐字一致，无回归。
 */
export function scaleStageCss(
  align: string = STAGE_ALIGN_DEFAULT,
  vAlign: string = STAGE_VALIGN_DEFAULT,
): CssDecls {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: vAlignToFlex(vAlign),
    justifyContent: alignToFlex(align),
    minWidth: "0",
    minHeight: "0",
  };
}

/**
 * 缩放内层的**公共**声明（自然尺寸、尺寸不随缩放改变）。
 * 组件自己的内层声明（display/方向/间距）在发布端由 `innerStyle` 追加、在编辑区由 sx 展开，
 * 顺序恒为「本函数在前、组件声明在后」，两端一致。
 */
export function scaleInnerBaseCss(): CssDecls {
  return {
    transformOrigin: "center center",
    flexShrink: "0",
  };
}
