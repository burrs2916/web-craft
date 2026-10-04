import { componentRegistry } from "../registryCore";
import { ANIMATION_SCHEMA, ANIMATION_DEFAULTS } from "../renderers/decorationAnimation";

/** 为所有装饰组件追加统一动画字段（ANIMATION_SCHEMA / ANIMATION_DEFAULTS）。 */
export function augmentAnimationFields(): void {
  const allDecorationTypes = componentRegistry.getByCategory("ccat_decoration");
  for (const def of allDecorationTypes) {
    def.defaultConfig = { ...def.defaultConfig, ...ANIMATION_DEFAULTS };
    const existingKeys = new Set((def.configSchema || []).map((s: any) => s.key));
    const newSchemaEntries = ANIMATION_SCHEMA.filter((s) => !existingKeys.has(s.key));
    def.configSchema = [...(def.configSchema || []), ...newSchemaEntries];
  }
}