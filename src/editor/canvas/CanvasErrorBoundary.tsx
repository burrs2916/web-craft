/**
 * CanvasErrorBoundary - 临时诊断用错误边界（取证用，可后续保留为最小防御版）
 *
 * 用途：
 *  1. 捕获画布/组件在运行期同步抛出的渲染错误，避免无 Error Boundary 时整棵子树被
 *     React 卸载导致"整块空白"。
 *  2. 把精确报错栈打到日志（logger.error -> dev 写盘 + console.error），并在 UI 上
 *     直接显示错误文案，便于定位"是哪个组件/哪一行"抛错。
 *
 * 注意：这是临时诊断组件。取证完成后可视情况保留为永久防御层。
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { logger } from "../../utils/logger";

interface Props {
  /** 位置标识，例如 "editor-canvas"（宿主层）或 "comp:<id>"（单组件） */
  label?: string;
  /** 出错的组件 id（单组件级边界填写） */
  componentId?: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
}

export class CanvasErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const ctx = this.props.componentId
      ? `component ${this.props.componentId}`
      : this.props.label || "canvas";
    logger.error("CanvasErrorBoundary", `Caught render error in ${ctx}`, {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    // 同时打到 console，方便 DevTools 直接查看
    console.error(`[CanvasErrorBoundary] ${ctx}:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const where = this.props.componentId || this.props.label || "canvas";
      return (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            p: 1.5,
            overflow: "auto",
            boxSizing: "border-box",
            color: "#ffb4b4",
            fontFamily: "monospace",
            fontSize: 11,
            bgcolor: "rgba(60,0,0,0.35)",
            border: "1px solid rgba(255,80,80,0.5)",
            borderRadius: 1,
          }}
        >
          <Typography sx={{ color: "#ff8a8a", fontWeight: 700, fontSize: 12, mb: 0.5 }}>
            渲染错误（{where}）
          </Typography>
          <Box component="pre" sx={{ whiteSpace: "pre-wrap", m: 0, lineHeight: 1.4 }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </Box>
          {this.state.info?.componentStack && (
            <Box component="pre" sx={{ whiteSpace: "pre-wrap", m: 0, mt: 0.5, opacity: 0.7 }}>
              {this.state.info.componentStack}
            </Box>
          )}
        </Box>
      );
    }
    return this.props.children;
  }
}
