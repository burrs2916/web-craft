import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useEditorStore } from "../../store/editorStore";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { resolveFieldStyle, POPUP_RADIUS_CSS } from "../data/fieldStyle";
import { fieldScaleFactor } from "../data/scaleFit";
import { validateFieldValue } from "../data/fieldValidate";
import { readAuthEnabled } from "../data/authMode";
import {
  parseCascaderStaticOptions,
  parseCascaderApiOptions,
  parseCascaderValue,
  findCascaderPath,
  cascaderDisplay,
  cascaderSubmitValue,
  type CascaderOption,
  type CascaderSubmitMode,
} from "../data/cascaderOptions";
import { withAlpha, contrastTextOn } from "../data/colorValue";
import { FieldShell } from "./fieldShell";

const EASE = "cubic-bezier(0, 0, 0.2, 1)";

/**
 * 弹出框选项行要区分四种状态：悬浮（鼠标）、已选（当前路径）、键盘光标（aria-activedescendant 指向）。
 *
 * 状态样式统一用**类规则**表达（与发布端 `.cas-active` / `.cas-cursor` 逐字同名、同一套选择器语义），
 * 而不是像旧实现那样把「当前该是什么色」在 JS 里算好、直接写进行的基础样式：
 *   1. 「已选」除换色外还要带一个对勾（不能只靠颜色区分，色觉障碍下必须有形状线索），
 *      「基础 + 状态」这层结构才装得下；
 *   2. 行的基础背景保持不声明（透明即默认），悬浮态才有干净的落点；
 *   3. 两端从此可用同一套选择器对照阅读，改一端即可照着改另一端。
 *
 * 动画名 `casIn` 必须与发布端 `.cas-panel-*` 的 `@keyframes casIn` 同名同参数（.12s 淡入 + 上移 4px）。
 */

/**
 * 级联选择（form-cascader）编辑区渲染器。
 *
 * 与发布端 `codegen/components/cascader.ts` **结构同构**：
 * 同一份字段外壳（FieldShell ↔ fieldShellHTML）、同一份样式口径（resolveFieldStyle）、
 * 同一份选项解析与取值派生（data/cascaderOptions.ts）。三者任一处改动都同时作用于两端。
 *
 * 相对旧实现修掉的三个结构性问题：
 * 1. 硬编码暗色（`#1e1e1e` 弹层 + `rgba(255,255,255,…)` 文字）→ 浅色主题下完全不可用；
 *    现全部由面板配置派生。
 * 2. 无标签/无校验/无帮助文字 → 与表单族其余控件视觉断裂；现走统一字段外壳。
 * 3. 无数据源能力 → 仅能写 JSON 文本；现支持静态 / 接口（认证 Token 可切换）/ 全局数据源绑定，
 *    与下拉选择完全同源。
 *
 * 弹层策略：与发布端一致，用**组件内绝对定位**（不用 Portal）。
 * 这样弹层与组件同层、随画布缩放同步放大（所见即所得），且发布端产物结构完全相同。
 * 需要画布包裹层不裁切——由 EditorCanvasComponent 的 overflow 白名单放行。
 */
