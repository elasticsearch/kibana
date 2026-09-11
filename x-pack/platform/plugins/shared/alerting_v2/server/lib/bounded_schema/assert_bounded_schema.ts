/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { MAX_BUILDER_FIELDS_ARRAY_ITEMS } from '@kbn/alerting-v2-constants';
import { MAX_BUILDER_FIELDS_KEYS } from '@kbn/alerting-v2-schemas';

type JsonSchemaNode = Record<string, unknown>;

export interface BoundedSchemaLimits {
  stringLength: number;
  arrayItems: number;
  totalBytes: number;
}

export interface BoundedSchemaSubject {
  kind: string;
  schemaProperty: string;
  rootPath: string;
  limits: BoundedSchemaLimits;
  /**
   * When true, runs builder-type-specific check 3 extensions:
   *   - Rejects `.default()`, `.transform()`, `.pipe()`, and `.catch()` in the
   *     Zod tree (no-defaults/no-transforms rule).
   *   - Rejects the `default` JSON-Schema keyword.
   *   - Enforces the top-level 64-key cap.
   *
   * These checks are scoped to builder schemas only and must NOT run for
   * artifact schemas or other callers.
   *
   * Ref: rule-validation.md "No defaults, no transforms"
   *      rule-type-registration.md "Registration-time checks" item 3
   */
  builderChecks?: boolean;
}

type Ctx = BoundedSchemaSubject & { typeName: string };

const prefix = (ctx: Ctx): string => `${ctx.kind} "${ctx.typeName}" ${ctx.schemaProperty}`;

