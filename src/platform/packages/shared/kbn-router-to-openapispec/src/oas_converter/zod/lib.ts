/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z, isZod } from '@kbn/zod';
import { isPassThroughAny } from '@kbn/zod-helpers/v4';
import type { OpenAPIV3 } from 'openapi-types';

import type { ConvertOptions, KnownParameters } from '../../type';
import { getXState } from '../../util';
import { validatePathParameters } from '../common';
import { collapseArrayUnion } from '../collapse_array_union';

// Adapted from from https://github.com/jlalmes/trpc-openapi/blob/aea45441af785518df35c2bc173ae2ea6271e489/src/utils/zod.ts#L1

const createError = (message: string): Error => {
  return new Error(`[Zod converter] ${message}`);
};

function assertInstanceOfZodType(schema: unknown): asserts schema is z.ZodTypeAny {
  if (!isZod(schema)) {
    throw createError('Expected schema to be an instance of Zod');
  }
}

// ---------------------------------------------------------------------------
// Type detection helpers
// ---------------------------------------------------------------------------

/** Get the def type string from a schema (e.g. "object", "string", "optional") */
function getDefType(schema: any): string | undefined {
  return schema?._zod?.def?.type;
}

const instanceofZodTypeObject = (type: z.ZodTypeAny): type is z.ZodObject<z.ZodRawShape> => {
  return getDefType(type) === 'object';
};

const instanceofZodTypeLikeVoid = (type: z.ZodTypeAny): boolean => {
  const defType = getDefType(type);
  return defType === 'void' || defType === 'undefined' || defType === 'never';
};

// ---------------------------------------------------------------------------
// Unwrap helpers
// ---------------------------------------------------------------------------

const unwrapZodLazy = (type: z.ZodTypeAny): z.ZodTypeAny => {
  if (getDefType(type) === 'lazy') {
    return unwrapZodLazy((type as any)._zod.def.getter());
  }
  return type;
};

const unwrapZodOptionalDefault = (
  type: z.ZodTypeAny
): {
  description: z.ZodTypeAny['description'];
  defaultValue: unknown;
  isOptional: boolean;
  innerType: z.ZodTypeAny;
} => {
  let description: z.ZodTypeAny['description'];
  let defaultValue: unknown;
  let isOptional = false;
  let innerType = type;

  while (true) {
    const defType = getDefType(innerType);
    if (defType === 'optional') {
      isOptional = true;
      description = !description ? (innerType as any).description : description;
      innerType = (innerType as any)._zod.def.innerType;
    } else if (defType === 'default') {
      defaultValue = (innerType as any)._zod.def.defaultValue;
      if (typeof defaultValue === 'function') {
        defaultValue = (defaultValue as () => unknown)();
      }
      description = !description ? (innerType as any).description : description;
      innerType = (innerType as any)._zod.def.innerType;
    } else {
      break;
    }
  }

  return { description, defaultValue, isOptional, innerType };
};

/**
 * Unwrap Zod schemas to find the underlying type.
 *
 * Uses "pipe" instead of "effects". The heuristic for pipes:
 * - If `out._zod.def.type === 'transform'`, the original schema is in `in` (e.g. z.string().transform(fn))
 * - Otherwise, the meaningful schema is in `out` (e.g. DeepStrict wrapping: pipe(unknown.check(), schema))
 */
const unwrapZodType = (type: z.ZodTypeAny, unwrapPreprocess: boolean): z.ZodTypeAny => {
  const defType = getDefType(type);

  if (defType === 'lazy') {
    return unwrapZodType(unwrapZodLazy(type), unwrapPreprocess);
  }

  if (defType === 'optional' || defType === 'default') {
    const { innerType } = unwrapZodOptionalDefault(type);
    return unwrapZodType(innerType, unwrapPreprocess);
  }

  if (defType === 'pipe') {
    const pipeIn = (type as any)._zod.def.in;
    const pipeOut = (type as any)._zod.def.out;

    // If out is a transform, the real schema is in `in`
    if (getDefType(pipeOut) === 'transform') {
      return unwrapZodType(pipeIn, unwrapPreprocess);
    }
    // Otherwise (e.g. DeepStrict: pipe(unknown.check(), schema)), the real schema is in `out`
    return unwrapZodType(pipeOut, unwrapPreprocess);
  }

  // Handle standalone transform: the input schema is not accessible, treat as pass-through
  if (defType === 'transform') {
    return type;
  }

  // Handle prefault (equivalent of preprocess)
  if (defType === 'prefault') {
    if (unwrapPreprocess) {
      const innerType = (type as any)._zod.def.innerType;
      if (innerType) {
        return unwrapZodType(innerType, unwrapPreprocess);
      }
    }
    return type;
  }

  return type;
};

