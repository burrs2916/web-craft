export type TransformFunction = (value: unknown, context?: Record<string, unknown>) => unknown;

export interface TransformStep {
  id: string;
  type: "map" | "filter" | "aggregate" | "custom";
  expression?: string;
  fn?: TransformFunction;
  enabled: boolean;
}

export interface PipelineConfig {
  steps: TransformStep[];
}

import { safeFilter, safeRowTransform, safeDataTransform } from "../utils/safeEval";

export class DataPipeline {
  private steps: TransformStep[] = [];

  constructor(steps?: TransformStep[]) {
    this.steps = steps ?? [];
  }

  addStep(step: TransformStep): void {
    this.steps.push(step);
  }

  removeStep(stepId: string): void {
    this.steps = this.steps.filter((s) => s.id !== stepId);
  }

  execute(input: unknown, context?: Record<string, unknown>): unknown {
    let current = input;

    for (const step of this.steps) {
      if (!step.enabled) continue;

      try {
        current = this.executeStep(step, current, context);
      } catch (error) {
        console.error(`[Pipeline] 步骤执行失败 (${step.id}):`, error);
      }
    }

    return current;
  }

  private executeStep(step: TransformStep, input: unknown, context?: Record<string, unknown>): unknown {
    if (step.fn) {
      return step.fn(input, context);
    }

    switch (step.type) {
      case "map":
        return this.executeMap(input, step.expression);
      case "filter":
        return this.executeFilter(input, step.expression);
      case "aggregate":
        return this.executeAggregate(input, step.expression);
      case "custom":
        return input;
      default:
        return input;
    }
  }

  private executeMap(input: unknown, expression?: string): unknown {
    if (!expression || !Array.isArray(input)) return input;
    return input.map((item) => {
      const fn = safeRowTransform(expression);
      return fn ? fn(item) : item;
    });
  }

  private executeFilter(input: unknown, expression?: string): unknown {
    if (!expression || !Array.isArray(input)) return input;
    const fn = safeFilter(expression);
    if (!fn) return input;
    return input.filter(fn);
  }

  private executeAggregate(input: unknown, expression?: string): unknown {
    if (!Array.isArray(input) || !expression) return input;
    const fn = safeDataTransform(expression);
    return fn ? fn(input) : input;
  }

  getSteps(): TransformStep[] {
    return [...this.steps];
  }

  clone(): DataPipeline {
    return new DataPipeline(this.steps.map((s) => ({ ...s })));
  }
}