export function assertBoundedSchema(
  schema: z.ZodType,
  typeName: string,
  subject: BoundedSchemaSubject
): void {
  const ctx: Ctx = { ...subject, typeName };

  // Check 3 (companion walk): reject Zod wrapper types that make the parsed
  // value differ from the input — defaults, transforms (.transform()/.pipe()),
  // and catch fallbacks. Transforms are invisible on the input side of the
  // JSON-Schema projection, so they must be caught in the Zod tree itself.
  // Builder-schemas only: skipped for artifact types and other non-builder callers.
  if (ctx.builderChecks) {
    assertNoDefaultsOrTransforms(schema, ctx.rootPath, ctx);
  }

  let json: JsonSchemaNode;
  try {
    // `input` io bounds what a client may send, and is the only mode that tells a
    // stripping `z.object()` (no `additionalProperties`) apart from a closed
    // `.strict()` one (`additionalProperties: false`). Under `output` io both emit
    // `false`, so a stripping object would register while silently accepting — and
    // persisting, since the raw value is stored — undeclared fields.
    json = z.toJSONSchema(schema, { io: 'input' }) as JsonSchemaNode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${prefix(ctx)} cannot be converted to JSON Schema: ${message}`);
  }

  const worstCaseBytes = assertBoundedNode(json, ctx.rootPath, ctx, new Set());
  if (worstCaseBytes > ctx.limits.totalBytes) {
    throw new Error(
      `${prefix(ctx)} worst-case size ${worstCaseBytes} exceeds framework cap ${
        ctx.limits.totalBytes
      }`
    );
  }
}

// ---------------------------------------------------------------------------
// Companion Zod tree walk: check 3 no-defaults/no-transforms rule
// ---------------------------------------------------------------------------

/**
 * Walks the Zod schema tree and rejects any construct that causes the parsed
 * value to differ from the raw input:
 *
 * - ZodDefault (.default()) and ZodCatch (.catch()) — rejected by kind
 * - ZodPipe (.transform() and .pipe()) — rejected by kind
 * - z.coerce.* — rejected via _def.coerce === true (the type name stays
 *   "string"/"number"/etc., so the kind alone is not enough)
 * - Value-rewriting string checks (.trim(), .toLowerCase(), .normalize(), etc.)
 *   — rejected by inspecting _def.checks for entries whose _zod.def.check is
 *   "overwrite" (the internal Zod v4 discriminant for all string overwrites)
 *
 * The walk fails closed: node kinds that are not explicitly whitelisted below
 * are rejected rather than silently walked past. This is required because an
 * unwalked wrapper (e.g. .readonly() or .lazy()) can hide banned constructs
 * that would otherwise escape detection.
 *
 * Whitelisted node kinds:
 *   - Recursive: object, array, optional, nullable, union, readonly
 *   - Leaf (no inner schemas): string, number, boolean, null, enum, literal
 *
 * Ref: rule-validation.md "No defaults, no transforms"
 */
function assertNoDefaultsOrTransforms(schema: z.ZodType, path: string, ctx: Ctx): void {
  // Access the internal Zod v4 definition. The _def property is the runtime
  // representation; its `type` discriminates the schema kind.
  const s = schema as unknown as {
    _def?: {
      type?: string;
      coerce?: boolean;
      checks?: Array<{ _zod?: { def?: { check?: string } } }>;
      shape?: Record<string, z.ZodType>;
      element?: z.ZodType;
      innerType?: z.ZodType;
      options?: z.ZodType[];
    };
  };
  const def = s._def;
  if (!def) return;

  const typeName = def.type;

  // Reject coercion regardless of the base type kind: z.coerce.string(),
  // z.coerce.number(), etc. keep _def.type as "string"/"number"/etc. but set
  // _def.coerce = true to signal that inputs are cast before parsing.
  if (def.coerce === true) {
    throw new Error(
      `${prefix(ctx)} at ${path}: z.coerce.* is not allowed; ` +
        `builder schemas must not coerce inputs (the stored value must be exactly what the caller sent)`
    );
  }

  if (typeName === 'default') {
    throw new Error(
      `${prefix(ctx)} at ${path}: .default() is not allowed; ` +
        `builder schemas must not carry defaults (defaults belong in the API layer)`
    );
  }
  if (typeName === 'pipe') {
    throw new Error(
      `${prefix(ctx)} at ${path}: .transform() and .pipe() are not allowed; ` +
        `builder schemas must not carry transforms`
    );
  }
  if (typeName === 'catch') {
    throw new Error(
      `${prefix(ctx)} at ${path}: .catch() is not allowed; ` +
        `builder schemas must not carry catch fallbacks`
    );
  }

  if (typeName === 'object') {
    if (def.shape) {
      for (const [key, child] of Object.entries(def.shape)) {
        assertNoDefaultsOrTransforms(child, `${path}.${key}`, ctx);
      }
    }
    return;
  }

  if (typeName === 'array') {
    if (def.element) {
      assertNoDefaultsOrTransforms(def.element, `${path}[]`, ctx);
    }
    return;
  }

  if (typeName === 'optional' || typeName === 'nullable' || typeName === 'readonly') {
    if (def.innerType) {
      assertNoDefaultsOrTransforms(def.innerType, path, ctx);
    }
    return;
  }

  if (typeName === 'union') {
    if (def.options) {
      for (let i = 0; i < def.options.length; i++) {
        assertNoDefaultsOrTransforms(def.options[i], `${path}|${i}`, ctx);
      }
    }
    return;
  }

  if (typeName === 'string') {
    // Reject value-rewriting string checks: .trim(), .toLowerCase(),
    // .normalize(), etc. In Zod v4 these are stored as entries in _def.checks
    // whose internal discriminant (_zod.def.check) is "overwrite".
    if (Array.isArray(def.checks)) {
      for (const check of def.checks) {
        if (check?._zod?.def?.check === 'overwrite') {
          throw new Error(
            `${prefix(ctx)} at ${path}: value-rewriting string checks ` +
              `(.trim(), .toLowerCase(), .normalize(), etc.) are not allowed; ` +
              `builder schemas must not modify input values`
          );
        }
      }
    }
    return;
  }

  // Explicit leaf types: no inner schemas, no checks that rewrite values.
  if (
    typeName === 'number' ||
    typeName === 'boolean' ||
    typeName === 'null' ||
    typeName === 'enum' ||
    typeName === 'literal'
  ) {
    return;
  }

  // Fail closed: an unknown node kind may hide a banned construct (e.g. a
  // .lazy() wrapping a .transform()). Reject rather than silently walk past.
  throw new Error(
    `${prefix(ctx)} at ${path}: unsupported schema kind "${String(typeName)}"; ` +
      `builder schemas may only use string, number, boolean, null, literal, enum, ` +
      `object (.strict()), array, optional, nullable, union, and readonly`
  );
}

// ---------------------------------------------------------------------------
// JSON-Schema walk: bounds verification and default-keyword rejection
// ---------------------------------------------------------------------------

function assertBoundedNode(
  node: JsonSchemaNode,
  path: string,
  ctx: Ctx,
  seen: Set<JsonSchemaNode>
): number {
  if (seen.has(node)) {
    throw new Error(`${prefix(ctx)} at ${path} is recursive; recursive schemas are not supported`);
  }
  seen.add(node);

  if (typeof node.$ref === 'string') {
    throw new Error(
      `${prefix(ctx)} at ${path} uses $ref; recursive / deferred schemas are not supported`
    );
  }

  // Check 3: reject the `default` keyword — surfaces from .default() and
  // .catch(). Transforms (.transform()/.pipe()) are invisible here and are
  // caught by the companion Zod walk above.
  // Builder-schemas only: skipped for artifact types and other non-builder callers.
  if (ctx.builderChecks && node.default !== undefined) {
    throw new Error(
      `${prefix(ctx)} at ${path} has a default value; ` +
        `builder schemas must not carry defaults or catch fallbacks ` +
        `(use .default() and .catch() only in the API layer)`
    );
  }

  // Literal sets (z.literal / z.enum) are inherently bounded: the worst case
  // is the longest literal, serialized.
  const literals = literalValues(node);
  if (literals !== undefined) {
    if (literals.length === 0) {
      throw new Error(`${prefix(ctx)} at ${path} has an empty enum`);
    }
    return Math.max(...literals.map((value) => (JSON.stringify(value) ?? 'null').length));
  }

  // Unions (z.union, .nullable()) are bounded by their largest branch; every
  // branch must itself be bounded.
  const branches = unionBranches(node);
  if (branches !== undefined) {
    if (branches.length === 0) {
      throw new Error(`${prefix(ctx)} at ${path} has an empty union`);
    }
    return Math.max(
      ...branches.map((branch, index) => assertBoundedNode(branch, `${path}|${index}`, ctx, seen))
    );
  }

  if (node.allOf !== undefined || node.not !== undefined) {
    throw new Error(
      `${prefix(
        ctx
      )} at ${path} uses allOf/not; supported constructs are strict objects, bounded strings/arrays, numbers, booleans, enums/literals, and unions`
    );
  }

  // Zod maps z.any() / z.unknown() to unconstrained {} (no type).
  if (node.type === undefined && node.properties === undefined) {
    throw new Error(
      `${prefix(ctx)} at ${path} is unconstrained (z.any / z.unknown are not allowed)`
    );
  }

  const type = node.type;
  if (type === 'string') {
    return assertBoundedString(node, path, ctx);
  }
  if (type === 'array') {
    return assertBoundedArray(node, path, ctx, seen);
  }
  if (type === 'object') {
    return assertBoundedObject(node, path, ctx, seen);
  }
  if (type === 'number' || type === 'integer' || type === 'boolean' || type === 'null') {
    // Fixed-width JSON tokens; charge a small constant.
    return 16;
  }

  throw new Error(`${prefix(ctx)} at ${path} has unsupported JSON Schema type ${String(type)}`);
}

function literalValues(node: JsonSchemaNode): unknown[] | undefined {
  if (node.const !== undefined) {
    return [node.const];
  }
  if (Array.isArray(node.enum)) {
    return node.enum;
  }
  return undefined;
}

function unionBranches(node: JsonSchemaNode): JsonSchemaNode[] | undefined {
  const branches = node.anyOf ?? node.oneOf;
  if (branches === undefined) {
    return undefined;
  }
  if (!Array.isArray(branches)) {
    return [];
  }
  return branches as JsonSchemaNode[];
}

/**
 * Returns true when `path` is the root path itself or a union-branch of it.
 *
 * Union branches of the root are paths of the form `${rootPath}|0`, `${rootPath}|0|1`,
 * etc. — only trailing `|N` index segments, no dot-separated key names. A path
 * like `${rootPath}.field|0` is a union *inside* a named key, not a root-level
 * branch, and this function returns false for it.
 *
 * Used by the top-level key count check (check 3) so that a `builderFieldsSchema`
 * that is a root-level discriminated union still gets its per-branch key count
 * verified at registration rather than silently deferring to the wire.
 */
function isAtRootLevel(path: string, rootPath: string): boolean {
  if (path === rootPath) return true;
  if (!path.startsWith(rootPath)) return false;
  const suffix = path.slice(rootPath.length);
  return /^(\|[0-9]+)+$/.test(suffix);
}

function assertBoundedString(node: JsonSchemaNode, path: string, ctx: Ctx): number {
  const maxLength = node.maxLength;
  if (typeof maxLength !== 'number') {
    throw new Error(`${prefix(ctx)} at ${path}: string is missing maxLength`);
  }
  if (maxLength > ctx.limits.stringLength) {
    throw new Error(
      `${prefix(ctx)} at ${path}: maxLength ${maxLength} exceeds framework cap ${
        ctx.limits.stringLength
      }`
    );
  }
  // Quote characters + content.
  return maxLength + 2;
}

function assertBoundedArray(
  node: JsonSchemaNode,
  path: string,
  ctx: Ctx,
  seen: Set<JsonSchemaNode>
): number {
  const maxItems = node.maxItems;
  if (typeof maxItems !== 'number') {
    throw new Error(`${prefix(ctx)} at ${path}: array is missing maxItems`);
  }
  if (maxItems > ctx.limits.arrayItems) {
    throw new Error(
      `${prefix(ctx)} at ${path}: maxItems ${maxItems} exceeds framework cap ${
        ctx.limits.arrayItems
      }`
    );
  }

  const items = node.items;
  if (items === undefined || typeof items !== 'object' || Array.isArray(items)) {
    throw new Error(`${prefix(ctx)} at ${path}: array items must be a single bounded schema`);
  }

  const elementBytes = assertBoundedNode(items as JsonSchemaNode, `${path}[]`, ctx, seen);
  // '[' ']' and commas between elements
  return 2 + maxItems * elementBytes + Math.max(0, maxItems - 1);
}

function assertBoundedObject(
  node: JsonSchemaNode,
  path: string,
  ctx: Ctx,
  seen: Set<JsonSchemaNode>
): number {
  if (node.additionalProperties !== false) {
    throw new Error(
      `${prefix(
        ctx
      )} at ${path}: object must be closed (use .strict(); additionalProperties must be false)`
    );
  }

  // Unbounded records use additionalProperties: <schema> rather than false.
  // The check above already rejects those.

  const properties = (node.properties ?? {}) as Record<string, JsonSchemaNode>;

  // Check 3: top-level key count. The wire schema enforces this cap at
  // request time via MAX_BUILDER_FIELDS_KEYS; registration proves it
  // statically so violations surface at setup rather than at the first
  // write. Using the same constant ensures that changing the wire cap also
  // changes the registration cap atomically — the two cannot drift apart.
  //
  // Builder-schemas only, and applied at the root level (the path equals
  // rootPath) or at a union branch of the root (path = "${rootPath}|N..."
  // with only trailing union-index suffixes). A root-level union of strict
  // objects must have its key count checked in every branch, because each
  // branch is a candidate root that a caller may send.
  //
  // Ref: rule-type-registration.md "Registration-time checks" item 3
  if (ctx.builderChecks && isAtRootLevel(path, ctx.rootPath)) {
    const keyCount = Object.keys(properties).length;
    if (keyCount > MAX_BUILDER_FIELDS_KEYS) {
      throw new Error(
        `${prefix(ctx)} at ${path}: top-level key count ${keyCount} exceeds ` +
          `framework cap ${MAX_BUILDER_FIELDS_KEYS}`
      );
    }
  }

  let total = 2; // `{` `}`
  let first = true;
  for (const [key, child] of Object.entries(properties)) {
    const childBytes = assertBoundedNode(child, `${path}.${key}`, ctx, seen);
    const keyBytes = key.length + 2; // quoted key
    total += (first ? 0 : 1) + keyBytes + 1 + childBytes; // comma + "key":value
    first = false;
  }
  return total;
}