// ---------------------------------------------------------------------------
// String-like and coercible type detection
// ---------------------------------------------------------------------------

const instanceofZodTypeCoercible = (_type: z.ZodTypeAny): boolean => {
  const type = unwrapZodType(_type, false);
  const defType = getDefType(type);
  return (
    defType === 'number' || defType === 'boolean' || defType === 'bigint' || defType === 'date'
  );
};

const instanceofZodTypeLikeString = (_type: z.ZodTypeAny, allowMixedUnion: boolean): boolean => {
  const type = unwrapZodType(_type, false);
  const defType = getDefType(type);

  // prefault (equivalent of preprocess effect)
  if (defType === 'prefault') {
    return true;
  }

  if (defType === 'union') {
    const options: any[] = (type as any)._zod.def.options;
    return !options.some(
      (option) =>
        !instanceofZodTypeLikeString(option, allowMixedUnion) &&
        !(allowMixedUnion && instanceofZodTypeCoercible(option))
    );
  }

  if (defType === 'array') {
    return instanceofZodTypeLikeString((type as any)._zod.def.element, allowMixedUnion);
  }

  if (defType === 'intersection') {
    return (
      instanceofZodTypeLikeString((type as any)._zod.def.left, allowMixedUnion) &&
      instanceofZodTypeLikeString((type as any)._zod.def.right, allowMixedUnion)
    );
  }

  if (defType === 'literal') {
    const values: unknown[] = (type as any)._zod.def.values;
    return values.every((v) => typeof v === 'string');
  }

  if (defType === 'enum') {
    const entries = (type as any)._zod.def.entries;
    if (entries && typeof entries === 'object') {
      return !Object.values(entries).some((value) => typeof value === 'number');
    }
    return true;
  }

  // "string" covers both z.string() and z.iso.datetime(), z.email(), etc.
  return defType === 'string';
};

// ---------------------------------------------------------------------------
// Converter functions
// ---------------------------------------------------------------------------

const convertObjectMembersToParameterObjects = (
  shape: z.ZodRawShape,
  isPathParameter = false,
  knownParameters: KnownParameters = {}
): OpenAPIV3.ParameterObject[] => {
  return Object.entries(shape).map(([shapeKey, subShape]) => {
    const typeWithoutLazy = unwrapZodLazy(subShape as z.ZodTypeAny);
    const {
      description: outerDescription,
      isOptional,
      defaultValue,
      innerType: typeWithoutOptionalDefault,
    } = unwrapZodOptionalDefault(typeWithoutLazy);

    // Except for path parameters, OpenAPI supports mixed unions with `anyOf` e.g. for query parameters
    if (!instanceofZodTypeLikeString(typeWithoutOptionalDefault, !isPathParameter)) {
      if (!instanceofZodTypeCoercible(typeWithoutOptionalDefault)) {
        throw createError(
          `Input parser key: "${shapeKey}" must be ZodString, ZodNumber, ZodBoolean, ZodBigInt or ZodDate`
        );
      }
    }

    const {
      schema: { description: schemaDescription, ...openApiSchemaObject },
    } = convert(typeWithoutOptionalDefault);

    if (typeof defaultValue !== 'undefined') {
      openApiSchemaObject.default = defaultValue;
    }

    const finalSchema = !isPathParameter
      ? collapseArrayUnion(openApiSchemaObject)
      : openApiSchemaObject;

    return {
      name: shapeKey,
      in: isPathParameter ? 'path' : 'query',
      required: isPathParameter ? !knownParameters[shapeKey]?.optional : !isOptional,
      schema: finalSchema,
      description: outerDescription || schemaDescription,
    };
  });
};

