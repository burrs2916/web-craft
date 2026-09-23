declare module "troika-three-text" {
  import type { Object3D, Color } from "three";
  export class Text extends Object3D {
    text: string;
    font: string;
    fontSize: number;
    color: string | Color | number;
    anchorX: string | number;
    anchorY: string | number;
    maxWidth: number | undefined;
    lineHeight: number;
    depthTest: boolean;
    depthOffset: number;
    strokeColor: string;
    strokeWidth: number;
    outlineColor: string;
    outlineWidth: number;
    outlineBlur: number;
    outlineOffsetX: number;
    outlineOffsetY: number;
    textRenderInfo: any;
    material: any;
    sync(callback?: (err: Error | null) => void): void;
    dispose(): void;
  }
  export class BatchedText extends Text {
    addText(text: Text): void;
    removeText(text: Text): void;
  }
  export class TroikaText extends Text {}
  export default Text;
}
