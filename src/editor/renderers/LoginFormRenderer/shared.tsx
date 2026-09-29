import type { SxProps, Theme } from "@mui/material/styles";

/**
 * 从响应对象中按点/下标路径取值（如 "data.token"、"items[0].id"）。
 */
export function getNested(obj: unknown, path: string): unknown {
  const keys = path.replace(/\[(\d+)]/g, ".$1").split(".");
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/**
 * 将 expiresIn 解析为绝对时间戳（毫秒）。
 * - 大于 1e12 视为已是时间戳
 * - 数字视为秒数，基于当前时间换算
 * - 其他尝试按日期字符串解析
 */
export function parseExpiresIn(val: unknown): number {
  if (val === undefined || val === null) return 0;
  const n = typeof val === "number" ? val : Number(val);
  if (!isNaN(n)) {
    if (n > 1e12) return n;
    return Date.now() + n * 1000;
  }
  const d = new Date(String(val));
  if (!isNaN(d.getTime())) return d.getTime();
  return 0;
}

export interface InputSxOptions {
  bgColor: string;
  textColor: string;
  borderColor: string;
  focusColor: string;
  radius: number;
  height: number;
  fontSize: number;
  labelColor: string;
}

/**
 * 共享输入框 sx 工厂：统一各输入框的颜色/边框/圆角/高度/字号。
 */
export function inputSx(opts: InputSxOptions): SxProps<Theme> {
  return {
    "& .MuiOutlinedInput-root": {
      backgroundColor: opts.bgColor,
      color: opts.textColor,
      borderRadius: `${opts.radius}px`,
      height: `${opts.height}px`,
      fontSize: `${opts.fontSize}px`,
      "& fieldset": { borderColor: opts.borderColor },
      "&:hover fieldset": { borderColor: opts.borderColor },
      "&.Mui-focused fieldset": { borderColor: opts.focusColor, borderWidth: 2 },
      "&.Mui-disabled fieldset": { borderColor: opts.borderColor },
      "&.Mui-disabled": { backgroundColor: opts.bgColor, color: opts.textColor, opacity: 1, WebkitTextFillColor: opts.textColor },
    },
    "& .MuiInputLabel-root": {
      color: opts.labelColor,
      fontSize: `${opts.fontSize}px`,
      "&.Mui-focused": { color: opts.focusColor },
      "&.Mui-disabled": { color: opts.labelColor, opacity: 0.6 },
    },
    "& .MuiInputBase-input::placeholder": {
      opacity: 0.6,
    },
  };
}

/**
 * 容器阴影映射。
 */
export const SHADOW_MAP: Record<string, string> = {
  "none": "none",
  "0 2px 8px rgba(0,0,0,0.08)": "0 2px 8px rgba(0,0,0,0.08)",
  "0 4px 16px rgba(0,0,0,0.12)": "0 4px 16px rgba(0,0,0,0.12)",
  "0 8px 32px rgba(0,0,0,0.16)": "0 8px 32px rgba(0,0,0,0.16)",
};

/**
 * v5 社交登录 SVG 图标路径表。
 */
export const SOCIAL_ICONS: Record<string, string> = {
  wechat: "M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.186 3.002 5.486L2.5 17l2.937-1.526c.574.158 1.183.234 1.804.234.179 0 .356-.012.534-.024-.113-.348-.177-.715-.177-1.096 0-3.708 3.291-6.714 7.354-6.714.179 0 .355.012.531.024C14.729 4.218 11.949 2.188 8.691 2.188zm-2.6 3.476c.43 0 .778.347.778.778 0 .43-.349.778-.778.778-.43 0-.778-.348-.778-.778 0-.43.349-.778.778-.778zm5.182 0c.43 0 .778.347.778.778 0 .43-.349.778-.778.778-.43 0-.778-.348-.778-.778 0-.43.349-.778.778-.778z",
  github: "M12 2C6.477 2 2 6.486 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.012-1.7-2.782.603-3.369-1.342-3.369-1.342-.455-1.157-1.11-1.465-1.11-1.465-.908-.621.069-.608.069-.608 1.003.071 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.349-1.087.633-1.337-2.221-.252-4.555-1.11-4.555-4.942 0-1.091.39-1.984 1.029-2.684-.103-.252-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.114 2.502.334 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.395.1 2.647.64.7 1.028 1.593 1.028 2.684 0 3.842-2.337 4.687-4.565 4.935.359.309.679.918.679 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.514-4.477-10-10-10z",
  google: "M12.545 12l3.955-3.956-3.955-3.955-1.414 1.414L13.672 12l-2.541 2.541z M21 12c0-4.971-4.029-9-9-9s-9 4.029-9 9 4.029 9 9 9c2.553 0 4.862-1.055 6.513-2.746l-1.414-1.414C15.81 17.156 14.022 18 12 18c-3.314 0-6-2.686-6-6s2.686-6 6-6c1.657 0 3.157.671 4.243 1.757L18 6l-1.757 4.243z",
  qq: "M12.001 2c2.5 0 4.5 2 4.5 4.5 0 .5-.1 1-.2 1.5 1 .5 2 1.5 2.5 3 .5 1.5.5 3 .5 4.5 0 0 0 .5-.5 1l-.5.5c0 .5-.5 1-1 1.5-.5.5-1 .5-1.5 0 0 0-.5 1-1 1.5-.5.5-1 .5-1.5.5h-2c-.5 0-1 0-1.5-.5-.5-.5-1-1.5-1-1.5-.5.5-1 .5-1.5 0-.5-.5-1-1-1-1.5l-.5-.5c-.5-.5-.5-1-.5-1 0-1.5 0-3 .5-4.5.5-1.5 1.5-2.5 2.5-3-.1-.5-.2-1-.2-1.5 0-2.5 2-4.5 4.5-4.5z",
  weibo: "M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm3.5 14c-1 1-3 1.5-4.5 1s-3-2-2.5-3.5c.5-1.5 2.5-2 4-1.5s3 1 3 2-.5 1-1 2z",
  apple: "M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.243 0-1.432.62-2.198.44-3.127-.35C2.966 15.5 3.5 7.5 7.84 7.5c1.5 0 2.5 1 3.5 1 1 0 2.5-1 4-1 1.5 0 3 .5 3.5 2.5-2 1.5-2.5 4.5-.79 7.28.28.35.56.65.79 1zM12.5 6.5c.5-2 2-3.5 3.5-3.5.5 2-1 3.5-3.5 3.5z",
};

/**
 * 按图标名生成社交登录 SVG 图标（未知图标回退 github）。
 */
export function getSocialIcon(iconName: string, size: number) {
  const path = SOCIAL_ICONS[iconName] || SOCIAL_ICONS.github;
  return (
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="currentColor">
      <path d={path} />
    </svg>
  );
}