// Returns a z.ZodRawShape to passes through all known parameters with z.any
const getPassThroughShape = (knownParameters: KnownParameters, isPathParameter = false) => {
  const passThroughShape: Record<string, z.ZodTypeAny> = {};
  for (const [key, { optional }] of Object.entries(knownParameters)) {
    passThroughShape[key] = optional && !isPathParameter ? z.string().optional() : z.string();
  }
  return passThroughShape as z.ZodRawShape;
};

export const convertQuery = (schema: unknown) => {
  assertInstanceOfZodType(schema);
  const unwrappedSchema = unwrapZodType(schema, true);

  if (isPassThroughAny(unwrappedSchema)) {
    return {
      query: convertObjectMembersToParameterObjects(getPassThroughShape({}, false), true),
      shared: {},
    };
  }

  if (!instanceofZodTypeObject(unwrappedSchema)) {
    throw createError('Query schema must be an _object_ schema validator!');
  }
  return {
    query: convertObjectMembersToParameterObjects(unwrappedSchema.shape, false),
    shared: {},
  };
};

export const convertPathParameters = (schema: unknown, knownParameters: KnownParameters) => {
  assertInstanceOfZodType(schema);
  const unwrappedSchema = unwrapZodType(schema, true);
  const paramKeys = Object.keys(knownParameters);
  const paramsCount = paramKeys.length;

  if (paramsCount === 0 && instanceofZodTypeLikeVoid(unwrappedSchema)) {
    return { params: [], shared: {} };
  }

  if (isPassThroughAny(unwrappedSchema)) {
    return {
      params: convertObjectMembersToParameterObjects(
        getPassThroughShape(knownParameters, true),
        true
      ),
      shared: {},
    };
  }

  if (!instanceofZodTypeObject(unwrappedSchema)) {
    throw createError('Parameters schema must be an _object_ schema validator!');
  }
  const schemaKeys = Object.keys(unwrappedSchema.shape);
  validatePathParameters(paramKeys, schemaKeys);
  return {
    params: convertObjectMembersToParameterObjects(unwrappedSchema.shape, true),
    shared: {},
  };
};

/**
 * Apply the same JSON description extraction that zod-to-json-schema's jsonDescription does.
 * If a schema description is valid JSON, spread its parsed fields into the schema object.
 */
function applyJsonDescription(jsonSchema: Record<string, any>, description?: string) {
  if (description) {
    try {
      return { ...jsonSchema, ...JSON.parse(description) };
    } catch {
      // not JSON, leave as-is
    }
  }
  return jsonSchema;
}

/**
 * Recursively add `additionalProperties: false` to object schema nodes that
 * don't already have an `additionalProperties` setting.
 *
 * z.toJSONSchema() only emits `additionalProperties: false` for .strict()
 * objects. Plain z.object() schemas reject extra keys at runtime — this
 * matches the @kbn/config-schema behaviour of always emitting it.
 */
function addAdditionalPropertiesFalse(node: Record<string, any>): Record<string, any> {
  if (typeof node !== 'object' || node === null) return node;

  if (
    (node.type === 'object' || (!node.type && node.properties)) &&
    !('additionalProperties' in node)
  ) {
    node = { ...node, additionalProperties: false };
  }

  if (node.properties && typeof node.properties === 'object') {
    const newProps: Record<string, any> = {};
    for (const [key, value] of Object.entries(node.properties)) {
      newProps[key] =
        typeof value === 'object' && value !== null
          ? addAdditionalPropertiesFalse(value as Record<string, any>)
          : value;
    }
    node = { ...node, properties: newProps };
  }

  for (const combiner of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(node[combiner])) {
      node = {
        ...node,
        [combiner]: node[combiner].map((branch: unknown) =>
          typeof branch === 'object' && branch !== null
            ? addAdditionalPropertiesFalse(branch as Record<string, any>)
            : branch
        ),
      };
    }
  }

  return node;
}

/**
 * Counter used to generate unique keys when hoisting `$defs` entries
 * from `z.toJSONSchema()` into OpenAPI `components/schemas`.
 * Ensures no key collisions across multiple `convert()` calls.
 */
