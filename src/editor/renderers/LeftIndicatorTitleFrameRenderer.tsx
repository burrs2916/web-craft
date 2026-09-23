import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";
import { getTitleFrameConfig, useFrameUid } from "./TitleFramePrimitives";

export function LeftIndicatorTitleFrameRenderer({ config }: ComponentRendererProps) {
  const fc = getTitleFrameConfig(config);
  const uid = useFrameUid();
  const gradId = `tf-grad-${uid}`;
  const gradId2 = `tf-grad2-${uid}`;
  const glowId = `tf-glow-${uid}`;

  const indicatorW = (config.indicatorWidth as number) ?? 1;
  const paddingLeft = (config.paddingLeft as number) ?? 4;

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity: fc.opacity, overflow: "visible" }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0.15" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={gradId2} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>
            {fc.glowEnabled && (
              <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )}
          </defs>
          <rect x={paddingLeft} y={8} width={indicatorW} height={84} rx="0.3" fill={fc.stroke} filter={fc.glowEnabled ? `url(#${glowId})` : undefined} />
          <rect x={paddingLeft + indicatorW + 1} y={8} width={100 - paddingLeft * 2 - indicatorW - 1} height={84} fill={fc.fillColor} fillOpacity={fc.fillOpacity} />
          <line x1={paddingLeft + indicatorW + 1} y1={92} x2={100 - paddingLeft} y2={92} stroke={`url(#${gradId2})`} strokeWidth={fc.strokeWidth} vectorEffect="non-scaling-stroke" filter={fc.glowEnabled ? `url(#${glowId})` : undefined} />
          {(() => {
            const text = (config.text as string) ?? "标题";
            const color = (config.color as string) || "#ffffff";
            const fontSize = (config.fontSize as number) ?? 20;
            return (
              <text
                x={50}
                y={50}
                fill={color}
                fontSize={fontSize}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ userSelect: "none", fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif" }}
              >
                {text}
              </text>
            );
          })()}
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
