// 设备组件 SVG 缩略图生成函数
// 参考金箔雕花边框 (OrnamentalFrame) 的模式：纯 SVG 矢量绘制，不依赖设备数据
export const DEVICE_SVG_THUMBS: Record<string, (w: number, h: number) => string> = {
  "device:FY002-MainController": (w, h) => {
    // 喷雾集控器 - 严格 1:1 复刻自 /references/SVG参考/设备/exported_image.svg
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 360 266" preserveAspectRatio="xMidYMid meet">
      <g transform="translate(0, 3)">
        <!-- 1. 主体面板 -->
        <rect x="20" y="10" width="320" height="240" rx="8" fill="#D93A3A" />
        <!-- 2. 外框描边 -->
        <rect x="10" y="0" width="340" height="260" rx="10" fill="none" stroke="#B82F2F" stroke-width="6" />
        <!-- 3. 螺丝孔 - 上边 5 个 -->
        <circle cx="30" cy="20" r="4" fill="#222222" />
        <circle cx="110" cy="20" r="4" fill="#222222" />
        <circle cx="180" cy="20" r="4" fill="#222222" />
        <circle cx="250" cy="20" r="4" fill="#222222" />
        <circle cx="330" cy="20" r="4" fill="#222222" />
        <!-- 螺丝孔 - 下边 5 个 -->
        <circle cx="30" cy="240" r="4" fill="#222222" />
        <circle cx="110" cy="240" r="4" fill="#222222" />
        <circle cx="180" cy="240" r="4" fill="#222222" />
        <circle cx="250" cy="240" r="4" fill="#222222" />
        <circle cx="330" cy="240" r="4" fill="#222222" />
        <!-- 螺丝孔 - 左右中间各 1 个 -->
        <circle cx="30" cy="130" r="4" fill="#222222" />
        <circle cx="330" cy="130" r="4" fill="#222222" />
        <!-- 4. 屏幕区域 -->
        <rect x="110" y="80" width="140" height="80" rx="4" fill="#5A9ED6" stroke="#333333" stroke-width="2" />
        <!-- 5. 接线端子组 -->
        <g transform="translate(0, 70)" fill="#B82F2F">
          <rect x="0" y="0" width="10" height="20" rx="2" />
          <rect x="0" y="100" width="10" height="20" rx="2" />
          <rect x="350" y="0" width="10" height="20" rx="2" />
          <rect x="350" y="100" width="10" height="20" rx="2" />
        </g>
      </g>
    </svg>`;
  },
};