let defsCounter = 0;

/** @internal Exposed for testing only — resets the `$defs` counter. */
export const resetDefsCounter = () => {
  defsCounter = 0;
};

/**
 * Internal marker injected into a Zod JSON schema node (via the `override`
 * callback) to carry the user-supplied OAS component name through the
 * conversion pipeline.  The key intentionally starts with `x-` so it is a
 * valid JSON-Schema extension and is easy to strip afterwards.
 */
const COMPONENT_ID_MARKER = 'x-kbn-oas-component-id';

/**
 * Maps Zod schema instances to their desired OAS `components/schemas` names.
 * Uses a WeakMap so schema objects can be GC-ed when no longer referenced.
 */
const zodV4OasComponentRegistry = new WeakMap<object, string>();

const OAS_EXTENSIONS_MARKER = 'x-kbn-oas-extensions';

/**
 * Register a Zod schema so that the OAS converter emits it as a named
 * component (`$ref: '#/components/schemas/<name>'`) instead of inlining it.
 *
 * These fields are merged verbatim into the generated OAS component schema,
 * filling the gap where Zod/JSON Schema cannot express OAS-native concepts.
 *
 * Example:
 * ```ts
 * export const StreamDefinition = z.union([...]).meta({
 *   id: 'StreamDefinition',
 *   openapi: {
 *     discriminator: {
 *       propertyName: 'type',
 *       mapping: { wired: '#/components/schemas/WiredStreamDefinition' },
 *     },
 *   },
 * });
 * ```
 */
export interface OasMetaExtensions {
  discriminator?: OpenAPIV3.DiscriminatorObject;
  availability?: {
    stability?: 'experimental' | 'stable' | 'tech_preview';
    since?: string;
  };
}

type NormalizedOasMetaExtensions = Omit<OasMetaExtensions, 'availability'> & {
  'x-state'?: string;
};

/**
 * Reads the stable OAS component name for a Zod v4 schema, if one was declared
 * via `.meta({ id: '<name>' })` on the schema.
 *
 * The name must be unique across all schemas in the document and follow OpenAPI
 * component naming rules: `[a-zA-Z0-9._-]+`.
 */
export const registerZodV4Component = (schema: z.ZodType, name: string): void => {
  zodV4OasComponentRegistry.set(schema as object, name);
};

interface ZodSchemaMeta {
  id?: string;
  openapi?: OasMetaExtensions;
}

const getZodMeta = (schema: z.ZodType): ZodSchemaMeta =>
  (z.globalRegistry.get(schema) ?? {}) as ZodSchemaMeta;

const getStableComponentName = (schema: z.ZodType): string | undefined =>
  zodV4OasComponentRegistry.get(schema as object) ?? getZodMeta(schema).id;

function normalizeOasMetaExtensions(
  schema: z.ZodType,
  env: ConvertOptions['env']
): NormalizedOasMetaExtensions | undefined {
  const { openapi: meta } = getZodMeta(schema);
  const autoDisc = meta?.discriminator ? null : buildAutoDiscriminator(schema);
  const autoDiscriminator = autoDisc?.discriminator;
  const { availability, ...rest } = meta ?? {};
  const xState = getXState(availability, env ?? { serverless: false });
  const extensions = {
    ...rest,
    ...(autoDiscriminator ? { discriminator: autoDiscriminator } : {}),
    ...(xState !== undefined ? { 'x-state': xState } : {}),
  };

  return Object.keys(extensions).length > 0 ? extensions : undefined;
}

/**
 * For `z.discriminatedUnion` schemas, auto-generate an OAS discriminator
 * with property name and (when every variant has a stable component name) a
 * mapping.  Returns `null` for non-discriminated schemas.
 */
