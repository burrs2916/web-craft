/**
 * datav 自实现的可缩放边框 1~10（纯 SVG + 容器尺寸监听，无外部依赖）。
 * 按行为分组：静态帧 / 角饰 / 可翻转 / JS 动画。
 */
export { ScalableBorderBox1, ScalableBorderBox7 } from "./cornerBoxes";
export { ScalableBorderBox2, ScalableBorderBox3, ScalableBorderBox6, ScalableBorderBox10 } from "./staticBoxes";
export { ScalableBorderBox4, ScalableBorderBox5 } from "./reverseBoxes";
export { ScalableBorderBox8, ScalableBorderBox9 } from "./animatedBoxes";