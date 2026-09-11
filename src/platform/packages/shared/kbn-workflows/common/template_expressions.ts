/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Matches a *whole-value* Liquid template expression such as `"${{ event.messages }}"` — the
 * only template form whose resolved value keeps its native type (array, object, number)
 * instead of being stringified.
 *
 * The shape is deliberately narrow, and each restriction mirrors the runtime in
 * `WorkflowTemplatingEngine.renderValueRecursively`:
 *
 * - **`$` is required.** The engine returns the raw evaluated value only for strings matching
 *   `startsWith('${{') && endsWith('}}')`. A bare `{{ expr }}` falls through to `renderString`
 *   and always comes back as a string, so it can never satisfy an array-typed param.
 * - **No leading or trailing whitespace.** That runtime check does not trim.
 * - **No inner `}}`.** `evaluateExpression` slices from the first `{{` to the last `}}`, so a
 *   concatenation like `"${{ a }}-${{ b }}"` would be parsed as the single invalid expression
 *   `a }}-${{ b` and throw at execution time.
 * - **A non-empty expression body.** `${{}}` evaluates nothing, and keeping it out also keeps
 *   this a subset of the `DYNAMIC_VALUE_REGEX` form that `parseWorkflowYamlToJSON` already
 *   tolerates, so widening a param can never admit a value the workflow YAML gate would reject.
 *
 * The invariant this encodes is one-directional: everything matched here is type-preserved at
 * runtime. The engine itself accepts a superset, and those extra forms stringify or throw —
 * which is exactly why callers should validate against this rather than re-deriving the shape.
 * `template_expressions_runtime.test.ts` in `workflows_execution_engine` pins the invariant.
 */
export const WHOLE_VALUE_TEMPLATE_EXPRESSION_REGEX =
  /^\$\{\{(?:(?!\}\})\s)*(?:(?!\}\})\S)(?:(?!\}\})[\s\S])*\}\}$/;

/**
 * Upper bound on a whole-value Liquid template expression accepted where a connector param
 * declares a non-string type. This is a sanity bound on a single YAML scalar, not a defence
 * against large workflow payloads — the branch it widens (the param's own array/object schema)
 * carries whatever bounds that connector declared, and this value does not change them.
 */
export const TEMPLATE_EXPRESSION_MAX_LENGTH = 500;

/**
 * Returns true when `value` is a whole-value Liquid template expression whose resolved value
 * keeps its native type at runtime. See {@link WHOLE_VALUE_TEMPLATE_EXPRESSION_REGEX}.
 */
export const isWholeValueTemplateExpression = (value: string): boolean =>
  WHOLE_VALUE_TEMPLATE_EXPRESSION_REGEX.test(value);