function buildAutoDiscriminator(schema: z.ZodType): OasMetaExtensions | null {
  const { discriminator: key, options } = (schema as any)._zod?.def ?? {};
  if (typeof key !== 'string' || !Array.isArray(options)) return null;

  const mapping: Record<string, string> = {};
  let allNamed = true;

  for (const opt of options) {
    const name = getStableComponentName(opt);
    if (!name) {
      allNamed = false;
      continue;
    }
    const litValues = opt._zod?.def?.shape?.[key]?._zod?.def?.values;
    if (Array.isArray(litValues) && litValues.length === 1) {
      mapping[String(litValues[0])] = `#/components/schemas/${name}`;
    }
  }

  const disc: OpenAPIV3.DiscriminatorObject = { propertyName: key };
  if (allNamed && Object.keys(mapping).length > 0) {
    disc.mapping = mapping;
  }
  return { discriminator: disc };
}

/**
 * Recursively rewrite every `$ref` value that starts with `#/$defs/`
 * to point to `#/components/schemas/<uniqueKey>` instead.
 */
function rewriteDefsRefs(obj: unknown, replacements: Record<string, string>): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) return obj.map((item) => rewriteDefsRefs(item, replacements));

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === '$ref' && typeof value === 'string' && replacements[value]) {
      result[key] = replacements[value];
    } else {
      result[key] = rewriteDefsRefs(value, replacements);
    }
  }
  return result;
}

/**
 * Extract `$defs` from a JSON Schema produced by `z.toJSONSchema()`, move
 * the entries into `shared` (→ `components/schemas`), and rewrite all
 * `$ref: '#/$defs/...'` pointers so they resolve correctly in the OpenAPI
 * document root.
 *
 * When a `$defs` entry carries the `COMPONENT_ID_MARKER` property (injected by
 * the `override` callback for schemas that declare `.meta({ id })`), that stable
 * name is used instead of the auto-generated `_zod_v4_{batchId}_{key}` name.
 */
function extractDefsToShared(
  defs: Record<string, unknown>,
  jsonSchema: Record<string, unknown>
): { schema: Record<string, unknown>; shared: Record<string, OpenAPIV3.SchemaObject> } {
  const batchId = defsCounter++;
  const replacements: Record<string, string> = {};
  const shared: Record<string, OpenAPIV3.SchemaObject> = {};

  for (const [key, value] of Object.entries(defs)) {
    const def = value as Record<string, unknown>;

    const stableId =
      typeof def[COMPONENT_ID_MARKER] === 'string' ? (def[COMPONENT_ID_MARKER] as string) : null;

    const uniqueKey = stableId ?? `_zod_v4_${batchId}_${key}`;

    replacements[`#/$defs/${key}`] = `#/components/schemas/${uniqueKey}`;

    if (stableId) {
      const {
        [COMPONENT_ID_MARKER]: _idMarker,
        [OAS_EXTENSIONS_MARKER]: oasExt,
        openapi: _openapi,
        ...rest
      } = def;

      shared[uniqueKey] = {
        ...rest,
        ...(oasExt as OasMetaExtensions | undefined),
      } as OpenAPIV3.SchemaObject;
    } else {
      const { [OAS_EXTENSIONS_MARKER]: _ext, openapi: _openapi, ...rest } = def;
      shared[uniqueKey] = rest as OpenAPIV3.SchemaObject;
    }
  }

  // Rewrite $ref paths in the main schema
  const fixedSchema = rewriteDefsRefs(jsonSchema, replacements) as Record<string, unknown>;

  // Rewrite $ref paths inside the shared definitions too (recursive schemas
  // reference themselves via $defs pointers)
  for (const [key, value] of Object.entries(shared)) {
    shared[key] = rewriteDefsRefs(value, replacements) as OpenAPIV3.SchemaObject;
  }

  return { schema: fixedSchema, shared };
}

/**
 * Recursively traverse a (post-processed) JSON schema and extract any nodes
 * that still carry the `COMPONENT_ID_MARKER`.  This covers the case where a
 * registered schema appears exactly once (so Zod inlined it rather than
 * placing it in `$defs`): we still want it as a named OAS component.
 *
 * Marked nodes are moved into `shared` and replaced with a `$ref`.
 */
