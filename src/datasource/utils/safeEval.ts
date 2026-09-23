const SAFE_EXPR_RE = /^[a-zA-Z0-9_$.\[\]'"()\s+\-*/%<>=!&|?:,]+$/;
const BLOCKED_KEYWORDS = /\b(import|export|require|eval|Function|fetch|XMLHttpRequest|WebSocket|process|globalThis|window|document)\b/i;

export function createSafeFunction<TArgs extends unknown[], TResult>(
  argNames: string[],
  expression: string,
): ((...args: TArgs) => TResult) | undefined {
  if (!SAFE_EXPR_RE.test(expression) || BLOCKED_KEYWORDS.test(expression)) {
    console.warn(`[SafeEval] Expression rejected (unsafe): ${expression}`);
    return undefined;
  }

  try {
    const fn = new Function(...argNames, `"use strict"; return (${expression});`) as (...args: TArgs) => TResult;
    return fn;
  } catch {
    console.warn(`[SafeEval] Failed to compile expression: ${expression}`);
    return undefined;
  }
}

export function safeTransform(expression: string): ((value: unknown) => unknown) | undefined {
  return createSafeFunction<[unknown], unknown>(['value'], expression);
}

export function safeFilter(expression: string): ((item: unknown) => boolean) | undefined {
  return createSafeFunction<[unknown], boolean>(['item'], expression);
}

export function safeAggregate(expression: string): ((values: unknown) => unknown) | undefined {
  return createSafeFunction<[unknown], unknown>(['values'], expression);
}

export function safeRowTransform(expression: string): ((row: unknown) => unknown) | undefined {
  return createSafeFunction<[unknown], unknown>(['row'], expression);
}

export function safeDataTransform(expression: string): ((data: unknown) => unknown) | undefined {
  return createSafeFunction<[unknown], unknown>(['data'], expression);
}
