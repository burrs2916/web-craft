import { CadViewerWidget } from "../../editor/cad/CadViewerWidget";
import type { CADViewProps } from "./types";

export default function CADView({
  fileUrl,
  format = "dxf",
  coordinateSystem: _coordinateSystem,
  visible = true,
  style,
  className,
}: CADViewProps) {
  if (!visible) return null;

  return (
    <CadViewerWidget
      fileUrl={fileUrl || undefined}
      format={format}
      backgroundColor="#1a1a2e"
      lineColor="#4fc3f7"
      showToolbar={true}
      style={style}
      className={className}
    />
  );
}