function hoistMarkedSchemas(
  node: unknown,
  shared: Record<string, OpenAPIV3.SchemaObject>
): unknown {
  if (typeof node !== 'object' || node === null) {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item) => hoistMarkedSchemas(item, shared));
  }

  const obj = node as Record<string, unknown>;

  // $ref nodes are already references — don't recurse into them
  if ('$ref' in obj) {
    return obj;
  }

  const name = obj[COMPONENT_ID_MARKER];

  if (typeof name === 'string') {
    const {
      [COMPONENT_ID_MARKER]: _idMarker,
      [OAS_EXTENSIONS_MARKER]: oasExt,
      openapi: _openapi,
      ...rest
    } = obj;

    // Recursively handle nested marked schemas within this node first
    const processed: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(rest)) {
      processed[k] = hoistMarkedSchemas(v, shared);
    }

    shared[name] = {
      ...processed,
      ...(oasExt as OasMetaExtensions | undefined),
    } as OpenAPIV3.SchemaObject;

    return { $ref: `#/components/schemas/${name}` };
  }

  const result: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(obj)) {
    result[k] = hoistMarkedSchemas(v, shared);
  }

  return result;
}

function mergeInlineOasExtensions(node: unknown): unknown {
  if (typeof node !== 'object' || node === null) {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item) => mergeInlineOasExtensions(item));
  }

  const obj = node as Record<string, unknown>;
  if ('$ref' in obj) {
    return obj;
  }

  const { [OAS_EXTENSIONS_MARKER]: oasExt, openapi: _openapi, ...rest } = obj;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rest)) {
    result[key] = mergeInlineOasExtensions(value);
  }

  if (oasExt && typeof oasExt === 'object') {
    Object.assign(result, oasExt);
  }

  return result;
}

/**
 * Recursively transform a JSON Schema object (OAS 3.1 / JSON Schema draft 2020-12)
 * into an OpenAPI 3.0-compatible Schema Object.
 *
 * Once we start offering an OAS 3.1 schema, this can be removed. Zod v4 exports OAS 3.1 by default.
 *
 * Transformations applied:
 * - `type: 'null'`  → removed, and `nullable: true` is set on the parent/sibling
 * - `const: value`  → `enum: [value]`
 * - `propertyNames`  → removed (not supported in OAS 3.0)
 * - `anyOf`/`oneOf` containing `{ type: 'null' }` → collapsed into `nullable: true`
 */
