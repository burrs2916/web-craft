import { registerText } from "./text";
import { registerImage } from "./image";
import { registerShape } from "./shape";
import { registerMetric } from "./metric";
import { registerProgress } from "./progress";
import { registerSkeleton } from "./skeleton";
import { registerSpin } from "./spin";
import { registerEmptyState } from "./emptyState";
import { registerVideo } from "./video";
import { registerAudio } from "./audio";
import { registerAvatar } from "./avatar";
import { registerBacktop } from "./backtop";
import { registerTag } from "./tag";
import { registerSwitch } from "./switch";
import { registerBadge } from "./badge";

/**
 * 注册基础组件（网站编辑器）
 * - 文本、图片、形状、指标、进度、加载占位、空状态、音视频、头像、返回顶部、标签、开关、徽标
 */
export function registerBasicComponents(): void {
  registerText();
  registerImage();
  registerShape();
  registerMetric();
  registerProgress();
  registerSkeleton();
  registerSpin();
  registerEmptyState();
  registerVideo();
  registerAudio();
  registerAvatar();
  registerBacktop();
  registerTag();
  registerSwitch();
  registerBadge();
}
