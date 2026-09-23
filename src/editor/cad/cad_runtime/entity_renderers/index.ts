export { EntityRendererRegistry, entityRendererRegistry } from "./EntityRenderer";
export type { EntityRenderer, EntityRenderContext, EntityRenderResult } from "./EntityRenderer";
export { LineEntityRenderer } from "./LineEntityRenderer";
export { CircleEntityRenderer } from "./CircleEntityRenderer";
export { TextEntityRenderer } from "./TextEntityRenderer";

import { entityRendererRegistry as registry } from "./EntityRenderer";
import { LineEntityRenderer as LineRenderer } from "./LineEntityRenderer";
import { CircleEntityRenderer as CircleRenderer } from "./CircleEntityRenderer";
import { TextEntityRenderer as TextRenderer } from "./TextEntityRenderer";

let _builtinRegistered = false;

export function registerBuiltinEntityRenderers(): void {
  if (_builtinRegistered) return;
  registry.register(new LineRenderer());
  registry.register(new CircleRenderer());
  registry.register(new TextRenderer());
  _builtinRegistered = true;
}

registerBuiltinEntityRenderers();