function jsonSchemaToOpenApi30(node: Record<string, unknown>): Record<string, unknown> {
  if (typeof node !== 'object' || node === null) return node;

  let result: Record<string, unknown> = {};

  const hasPropertyNames = 'propertyNames' in node;

  for (const [key, value] of Object.entries(node)) {
    // Strip `propertyNames` (not supported in OAS 3.0)
    if (key === 'propertyNames') continue;
    // Strip companion `required` emitted by z.toJSONSchema() for z.record(z.enum([...]), ...)
    if (key === 'required' && hasPropertyNames) continue;

    // `const: value` → `enum: [value]`
    if (key === 'const') {
      result.enum = [value];
      continue;
    }

    // Recursively process arrays and objects
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
          ? jsonSchemaToOpenApi30(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = jsonSchemaToOpenApi30(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  // Handle `anyOf`/`oneOf` containing `{ type: 'null' }` branches:
  // Pull out the null branch and set `nullable: true` on the remaining schema.
  for (const combiner of ['anyOf', 'oneOf'] as const) {
    const branches = result[combiner];
    if (!Array.isArray(branches)) continue;

    const nullIdx = branches.findIndex(
      (b: unknown) =>
        typeof b === 'object' &&
        b !== null &&
        (b as Record<string, unknown>).type === 'null' &&
        Object.keys(b as Record<string, unknown>).length === 1
    );

    if (nullIdx === -1) continue;

    // Remove the null branch
    const remaining = branches.filter((_: unknown, i: number) => i !== nullIdx);

    if (remaining.length === 1) {
      // Single remaining branch: merge it into the current level with nullable
      const [sole] = remaining;
      if (typeof sole === 'object' && sole !== null) {
        // Remove the combiner key, spread the sole schema, add nullable
        delete result[combiner];
        result = { ...result, ...(sole as Record<string, unknown>), nullable: true };
      }
    } else {
      // Multiple remaining branches: keep the combiner, add nullable
      result[combiner] = remaining;
      result.nullable = true;
    }
  }

  // Handle top-level `type: 'null'` (standalone null schema)
  if (result.type === 'null') {
    delete result.type;
    result.nullable = true;
  }

  return result;
}

export const convert = (schema: z.ZodTypeAny, opts: ConvertOptions = {}) => {
  const unwrapped = unwrapZodType(schema, true);

  // Use Zod's native toJSONSchema
  const raw = z.toJSONSchema(unwrapped as unknown as z.ZodType, {
    unrepresentable: 'any',
    io: 'input',
    override: ({ zodSchema, jsonSchema: js }) => {
      // z.never() is "unrepresentable" and gets converted to {} (any) by
      // the 'any' strategy. In JSON Schema / OpenAPI, the correct
      // representation of "never" is { not: {} }, so fix it up here.
      if ('_zod' in zodSchema && (zodSchema as any)._zod?.def?.type === 'never') {
        // Clear all existing keys and set { not: {} }
        for (const key of Object.keys(js)) {
          delete (js as any)[key];
        }
        (js as any).not = {};
        return;
      }

      const zSchema = zodSchema as unknown as z.ZodType;

      const stableName = getStableComponentName(zSchema);
      if (stableName) {
        (js as any)[COMPONENT_ID_MARKER] = stableName;
        delete (js as any).id;
      }

      const oasExtensions = normalizeOasMetaExtensions(zSchema, opts.env);
      if (oasExtensions) {
        (js as any)[OAS_EXTENSIONS_MARKER] = oasExtensions;
      }
    },
  }) as Record<string, any>;

  // Remove $schema (not valid inside OpenAPI schema objects)
  const { $schema, $defs, ...jsonSchema } = raw;

  let shared: Record<string, OpenAPIV3.SchemaObject> = {};
  let processedSchema: Record<string, unknown> = jsonSchema;

  // z.toJSONSchema() emits `$defs` for recursive schemas (e.g. FilterCondition
  // with self-referencing and/or/not). OpenAPI 3.0 doesn't support inline `$defs`
  // — refs must point to `#/components/schemas/...`. Extract them.
  if ($defs && typeof $defs === 'object' && Object.keys($defs).length > 0) {
    const extracted = extractDefsToShared($defs, jsonSchema);
    processedSchema = extracted.schema;
    shared = extracted.shared;
  }

  // Convert JSON Schema (OAS 3.1) constructs to OpenAPI 3.0 equivalents
  processedSchema = jsonSchemaToOpenApi30(processedSchema);
  for (const [key, value] of Object.entries(shared)) {
    shared[key] = jsonSchemaToOpenApi30(value as Record<string, unknown>) as OpenAPIV3.SchemaObject;
  }

  // Ensure z.object() schemas carry `additionalProperties: false`.
  // z.toJSONSchema() only adds this for .strict() objects, but plain z.object()
  // schemas reject extra keys at runtime — match the @kbn/config-schema behaviour.
  processedSchema = addAdditionalPropertiesFalse(processedSchema);
  for (const [key, value] of Object.entries(shared)) {
    shared[key] = addAdditionalPropertiesFalse(
      value as Record<string, any>
    ) as OpenAPIV3.SchemaObject;
  }

  // Convert JSON Schema (OAS 3.1) constructs to OpenAPI 3.0 equivalents
  processedSchema = jsonSchemaToOpenApi30(processedSchema);

  // Extract any registered schemas that were inlined by z.toJSONSchema()
  // (single-use, non-recursive schemas don't appear in $defs — we hoist them
  // here so they still become named components).
  processedSchema = hoistMarkedSchemas(processedSchema, shared) as Record<string, unknown>;
  processedSchema = mergeInlineOasExtensions(processedSchema) as Record<string, unknown>;

  for (const [key, value] of Object.entries(shared)) {
    shared[key] = mergeInlineOasExtensions(
      hoistMarkedSchemas(value, shared)
    ) as OpenAPIV3.SchemaObject;
  }

  // Apply the same JSON-description post-processing
  const description = (unwrapped as any).description;
  const processed = applyJsonDescription(processedSchema as Record<string, any>, description);

  return {
    shared,
    schema: processed as OpenAPIV3.SchemaObject,
  };
};

export const is = isZod;
