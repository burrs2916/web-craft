import { useElementSize } from "./shared";

/* ===================== 雕花边框 CarvedFrameDeco10 ===================== */
/* 依据 vectorstock_81332.svg 重写的矩形雕花边框装饰：
   - viewBox 0 0 455 681（竖长矩形）
   - 4 个角花（顶部 2 + 底部 2）+ 左/右长边各 3 个边花，共 10 条贝塞尔 path
   - 单色填充（color1），与参考 SVG 一致（参考 SVG 无描边）
   - 用 useElementSize + ResizeObserver 实时响应外层容器尺寸变化
   - preserveAspectRatio="none" 允许边框被任意拉伸填满容器 */
import { CARVED_FRAME_PATH } from "../decorPaths/carvedFrame";

interface CarvedFrameDeco10Props {
  color1: string;
  color2?: string;
  backgroundColor?: string;
}

export function CarvedFrameDeco10({
  color1,
  color2: _color2,
  backgroundColor,
}: CarvedFrameDeco10Props) {
  const [ref, { width: w, height: h }] = useElementSize();

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: backgroundColor || "transparent",
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox="0 0 455 681"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {/* 参考 SVG 全局 translate(0.71, 0.62) + 单色填充 fillRule="evenodd"，无描边 */}
        <g transform="translate(0.71, 0.62)" fill={color1} fillRule="evenodd">
          {CARVED_FRAME_PATH.map((g, gi) => (
            <g key={`f-${gi}`} transform={g.transform}>
              {g.d.map((d, di) => (
                <path key={`f-${gi}-${di}`} d={d} />
              ))}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
