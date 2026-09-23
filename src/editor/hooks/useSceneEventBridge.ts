import { useEffect, useCallback, type RefObject } from "react";
import { useEventDispatcher } from "../context/SceneEditorContext";

export function useSceneEventBridge(containerRef: RefObject<HTMLElement | null>) {
  const eventDispatcher = useEventDispatcher();

  const forwardPointerEvent = useCallback(
    (type: "click" | "dblclick" | "hover" | "contextmenu" | "pointerdown" | "pointermove" | "pointerup", nativeEvent: PointerEvent | MouseEvent) => {
      if (!eventDispatcher) return;

      eventDispatcher.dispatchPointerEvent({
        type,
        screenX: nativeEvent.clientX,
        screenY: nativeEvent.clientY,
        button: nativeEvent.button,
        shiftKey: nativeEvent.shiftKey,
        ctrlKey: nativeEvent.ctrlKey,
        altKey: nativeEvent.altKey,
        metaKey: nativeEvent.metaKey,
        nativeEvent,
      });
    },
    [eventDispatcher]
  );

  const forwardKeyboardEvent = useCallback(
    (type: "keydown" | "keyup" | "keypress", nativeEvent: KeyboardEvent) => {
      if (!eventDispatcher) return;

      eventDispatcher.dispatchKeyboardEvent({
        type,
        key: nativeEvent.key,
        code: nativeEvent.code,
        shiftKey: nativeEvent.shiftKey,
        ctrlKey: nativeEvent.ctrlKey,
        altKey: nativeEvent.altKey,
        metaKey: nativeEvent.metaKey,
        nativeEvent,
      });
    },
    [eventDispatcher]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !eventDispatcher) return;

    const onPointerDown = (e: PointerEvent) => forwardPointerEvent("pointerdown", e);
    const onPointerMove = (e: PointerEvent) => forwardPointerEvent("pointermove", e);
    const onPointerUp = (e: PointerEvent) => forwardPointerEvent("pointerup", e);
    const onClick = (e: MouseEvent) => forwardPointerEvent("click", e);
    const onDblClick = (e: MouseEvent) => forwardPointerEvent("dblclick", e);
    const onContextMenu = (e: MouseEvent) => forwardPointerEvent("contextmenu", e);
    const onKeyDown = (e: KeyboardEvent) => forwardKeyboardEvent("keydown", e);
    const onKeyUp = (e: KeyboardEvent) => forwardKeyboardEvent("keyup", e);

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("click", onClick);
    container.addEventListener("dblclick", onDblClick);
    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("keydown", onKeyDown);
    container.addEventListener("keyup", onKeyUp);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("click", onClick);
      container.removeEventListener("dblclick", onDblClick);
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("keyup", onKeyUp);
    };
  }, [containerRef, eventDispatcher, forwardPointerEvent, forwardKeyboardEvent]);
}
