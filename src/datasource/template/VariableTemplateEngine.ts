import type { SceneVariable } from "../../types/scene";

type VariableChangeHandler = (name: string, value: unknown, oldValue: unknown) => void;

const VARIABLE_PATTERN = /\$\{(\w[\w.]*)\}/g;

export class VariableTemplateEngine {
  private variables: Map<string, SceneVariable> = new Map();
  private changeHandlers: Set<VariableChangeHandler> = new Set();

  registerVariable(variable: SceneVariable): void {
    const existing = this.variables.get(variable.name);
    if (existing) {
      Object.assign(existing, variable);
    } else {
      this.variables.set(variable.name, { ...variable });
    }
  }

  registerVariables(variables: SceneVariable[]): void {
    for (const v of variables) {
      this.registerVariable(v);
    }
  }

  unregisterVariable(name: string): void {
    this.variables.delete(name);
  }

  getVariable(name: string): SceneVariable | undefined {
    return this.variables.get(name);
  }

  getAllVariables(): SceneVariable[] {
    return Array.from(this.variables.values());
  }

  getValue(name: string): unknown {
    const variable = this.variables.get(name);
    if (!variable) return undefined;
    return variable.currentValue !== undefined ? variable.currentValue : variable.defaultValue;
  }

  setValue(name: string, value: unknown): void {
    const variable = this.variables.get(name);
    if (!variable) {
      console.warn(`[VariableTemplateEngine] Variable "${name}" not registered`);
      return;
    }
    const oldValue = variable.currentValue !== undefined ? variable.currentValue : variable.defaultValue;
    variable.currentValue = value;
    if (oldValue !== value) {
      this.changeHandlers.forEach(handler => {
        try {
          handler(name, value, oldValue);
        } catch (err) {
          console.error(`[VariableTemplateEngine] Change handler error for "${name}":`, err);
        }
      });
    }
  }

  resolve<T extends string | Record<string, unknown> | unknown[]>(input: T): T {
    if (typeof input === 'string') {
      return this.resolveString(input) as T;
    }
    if (Array.isArray(input)) {
      return input.map(item => this.resolve(item as string | Record<string, unknown> | unknown[])) as T;
    }
    if (typeof input === 'object' && input !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        result[key] = this.resolve(value as string | Record<string, unknown> | unknown[]);
      }
      return result as T;
    }
    return input;
  }

  private resolveString(template: string): string {
    return template.replace(VARIABLE_PATTERN, (match, varName: string) => {
      const value = this.getValue(varName);
      if (value === undefined || value === null) {
        return match;
      }
      return String(value);
    });
  }

  extractVariableNames(template: string): string[] {
    const names: string[] = [];
    let match: RegExpExecArray | null;
    const pattern = new RegExp(VARIABLE_PATTERN.source, 'g');
    while ((match = pattern.exec(template)) !== null) {
      if (!names.includes(match[1])) {
        names.push(match[1]);
      }
    }
    return names;
  }

  hasVariables(template: string): boolean {
    VARIABLE_PATTERN.lastIndex = 0;
    return VARIABLE_PATTERN.test(template);
  }

  onChange(handler: VariableChangeHandler): () => void {
    this.changeHandlers.add(handler);
    return () => {
      this.changeHandlers.delete(handler);
    };
  }

  resetAll(): void {
    for (const variable of this.variables.values()) {
      variable.currentValue = undefined;
    }
  }

  clear(): void {
    this.variables.clear();
    this.changeHandlers.clear();
  }
}

export const globalVariableEngine = new VariableTemplateEngine();
