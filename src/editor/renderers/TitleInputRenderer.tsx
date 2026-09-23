import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";

/** 纯文本输入框：无边框、无背景，编辑态为 input，预览态为文字 */
export function TitleInputRenderer({
  config,
  mode,
  onConfigChange,
  onInteractionLockChange,
}: ComponentRendererProps) {
  const content = (config.content as string) || "标题";
  const fontSize = (config.fontSize as number) || 18;
  const fontFamily = (config.fontFamily as string) || "inherit";
  const fontWeight = (config.fontWeight as string) || "normal";
  const color = (config.color as string) || "#ffffff";
  const textAlign = (config.textAlign as string) || "center";
  const isEdit = mode !== "preview";

  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(content);

  useEffect(() => {
    if (!focused) setDraft(content);
  }, [content, focused]);

  const inputStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    margin: 0,
    padding: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    boxShadow: "none",
    fontFamily,
    fontSize,
    fontWeight,
    color,
    textAlign: textAlign as CSSProperties["textAlign"],
    cursor: isEdit ? (focused ? "text" : "move") : "default",
  };

  const handleFocus = useCallback(() => {
    setFocused(true);
    onInteractionLockChange?.(true);
  }, [onInteractionLockChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onInteractionLockChange?.(false);
    const trimmed = draft.trim() || "标题";
    if (trimmed !== content) {
      onConfigChange?.("content", trimmed);
    }
  }, [draft, content, onConfigChange, onInteractionLockChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        inputRef.current?.blur();
      }
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (focused) e.stopPropagation();
    },
    [focused],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isEdit) return;
      e.stopPropagation();
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    [isEdit],
  );

  return (
    <Box
      onDoubleClick={handleDoubleClick}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        boxSizing: "border-box",
        background: "transparent",
        border: "none",
        overflow: "hidden",
      }}
    >
      {isEdit ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onMouseDown={(e) => focused && e.stopPropagation()}
          style={inputStyle}
          spellCheck={false}
        />
      ) : (
        <Box
          component="span"
          sx={{
            width: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily,
            fontSize,
            fontWeight,
            color,
            textAlign,
          }}
        >
          {content}
        </Box>
      )}
    </Box>
  );
}