export function CascaderRenderer({ config, mode, width, height, componentId }: ComponentRendererProps) {
  // 字段型「文字随框缩放」（与 date/time 同范式）：只乘字号、不碰几何；开关关闭 factor=1 零回归
  const fitF = fieldScaleFactor("form-cascader", width ?? 0, height ?? 0, config.scaleFit === true);
  const s0 = resolveFieldStyle(config);
  const s = { ...s0, fontSize: s0.fontSize * fitF, labelFontSize: s0.labelFontSize * fitF };
  const isEdit = mode !== "preview";
  const disabled = s.disabled || isEdit;
  // 无障碍 id：面板 / 选项。combobox + aria-activedescendant 模式（焦点恒在触发器上）
  const panelId = `cas-panel-${componentId ?? "c"}`;
  const optionId = (level: number, index: number) => `${panelId}-o-${level}-${index}`;

  const accentColor = String(config.accentColor ?? "#1976d2");
  const placeholder = String(config.placeholder ?? "请选择").trim();
  const showPath = config.showPath !== false;
  const separator = String(config.separator ?? " / ");
  const submitModeRaw = String(config.submitMode ?? "leaf");
  const submitMode: CascaderSubmitMode = (["leaf", "path", "labelPath"] as const).includes(
    submitModeRaw as CascaderSubmitMode,
  )
    ? (submitModeRaw as CascaderSubmitMode)
    : "leaf";
  const clearable = config.clearable === true && !disabled;

  // ── 数据源：与发布端同源（resolveEffectiveDataConfig 覆盖 → 再判定接口模式） ──
  const dataSources = useEditorStore((st) => st.dataSources);
  const dsId = String(config.dataSourceId ?? "");
  const boundSource = dsId ? dataSources.find((d) => d.id === dsId) : undefined;
  const effApi = resolveEffectiveDataConfig(config, boundSource);
  const dataMode = String(effApi.dataMode ?? "static");
  const isApi = dataMode === "api" && (dsId || String(effApi.apiUrl ?? "") || String(effApi.apiPath ?? ""));
  const apiValueField = String(effApi.apiValueField ?? "");
  const apiLabelField = String(effApi.apiLabelField ?? "");
  const apiChildrenField = String(effApi.apiChildrenField ?? "");
  const authEnabledCfg = readAuthEnabled(config.authEnabled);

  const { data: apiRaw } = useApiDataFetch({
    dataMode: isApi ? "api" : "static",
    apiUrl: String(effApi.apiUrl ?? ""),
    apiPath: String(effApi.apiPath ?? ""),
    apiMethod: String(effApi.apiMethod ?? "GET") as "GET" | "POST",
    apiBody: effApi.apiBody,
    apiHeaders: effApi.apiHeaders,
    apiInterval: Number(effApi.apiInterval ?? 0) || 0,
    apiDataPath: String(effApi.apiDataPath ?? ""),
    authEnabled: authEnabledCfg,
    dataSourceId: dsId,
  });

  const options: CascaderOption[] = useMemo(() => {
    if (!isApi) return parseCascaderStaticOptions(config.options);
    return parseCascaderApiOptions(apiRaw, {
      valueField: apiValueField,
      labelField: apiLabelField,
      childrenField: apiChildrenField,
    });
  }, [isApi, config.options, apiRaw, apiValueField, apiLabelField, apiChildrenField]);

  const values = useMemo(() => parseCascaderValue(config.value), [config.value]);

  const [selected, setSelected] = useState<string[]>(values);
  const [active, setActive] = useState<string[]>(values);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  // 键盘光标 [层级, 列内序号]：焦点恒留在触发器上，用 aria-activedescendant 指向它
  const [cursor, setCursor] = useState<[number, number]>([0, 0]);
  const rootRef = useRef<HTMLDivElement>(null);

  /** 打开面板的统一入口：复位光标到首列首项（与发布端 build() 前的 active/cur 复位一致） */
  const openPanel = () => {
    setActive(selected);
    setCursor([0, 0]);
    setOpen(true);
  };
  /** 关闭面板：复位光标（发布端 close() 同样复位 curL/curI） */
  const closePanel = () => {
    setOpen(false);
    setActive(selected);
    setCursor([0, 0]);
  };

  // 面板改「默认选中路径」时同步画布（与其余表单控件的受控同步约定一致）
  useEffect(() => {
    setSelected(values);
    setActive(values);
    setOpen(false);
    setCursor([0, 0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)]);

  // 接口数据到达后，已选路径若失效则清空（与发布端 __wcCasOpts 的回调语义一致）
  useEffect(() => {
    if (!isApi) return;
    if (selected.length && !findCascaderPath(options, selected).length) {
      setSelected([]);
      setActive([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, isApi]);

  // 点击组件外部关闭弹层
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const path = findCascaderPath(options, selected);
  const display = cascaderDisplay(path, showPath, separator);
  const submitValue = cascaderSubmitValue(path, submitMode, separator);

  const error = validateFieldValue(config, submitValue);
  const showError = !!error && (touched || submitValue !== "");

  /** 当前所有展开层级（0..active.length）的候选列表；与发布端 levelOptions 同构 */
  const levels = useMemo(() => {
    const out: CascaderOption[][] = [];
    for (let i = 0; i <= active.length; i++) {
      if (i === 0) {
        out.push(options);
        continue;
      }
      const p = findCascaderPath(options, active.slice(0, i));
      const last = p[p.length - 1];
      const kids = last?.children ?? [];
      if (!kids.length) break;
      out.push(kids);
    }
    return out;
  }, [options, active]);

  const pick = (level: number, opt: CascaderOption) => {
    const next = [...active.slice(0, level), opt.value];
    setActive(next);
    setTouched(true);
    if (!opt.children || opt.children.length === 0) {
      setSelected(next);
      setOpen(false);
      setCursor([0, 0]);
    } else {
      setCursor([level + 1, 0]);
    }
  };

  /**
   * 键盘导航（combobox + aria-activedescendant 模式，与发布端逐键对应）：
   * 焦点恒留在触发器上、光标在面板内移动 —— 选项不是可聚焦元素，故 roving 由 cursor 表达。
   * 键位：↓↑ 列内移动（环绕）、←→ 层级进出、Home/End 首末项、Enter/Space 选中、
   * Escape 关闭、Tab 关闭并放行。
   */
  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const k = e.key;
    if (!open) {
      if (k === "Enter" || k === " " || k === "ArrowDown") {
        e.preventDefault();
        openPanel();
      } else if (k === "Escape") {
        closePanel();
      }
      return;
    }
    if (k === "Escape") {
      e.preventDefault();
      closePanel();
      return;
    }
    if (k === "Tab") {
      closePanel();
      return;
    }
    const [curL, curI] = cursor;
    const col = levels[curL] ?? [];
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      if (!col.length) return;
      setCursor([curL, k === "ArrowDown" ? (curI + 1) % col.length : (curI - 1 + col.length) % col.length]);
      return;
    }
    if (k === "Home" || k === "End") {
      e.preventDefault();
      if (!col.length) return;
      setCursor([curL, k === "Home" ? 0 : col.length - 1]);
      return;
    }
    if (k === "ArrowRight") {
      e.preventDefault();
      const opt = col[curI];
      if (!opt?.children?.length) return;
      setActive([...active.slice(0, curL), opt.value]);
      setCursor([curL + 1, 0]);
      return;
    }
    if (k === "ArrowLeft") {
      e.preventDefault();
      if (curL <= 0) return;
      setCursor([curL - 1, 0]);
      return;
    }
    if (k === "Enter" || k === " ") {
      e.preventDefault();
      const opt = col[curI];
      if (!opt) return;
      pick(curL, opt);
    }
  };

  return (
    <Box ref={rootRef} sx={{ width: "100%", height: "100%", position: "relative" }}>
      <FieldShell s={s} focused={focused} hasValue={!!display} error={showError ? error : ""}>
        {/* 触发器：flex 撑满字段层，随拖动框缩放同步伸缩（与 input 系列几何语义一致） */}
        <Box
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-disabled={disabled}
          // combobox 的可读名称：标签 → 字段名 → 组件名（发布端同口径）
          aria-label={String(config.label ?? "").trim() || String(config.fieldName ?? "").trim() || "级联选择"}
          // 仅在展开时指向面板 / 光标项（发布端 build() 置、close() 移除，保持一致）
          aria-controls={open ? panelId : undefined}
          aria-activedescendant={open ? optionId(cursor[0], cursor[1]) : undefined}
          tabIndex={disabled ? -1 : 0}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setTouched(true);
          }}
          onClick={() => {
            if (disabled) return;
            if (open) closePanel();
            else openPanel();
          }}
          onKeyDown={onTriggerKeyDown}
          sx={{
            flex: "1 1 auto",
            minWidth: 0,
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "0 12px",
            backgroundColor: s.bgColor,
            color: s.textColor,
            borderRadius: s.radiusCss,
            fontSize: `${s.fontSize}px`,
            fontWeight: s.fontWeight,
            cursor: disabled ? "not-allowed" : "pointer",
            userSelect: "none",
            outline: "none",
            // 焦点可见：触发器可用键盘聚焦，必须有可见焦点环（发布端 #uid t:focus-visible 同款）
            "&:focus-visible": { outline: `2px solid ${accentColor}`, outlineOffset: "2px" },
          }}
        >
          <Box
            component="span"
            sx={{
              flex: "1 1 auto",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              opacity: display ? 1 : 0.5,
            }}
          >
            {display || placeholder}
          </Box>

          {clearable && (
            <Box
              component="span"
              role="button"
              aria-label="清空"
              onClick={(e) => {
                e.stopPropagation();
                setSelected([]);
                setActive([]);
                setTouched(true);
                setOpen(false);
              }}
              sx={{
                flexShrink: 0,
                display: display ? "flex" : "none",
                alignItems: "center",
                opacity: 0.55,
                "&:hover": { opacity: 0.9 },
              }}
            >
              <svg viewBox="0 0 24 24" width={14} height={14} style={{ display: "block", fill: "currentColor" }} aria-hidden="true">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </Box>
          )}

          <Box
            component="span"
            sx={{
              flexShrink: 0,
              display: "flex",
              opacity: 0.6,
              transform: `rotate(${open ? 180 : 0}deg)`,
              transition: `transform .2s ${EASE}`,
            }}
          >
            <svg viewBox="0 0 24 24" width={18} height={18} style={{ display: "block", fill: "currentColor" }} aria-hidden="true">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </Box>
        </Box>

        {/* 多级面板：绝对定位在触发器下沿（与发布端 .cas-panel-* 同构），随组件缩放 */}
        {open && (
          <Box
            id={panelId}
            role="listbox"
            aria-label={String(config.label ?? "").trim() || "级联选项"}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            sx={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: "4px",
              zIndex: 2147483000,
              display: "flex",
              backgroundColor: s.bgColor,
              border: `1px solid ${s.borderColor}`,
              // 弹层圆角与触发器解耦：钉在 MUI Menu 惯例值（触发器继续走 radiusCss 家族口径）
              borderRadius: POPUP_RADIUS_CSS,
              overflow: "hidden",
              boxShadow: "0 6px 24px rgba(0,0,0,.28)",
              boxSizing: "border-box",
              // 进场动效：与发布端 `@keyframes casIn` 同名同参数（.12s 淡入 + 上移 4px）
              "@keyframes casIn": { from: { opacity: 0, transform: "translateY(-4px)" } },
              animation: `casIn .12s ${EASE}`,
            }}
          >
            {/* 无选项时给一列空态，而不是渲染 0 列空框：
                空框在编辑区是 140px 宽的幽灵条、在发布端只有 2px（两端形态还不一致），
                而且键盘打开时用户会以为「按了没反应」。 */}
            {levels.length === 0 || levels[0].length === 0 ? (
              <Box
                sx={{
                  minWidth: "140px",
                  padding: "6px 12px",
                  color: withAlpha(s.textColor, 0.45),
                  fontSize: `${s.fontSize}px`,
                  whiteSpace: "nowrap",
                  cursor: "default",
                  userSelect: "none",
                }}
              >
                暂无数据
              </Box>
            ) : (
              levels.map((levelOptions, level) => (
                <Box
                  key={level}
                  sx={{
                    minWidth: "140px",
                    maxHeight: "220px",
                    overflowY: "auto",
                    // 细滚动条（与发布端 .cas-menu 同款）：系统默认滚动条在 Windows 上是粗灰条，破坏浮层观感
                    scrollbarWidth: "thin",
                    scrollbarColor: `${withAlpha(s.textColor, 0.25)} transparent`,
                    "&::-webkit-scrollbar": { width: "6px" },
                    "&::-webkit-scrollbar-thumb": {
                      backgroundColor: withAlpha(s.textColor, 0.25),
                      borderRadius: "3px",
                    },
                    "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
                    // 深层列：极浅底色 + 半透明分线，用来区分层级。
                    // 旧实现分线直接用 borderColor（与浮层自身边框同色），压根看不出哪层是哪层。
                    ...(level > 0
                      ? {
                          borderLeft: `1px solid ${withAlpha(s.borderColor, 0.6)}`,
                          backgroundColor: withAlpha(s.textColor, 0.04),
                        }
                      : {}),
                  }}
                >
                  {levelOptions.map((opt, index) => {
                    const isActive = active[level] === opt.value;
                    // 键盘光标：可在未选中的项上；与「已选」叠加时只加一圈焦点环、不改底色
                    const isCursor = cursor[0] === level && cursor[1] === index;
                    return (
                      <Box
                        key={opt.value + "_" + level}
                        id={optionId(level, index)}
                        role="option"
                        aria-selected={isActive}
                        // 状态类名与发布端 .cas-active / .cas-cursor 逐字同名，两端同一套机制
                        className={isActive ? "cas-active" : isCursor ? "cas-cursor" : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          pick(level, opt);
                        }}
                        onMouseEnter={() => {
                          // 悬浮展开下一级（发布端 it.onmouseenter 同语义；仅父级触发、同值不重建）
                          if (!opt.children?.length) return;
                          if (active[level] === opt.value) return;
                          setActive([...active.slice(0, level), opt.value]);
                        }}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "6px",
                          padding: "6px 12px",
                          cursor: "pointer",
                          fontSize: `${s.fontSize}px`,
                          // 基础前景色（非状态属性，静态）：状态规则里带 color 的会更精确地覆盖它
                          color: s.textColor,
                          whiteSpace: "nowrap",
                          userSelect: "none",
                          // ↓ 以下全是状态属性，统一由类规则给。
                          // 声明顺序即优先级（同特异性时后写的赢），不要重排。
                          // 旧实现把三种状态合并成同一种满色高亮：「已选」与「鼠标悬停」长得一模一样，
                          // 分不清「这是我选的值」还是「鼠标正好压在这」；浅色 accent 上的白字更只有 1.6:1。
                          "&:hover": { backgroundColor: withAlpha(accentColor, 0.1) },
                          "&.cas-cursor": {
                            backgroundColor: withAlpha(accentColor, 0.12),
                            outline: `2px solid ${accentColor}`,
                            outlineOffset: "-2px",
                          },
                          "&.cas-active": {
                            backgroundColor: accentColor,
                            color: contrastTextOn(accentColor),
                            fontWeight: 500,
                          },
                          // 已选同时是光标：底色不动，只把环换成与底色对比的颜色，否则环被底色吃掉
                          "&.cas-active.cas-cursor": {
                            outline: `2px solid ${contrastTextOn(accentColor)}`,
                            outlineOffset: "-2px",
                          },
                          // 对勾占位恒存在（只切 opacity），避免选中/未选中之间文字左右跳
                          "& .cas-chk": { opacity: 0 },
                          "&.cas-active .cas-chk": { opacity: 1 },
                        }}
                      >
                        <Box
                          component="span"
                          className="cas-chk"
                          sx={{ display: "flex", flexShrink: 0, width: "14px" }}
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 24 24" width={14} height={14} style={{ display: "block", fill: "currentColor" }}>
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        </Box>
                        <Box
                          component="span"
                          sx={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
                        >
                          {opt.label}
                        </Box>
                        {opt.children && opt.children.length > 0 && (
                          <Box component="span" sx={{ display: "flex", flexShrink: 0, opacity: 0.7 }} aria-hidden="true">
                            <svg viewBox="0 0 24 24" width={14} height={14} style={{ display: "block", fill: "currentColor" }}>
                              <path d="M10 17l5-5-5-5z" />
                            </svg>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              ))
            )}
          </Box>
        )}
      </FieldShell>
    </Box>
  );
}
