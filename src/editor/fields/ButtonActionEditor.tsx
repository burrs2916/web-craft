import { useState, useMemo, Fragment, useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import AddIcon from "@mui/icons-material/Add";
import BoltIcon from "@mui/icons-material/Bolt";
import { useEditorStore } from "../../store/editorStore";
import { useSceneStore } from "../../store/sceneStore";
import type { EventBinding } from "../../types/editor";
import { BUILTIN_ACTIONS, type ActionInfo, type ParamField } from "../utils/eventActionRegistry";
import { EventBindingListItem } from "../panels/EventBindingListItem";
import { EventBindingEditor } from "../panels/EventBindingEditor";

/** 可在属性面板内"一键式"快捷配置、不依赖目标组件的动作 */
const QUICK_ACTION_NAMES = [
  "navigate",
  "navigateToScene",
  "openDialog",
  "callApi",
  "playSound",
  "setVariable",
  "switchView",
];

const QUICK_ACTIONS: ActionInfo[] = BUILTIN_ACTIONS.filter((a) =>
  QUICK_ACTION_NAMES.includes(a.name)
);

function QuickParamInput({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const v = value ?? "";
  if (field.type === "select") {
    return (
      <TextField
        select
        size="small"
        label={field.label}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        fullWidth
      >
        {field.options?.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
    );
  }
  if (field.type === "boolean") {
    return (
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "text.secondary",
          fontSize: 12,
        }}
      >
        <input
          type="checkbox"
          style={{ accentColor: "#1976d2", width: 15, height: 15, cursor: "pointer" }}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  }
  if (field.type === "number") {
    return (
      <TextField
        type="number"
        size="small"
        label={field.label}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        fullWidth
      />
    );
  }
  const isScene = field.type === "scene" || field.type === "view";
  return (
    <TextField
      size="small"
      label={field.label}
      value={v}
      onChange={(e) => onChange(e.target.value)}
      placeholder={
        isScene
          ? "目标 ID（也可到完整编辑器选下拉）"
          : (field.placeholder ?? "")
      }
      fullWidth
      multiline={field.type === "json"}
      minRows={field.type === "json" ? 2 : 1}
      maxRows={field.type === "json" ? 4 : 2}
      slotProps={{
        htmlInput: field.type === "json" ? { style: { fontFamily: "monospace", fontSize: 12 } } : undefined,
      }}
    />
  );
}

/**
 * 按钮"点击行为"快捷编辑器。
 * 让按钮的 onClick 事件在属性面板内直接配置（映射为事件绑定），
 * 不再需要切换到右侧"事件"标签。支持高频动作一键生成；复杂动作进入完整编辑弹窗。
 */
export function ButtonActionEditor({ componentId }: { componentId?: string }) {
  const eventBindings = useEditorStore((s) => s.eventBindings);
  const addEventBinding = useEditorStore((s) => s.addEventBinding);
  const updateEventBinding = useEditorStore((s) => s.updateEventBinding);
  const removeEventBinding = useEditorStore((s) => s.removeEventBinding);

  const [editing, setEditing] = useState<EventBinding | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // 快捷区：当前选择的动作与其参数
  const [quickActionName, setQuickActionName] = useState<string>("");
  const [quickParams, setQuickParams] = useState<Record<string, unknown>>({});

  const clickBindings = useMemo(
    () =>
      eventBindings.filter(
        (b) => b.sourceComponentId === componentId && b.sourceEvent === "onClick"
      ),
    [eventBindings, componentId]
  );

  const scenes = useSceneStore((s) => s.scenes);
  const activeScene = useSceneStore((s) => s.getActiveScene());
  const isScenesLoading = useSceneStore((s) => s.isLoading);
  const scenesInitialized = useSceneStore((s) => s.initialized);

  // 触发场景库加载（空库时自动创建默认场景），让场景/视图下拉有数据
  useEffect(() => {
    useSceneStore.getState().init().catch(() => {});
  }, []);

  // 场景/视图字段（真实下拉）。视图优先跟随已选场景，否则用当前活动场景。
  const renderQuickField = (field: ParamField) => {
    if (field.type === "scene") {
      return (
        <TextField
          select
          size="small"
          label={field.label}
          value={(quickParams[field.key] as string) ?? ""}
          onChange={(e) =>
            setQuickParams((p) => ({ ...p, [field.key]: e.target.value }))
          }
          fullWidth
          required={field.required}
        >
          {scenes.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
          {scenes.length === 0 && (
            <MenuItem value="" disabled>
              {isScenesLoading ? "场景加载中…" : scenesInitialized ? "暂无可用场景" : "场景加载中…"}
            </MenuItem>
          )}
        </TextField>
      );
    }
    if (field.type === "view") {
      const sceneForViews =
        typeof quickParams.sceneId === "string"
          ? scenes.find((s) => s.id === quickParams.sceneId)
          : undefined;
      const views = sceneForViews?.views ?? activeScene?.views ?? [];
      return (
        <TextField
          select
          size="small"
          label={field.label}
          value={(quickParams[field.key] as string) ?? ""}
          onChange={(e) =>
            setQuickParams((p) => ({ ...p, [field.key]: e.target.value }))
          }
          fullWidth
          required={field.required}
        >
          <MenuItem value="">默认视图</MenuItem>
          {views.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.name}
            </MenuItem>
          ))}
          {views.length === 0 && (
            <MenuItem value="" disabled>
              该场景暂无视图
            </MenuItem>
          )}
        </TextField>
      );
    }
    return (
      <QuickParamInput
        field={field}
        value={quickParams[field.key]}
        onChange={(val) => setQuickParams((p) => ({ ...p, [field.key]: val }))}
      />
    );
  };

  const quickAction = QUICK_ACTIONS.find((a) => a.name === quickActionName) ?? null;

  // 必填参数是否均已填写
  const quickValid = useMemo(() => {
    if (!quickAction) return false;
    const schema = quickAction.paramsSchema ?? [];
    return schema
      .filter((f) => f.required)
      .every((f) => {
        const val = quickParams[f.key];
        return val !== undefined && String(val).trim() !== "";
      });
  }, [quickAction, quickParams]);

  const handleQuickChange = (name: string) => {
    setQuickActionName(name);
    setQuickParams({});
  };

  const handleQuickAdd = () => {
    if (!componentId || !quickAction || !quickValid) return;
    const schema = quickAction.paramsSchema ?? [];
    const params: Record<string, unknown> = {};
    for (const f of schema) {
      const val = quickParams[f.key];
      if (val === undefined) continue;
      if (f.type === "json") {
        const t = String(val).trim();
        if (t) {
          try {
            params[f.key] = JSON.parse(t);
          } catch {
            params[f.key] = t;
          }
        }
      } else {
        params[f.key] = val;
      }
    }
    const nb: EventBinding = {
      id: `eb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceComponentId: componentId,
      sourceEvent: "onClick",
      targetComponentId: componentId,
      targetAction: quickAction.name,
      params: Object.keys(params).length > 0 ? params : undefined,
      triggerSource: "interaction",
    };
    addEventBinding(nb);
    setQuickActionName("");
    setQuickParams({});
  };

  const handleAdd = () => {
    const nb: EventBinding = {
      id: `eb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceComponentId: componentId ?? "",
      sourceEvent: "onClick",
      targetComponentId: "",
      targetAction: "",
    };
    setEditing(nb);
    setIsAdding(true);
  };

  const handleEdit = (binding: EventBinding) => {
    setEditing(binding);
    setIsAdding(false);
  };

  const handleSave = (binding: EventBinding) => {
    if (isAdding) addEventBinding(binding);
    else updateEventBinding(binding.id, binding);
    setEditing(null);
    setIsAdding(false);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        点击按钮后触发的行为：跳转、打开链接/弹窗、调用接口等。编辑即同步到「事件」面板。
      </Typography>

      {/* 已配置的点击行为 */}
      {clickBindings.length === 0 ? (
        <Box
          sx={{
            py: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.5,
            borderRadius: 1,
            border: 1,
            borderStyle: "dashed",
            borderColor: "divider",
          }}
        >
          <BoltIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
            暂未配置点击行为
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {clickBindings.map((b) => (
            <EventBindingListItem
              key={b.id}
              binding={b}
              isSource
              onEdit={() => handleEdit(b)}
              onDelete={() => removeEventBinding(b.id)}
            />
          ))}
        </Box>
      )}

      {/* 快捷添加区 */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.75,
          p: 0.75,
          borderRadius: 1,
          bgcolor: "action.hover",
        }}
      >
        <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>
          一键添加行为
        </Typography>
        <TextField
          select
          size="small"
          label="行为类型"
          value={quickActionName}
          onChange={(e) => handleQuickChange(e.target.value)}
          fullWidth
        >
          {QUICK_ACTIONS.map((a) => (
            <MenuItem key={a.name} value={a.name}>
              {a.label}
            </MenuItem>
          ))}
        </TextField>

        {quickAction && (quickAction.paramsSchema?.length ?? 0) > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            {(quickAction.paramsSchema ?? []).map((f) => (
              <Fragment key={f.key}>{renderQuickField(f)}</Fragment>
            ))}
          </Box>
        )}

        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          onClick={handleQuickAdd}
          disabled={!componentId || !quickValid}
          sx={{ textTransform: "none", fontSize: 11, alignSelf: "flex-start" }}
        >
          添加{quickAction ? `：${quickAction.label}` : ""}
        </Button>
      </Box>

      {/* 完整编辑器：目标组件类动作（显示/隐藏/设置数据等）及复杂配置 */}
      <Button
        size="small"
        variant="outlined"
        startIcon={<AddIcon sx={{ fontSize: 13 }} />}
        onClick={handleAdd}
        disabled={!componentId}
        sx={{
          textTransform: "none",
          fontSize: 11,
          alignSelf: "flex-start",
          color: "text.secondary",
          borderColor: "divider",
        }}
      >
        完整编辑（目标组件动作等）
      </Button>

      {editing && (
        <EventBindingEditor
          binding={editing}
          onSave={handleSave}
          onCancel={() => {
            setEditing(null);
            setIsAdding(false);
          }}
        />
      )}
    </Box>
  );
}