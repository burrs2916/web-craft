/**
 * 构建部署进度面板 — 展示全链路（发布→构建→部署）实时进度
 *
 * 监听 build-progress 和 deploy-progress 事件，
 * 分阶段展示进度条、步骤名称和日志。
 */

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress,
  Typography,
  Box,
  Chip,
  IconButton,
  Collapse,
} from "@mui/material";
import {
  CheckCircle,
  Error as ErrorIcon,
  ExpandMore,
  ExpandLess,
  CloudUpload,
  Build,
  Publish,
  RocketLaunch,
} from "@mui/icons-material";
import { listen } from "@tauri-apps/api/event";
import type { BuildProgress as BuildProgressData } from "../../services/codegenService";

interface PipelineProgressPanelProps {
  open: boolean;
  onClose: () => void;
  /** 全链路完成后的回调 */
  onComplete?: (success: boolean, error?: string) => void;
}

interface PhaseState {
  step: string;
  message: string;
  percent: number;
  done: boolean;
  error?: string;
}

type Phase = "publish" | "build" | "deploy";

const PHASE_ICONS: Record<Phase, React.ReactNode> = {
  publish: <Publish fontSize="small" />,
  build: <Build fontSize="small" />,
  deploy: <RocketLaunch fontSize="small" />,
};

const PHASE_LABELS: Record<Phase, string> = {
  publish: "生成脚手架",
  build: "构建工程",
  deploy: "部署上线",
};

export function PipelineProgressPanel({
  open,
  onClose,
  onComplete,
}: PipelineProgressPanelProps) {
  const [phases, setPhases] = useState<Record<Phase, PhaseState>>({
    publish: { step: "pending", message: "等待开始", percent: 0, done: false },
    build: { step: "pending", message: "等待开始", percent: 0, done: false },
    deploy: { step: "pending", message: "等待开始", percent: 0, done: false },
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [finished, setFinished] = useState(false);
  const [hasError, setHasError] = useState(false);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  }, []);

  // 监听构建进度
  useEffect(() => {
    if (!open) return;

    const unlistenBuild = listen<BuildProgressData>("build-progress", (event) => {
      const p = event.payload;
      addLog(`[Build] ${p.step}: ${p.message} (${p.percent}%)`);
      setPhases((prev) => ({
        ...prev,
        build: {
          step: p.step,
          message: p.message,
          percent: p.percent,
          done: p.percent >= 100,
          error: p.step === "error" ? p.message : undefined,
        },
      }));
      if (p.step === "error") {
        setHasError(true);
      }
    });

    const unlistenDeploy = listen<{
      step: string;
      message: string;
      percent: number;
    }>("deploy-progress", (event) => {
      const p = event.payload;
      addLog(`[Deploy] ${p.step}: ${p.message} (${p.percent}%)`);
      setPhases((prev) => ({
        ...prev,
        deploy: {
          step: p.step,
          message: p.message,
          percent: p.percent,
          done: p.percent >= 100,
          error: undefined,
        },
      }));
      if (p.percent >= 100) {
        setFinished(true);
        onComplete?.(true);
      }
    });

    return () => {
      unlistenBuild.then((fn) => fn());
      unlistenDeploy.then((fn) => fn());
    };
  }, [open, addLog, onComplete]);

  // 模拟 publish 阶段完成（publish 是同步的，瞬间完成）
  useEffect(() => {
    if (open && phases.publish.step === "pending") {
      addLog("[Publish] 生成工程脚手架...");
      setPhases((prev) => ({
        ...prev,
        publish: { step: "done", message: "脚手架生成完成", percent: 100, done: true },
      }));
    }
  }, [open, phases.publish.step, addLog]);

  const overallPercent = Math.round(
    (phases.publish.percent * 0.1 + phases.build.percent * 0.65 + phases.deploy.percent * 0.25) / 100 * 100,
  );

  const handleFinish = () => {
    setPhases({
      publish: { step: "pending", message: "等待开始", percent: 0, done: false },
      build: { step: "pending", message: "等待开始", percent: 0, done: false },
      deploy: { step: "pending", message: "等待开始", percent: 0, done: false },
    });
    setLogs([]);
    setFinished(false);
    setHasError(false);
    setShowLogs(false);
    onClose();
  };

  const phaseOrder: Phase[] = ["publish", "build", "deploy"];

  return (
    <Dialog
      open={open}
      onClose={finished || hasError ? handleFinish : undefined}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: { sx: { borderRadius: 3 } },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        <CloudUpload color="primary" />
        <Box component="span" sx={{ fontWeight: 700 }}>
          构建部署管线
        </Box>
        {(finished || hasError) && (
          <Chip
            size="small"
            color={hasError ? "error" : "success"}
            label={hasError ? "失败" : "完成"}
            sx={{ ml: "auto" }}
          />
        )}
      </DialogTitle>
      <DialogContent sx={{ pb: 2 }}>
        {/* 总进度 */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="body2" component="span" color="text.secondary">
              总进度
            </Typography>
            <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
              {overallPercent}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={overallPercent}
            color={hasError ? "error" : "primary"}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>

        {/* 分阶段进度 */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {phaseOrder.map((phase) => {
            const state = phases[phase];
            return (
              <Box
                key={phase}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  p: 1.5,
                  borderRadius: 2,
                  backgroundColor: state.done
                    ? "success.main"
                    : state.error
                    ? "error.main"
                    : "action.hover",
                  opacity: state.step === "pending" ? 0.5 : 1,
                  transition: "all 0.3s ease",
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    backgroundColor: state.done
                      ? "success.light"
                      : state.error
                      ? "error.light"
                      : "primary.light",
                    color: "#fff",
                  }}
                >
                  {state.done ? (
                    <CheckCircle fontSize="small" />
                  ) : state.error ? (
                    <ErrorIcon fontSize="small" />
                  ) : (
                    PHASE_ICONS[phase]
                  )}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" component="div" sx={{ fontWeight: 600 }}>
                    {PHASE_LABELS[phase]}
                  </Typography>
                  <Typography variant="caption" component="div" color="text.secondary" noWrap>
                    {state.message}
                  </Typography>
                </Box>
                {state.percent > 0 && state.percent < 100 && (
                  <Typography variant="caption" component="span" sx={{ fontWeight: 600 }}>
                    {state.percent}%
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>

        {/* 日志展开/收起 */}
        {logs.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", cursor: "pointer" }}
              onClick={() => setShowLogs(!showLogs)}
            >
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                构建日志 ({logs.length} 条)
              </Typography>
              <IconButton size="small">
                {showLogs ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </IconButton>
            </Box>
            <Collapse in={showLogs}>
              <Box
                sx={{
                  mt: 1,
                  p: 1.5,
                  maxHeight: 200,
                  overflow: "auto",
                  borderRadius: 1,
                  backgroundColor: "rgba(0,0,0,0.04)",
                  fontFamily: "monospace",
                  fontSize: 11,
                  lineHeight: 1.6,
                }}
              >
                {logs.map((line, i) => (
                  <Box key={i} sx={{ color: line.includes("[ERROR]") || line.includes("error") ? "error.main" : "text.primary" }}>
                    {line}
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {(finished || hasError) && (
          <Button onClick={handleFinish} variant="contained" sx={{ borderRadius: 2 }}>
            {hasError ? "关闭" : "完成"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
