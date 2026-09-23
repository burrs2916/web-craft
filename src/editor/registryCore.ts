import type { ComponentDefinition, RendererLoader, ConfigField } from "../types/editor";
import { DATA_CONFIG_DEFAULTS, DATA_CONFIG_SCHEMA } from "./dataConfigMixin";

/**
 * 该组件是否使用「通用数据源分组」——**必须由组件显式声明**（`dataConfigMixin: true`）。
 *
 * 历史：这里曾按"类目前缀 + 跳过名单"启发式注入，于是 32 个组件被塞进通用数据源分组，
 * 其中 29 个组件的产物对该组任何字段都**毫无反应**（属性栏出现整组 9~10 条死控件，
 * 用户改了配置却什么也不会发生）。判断"某组件是否消费这组字段"没有可靠的静态依据，
 * 那就不要猜：想用就显式声明，不想用就什么都不用写。
 */
function shouldInjectDataConfig(def: ComponentDefinition): boolean {
  return def.dataConfigMixin === true;
}

class ComponentRegistryImpl {
  private definitions = new Map<string, ComponentDefinition>();
  private iconOverrides = new Map<string, string>();

  register(definition: ComponentDefinition): void {
    if (this.definitions.has(definition.type)) {
      console.warn(`[ComponentRegistry] Component type "${definition.type}" is already registered, overwriting.`);
    }

    // ── 按需注入统一数据配置（布局/装饰/纯展示组件不注入）──
    const dataCapable = shouldInjectDataConfig(definition);
    // 1. defaultConfig: mixin 默认值铺底，组件自有字段优先（不覆盖）
    const mergedDefaultConfig: Record<string, unknown> = dataCapable
      ? { ...DATA_CONFIG_DEFAULTS, ...definition.defaultConfig }
      : definition.defaultConfig;

    // 2. configSchema: 组件已有 schema 在前，mixin schema 按 key 去重后追加
    const existingSchemaKeys = new Set(
      (definition.configSchema ?? []).map((f) => f.key),
    );
    const additionalDataSchema: ConfigField[] = dataCapable
      ? DATA_CONFIG_SCHEMA.filter((f) => !existingSchemaKeys.has(f.key))
      : [];
    const mergedConfigSchema: ConfigField[] = [
      ...(definition.configSchema ?? []),
      ...additionalDataSchema,
    ];

    const merged: ComponentDefinition = {
      ...definition,
      defaultConfig: mergedDefaultConfig,
      configSchema: mergedConfigSchema,
    };

    this.definitions.set(definition.type, merged);
  }

  unregister(type: string): boolean {
    this.iconOverrides.delete(type);
    return this.definitions.delete(type);
  }

  get(type: string): ComponentDefinition | undefined {
    return this.definitions.get(type);
  }

  getEffectiveIcon(type: string): string | undefined {
    const def = this.definitions.get(type);
    if (!def) return undefined;
    return this.iconOverrides.get(type) ?? def.icon;
  }

  setIconOverride(type: string, icon: string | null | undefined): void {
    if (icon == null || icon === "") {
      this.iconOverrides.delete(type);
    } else {
      this.iconOverrides.set(type, icon);
    }
  }

  getIconOverride(type: string): string | undefined {
    return this.iconOverrides.get(type);
  }

  getAll(): ComponentDefinition[] {
    return Array.from(this.definitions.values());
  }

  getByCategory(category: string): ComponentDefinition[] {
    return this.getAll().filter((d) => d.category === category);
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    this.definitions.forEach((d) => categories.add(d.category));
    return Array.from(categories);
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }

  async loadRenderer(type: string): Promise<React.ComponentType<any> | null> {
    const def = this.definitions.get(type);
    if (!def) return null;
    if (def.renderer.cached) return def.renderer.cached;
    try {
      const mod = await def.renderer.loader();
      def.renderer.cached = mod.default;
      return mod.default;
    } catch (err) {
      console.error(`[ComponentRegistry] Failed to load renderer for "${type}":`, err);
      return null;
    }
  }

  getEnabled(): ComponentDefinition[] {
    return this.getAll().filter((d) => d.enabled !== false);
  }
}

export const componentRegistry = new ComponentRegistryImpl();

export const lazy = (loader: RendererLoader): ComponentDefinition["renderer"] => ({
  loader,
});
