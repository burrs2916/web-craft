import Box from "@mui/material/Box";
import { useEffect, useRef } from "react";
import { SceneEditor } from "../editor/SceneEditor";
import { useSceneStore } from "../store/sceneStore";

export function WebsiteEditorPage() {
  const init = useSceneStore((s) => s.init);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void init();
  }, [init]);

  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <SceneEditor />
    </Box>
  );
}
