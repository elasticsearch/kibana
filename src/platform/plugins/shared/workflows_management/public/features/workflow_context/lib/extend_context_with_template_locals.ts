/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document } from 'yaml';
import type { DynamicStepContextSchema } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import {
  forLoopScopesContainingOffset,
  getTemplateLocalContext,
  isLiquidRangeLiteral,
  resolveAssignChain,
  stripAssignRhsFilters,
} from './extract_template_local_context';
import { getForeachItemSchema } from './get_foreach_state_schema';
import { getScalarValueAtOffset } from '../../../../common/lib/yaml/get_scalar_value_at_offset';
import { getSchemaAtPath } from '../../../../common/lib/zod';

// ---------------------------------------------------------------------------
// Block scalar offset mapping
// ---------------------------------------------------------------------------

function detectBlockIndent(source: string, headerEnd: number): number {
  let i = headerEnd + 1;
  while (i < source.length && source[i] === '\n') i++;
  let indent = 0;
  while (i + indent < source.length && source[i + indent] === ' ') indent++;
  return indent;
}

/**
 * Maps a position within a block scalar's raw source text to the corresponding
 * position in its processed value string. Block scalars (| and >) strip the
 * header line and per-line indentation, so a naive offset subtraction
 * overestimates the position — potentially causing assigns *after* a variable
 * to appear as if they precede it.
 *
 * @param scalarSource - The `Scalar.source` string (header + indented content).
 * @param offsetInScalar - Position within `scalarSource` to map (i.e.
 *   `yamlDocumentOffset - scalarNode.range[0]`).
 * @param valueLength - Length of the parsed value string (used as upper clamp).
 *
 */
export interface MapBlockScalarSourceToValueOffsetOptions {
  /** When true, single newlines between content lines are folded into spaces (block folded `>` scalars). */
  readonly folded?: boolean;
}

/**
 * Maps a source offset within a block **folded** scalar to the corresponding offset in the
 * processed value string (newlines between lines become spaces; blank lines become newlines).
 */
function mapBlockFoldedScalarSourceToValueOffset(
  scalarSource: string,
  offsetInScalar: number,
  valueLength: number
): number {
  const headerEnd = scalarSource.indexOf('\n');
  if (headerEnd === -1 || offsetInScalar <= headerEnd) {
    return 0;
  }

  let contentStart = headerEnd + 1;
  while (contentStart < scalarSource.length && scalarSource[contentStart] === '\n') {
    contentStart++;
  }
  if (offsetInScalar <= contentStart) {
    return 0;
  }

  const detectedIndent = detectBlockIndent(scalarSource, headerEnd);
  let valuePos = 0;
  let lineStart = contentStart;

  while (lineStart < scalarSource.length && lineStart <= offsetInScalar) {
    let indentOnLine = 0;
    while (
      indentOnLine < detectedIndent &&
      lineStart + indentOnLine < scalarSource.length &&
      scalarSource[lineStart + indentOnLine] === ' '
    ) {
      indentOnLine++;
    }

    if (offsetInScalar <= lineStart + indentOnLine) {
      return Math.min(valuePos, valueLength);
    }

    const lineContentStart = lineStart + indentOnLine;
    const nextNewline = scalarSource.indexOf('\n', lineStart);
    const lineEnd = nextNewline === -1 ? scalarSource.length : nextNewline;
    const lineContent = scalarSource.slice(lineContentStart, lineEnd);
    const effectiveEnd = Math.min(lineEnd, offsetInScalar);
    const charsBeforeOffset = Math.max(0, effectiveEnd - lineContentStart);

    if (charsBeforeOffset > 0) {
      valuePos += charsBeforeOffset;
    }

    if (offsetInScalar <= lineEnd) {
      return Math.min(valuePos, valueLength);
    }

    if (nextNewline === -1) {
      break;
    }

    if (lineContent.trim() === '') {
      if (valuePos > 0) {
        valuePos += 1;
      }
    } else {
      valuePos += 1;
    }

    lineStart = nextNewline + 1;
  }

  return Math.min(valuePos, valueLength);
}

export function mapBlockScalarSourceToValueOffset(
  scalarSource: string,
  offsetInScalar: number,
  valueLength: number,
  options?: MapBlockScalarSourceToValueOffsetOptions
): number {
  if (options?.folded) {
    return mapBlockFoldedScalarSourceToValueOffset(scalarSource, offsetInScalar, valueLength);
  }

  const headerEnd = scalarSource.indexOf('\n');
  if (headerEnd === -1 || offsetInScalar <= headerEnd) return 0;
  const contentStart = headerEnd + 1;
  if (offsetInScalar <= contentStart) return 0;

  const detectedIndent = detectBlockIndent(scalarSource, headerEnd);

  if (detectedIndent === 0) {
    return Math.min(offsetInScalar - contentStart, valueLength);
  }

  let totalStripped = 0;
  let lineStart = contentStart;

  while (lineStart < offsetInScalar && lineStart < scalarSource.length) {
    let indentOnLine = 0;
    while (
      indentOnLine < detectedIndent &&
      lineStart + indentOnLine < scalarSource.length &&
      scalarSource[lineStart + indentOnLine] === ' '
    ) {
      indentOnLine++;
    }

    if (offsetInScalar <= lineStart + indentOnLine) {
      totalStripped += Math.min(indentOnLine, offsetInScalar - lineStart);
      break;
    }

    totalStripped += indentOnLine;

    const nextNewline = scalarSource.indexOf('\n', lineStart);
    if (nextNewline === -1 || nextNewline >= offsetInScalar) {
      break;
    }

    lineStart = nextNewline + 1;
  }

  return Math.min(Math.max(offsetInScalar - contentStart - totalStripped, 0), valueLength);
}

/** LiquidJS forloop object schema (index, index0, rindex, rindex0, first, last, length) */
const FORLOOP_SCHEMA = z.object({
  index: z.number(),
  index0: z.number(),
  rindex: z.number(),
  rindex0: z.number(),
  first: z.boolean(),
  last: z.boolean(),
  length: z.number(),
});

/** Matches a Liquid variable path (e.g. steps.x.outputs.value). */
const VARIABLE_PATH_REGEX = /^[\w.]+$/;

/** Matches a numeric literal. */
const NUMBER_LITERAL_REGEX = /^-?\d+(\.\d+)?$/;

function isExpressionBoolean(expression: string): boolean {
  return expression === 'true' || expression === 'false';
}

function isExpressionNumber(expression: string): boolean {
  return NUMBER_LITERAL_REGEX.test(expression);
}

function isExpressionString(expression: string): boolean {
  return (
    (expression.startsWith('"') && expression.endsWith('"')) ||
    (expression.startsWith("'") && expression.endsWith("'"))
  );
}

/**
 * Infers a Zod schema for an assign RHS when possible. Uses path resolution,
 * number/string literals, or falls back to z.unknown().
 *
 * Known limitation: Liquid filters (e.g. `| size`, `| json_parse`) are stripped
 * before inference, so the inferred type reflects the pre-filter expression, not
 * the filter's output type. For example, `items | size` infers the type of
 * `items` (array) rather than `number`.
 */
function inferSchemaFromAssignRhs(
  baseSchema: typeof DynamicStepContextSchema,
  rhs: string
): z.ZodType {
  const expression = stripAssignRhsFilters(rhs);
  if (!expression) {
    return z.unknown();
  }
  if (isExpressionNumber(expression)) {
    return z.number();
  }
  if (isExpressionString(expression)) {
    return z.string();
  }
  if (isExpressionBoolean(expression)) {
    return z.boolean();
  }
  if (VARIABLE_PATH_REGEX.test(expression)) {
    try {
      const { schema } = getSchemaAtPath(baseSchema, expression);
      if (schema && !(schema instanceof z.ZodUnknown)) {
        return schema as z.ZodType;
      }
    } catch {
      // path invalid or not resolvable
    }
  }
  return z.unknown();
}

/**
 * Extends the workflow context schema with template-local variables (assign/capture
 * and for-loop scope) so that validation and autocomplete recognize them.
 */
export function extendContextWithTemplateLocals(
  baseSchema: typeof DynamicStepContextSchema,
  templateString: string,
  offsetInTemplate: number
): typeof DynamicStepContextSchema {
  const { assignVars, captureNames, forLoopScopes } = getTemplateLocalContext(
    templateString,
    offsetInTemplate
  );

  const extension: Record<string, z.ZodType> = {};
  for (const { name, rhs } of assignVars) {
    extension[name] = inferSchemaFromAssignRhs(baseSchema, rhs);
  }
  for (const name of captureNames) {
    extension[name] = z.string();
  }

  const activeScopes = forLoopScopesContainingOffset(forLoopScopes, offsetInTemplate);
  for (const { variableName, collectionPath } of activeScopes) {
    let itemSchema: z.ZodType = z.any();
    if (collectionPath && !isLiquidRangeLiteral(collectionPath)) {
      try {
        const resolvedCollectionPath = resolveAssignChain(collectionPath, assignVars);
        const resolved = getForeachItemSchema(baseSchema, resolvedCollectionPath);
        if (!(resolved instanceof z.ZodUnknown)) {
          itemSchema = resolved;
        }
      } catch {
        // keep z.any() — collection errors are reported by validateLiquidForLoopCollections
      }
    }
    extension[variableName] = itemSchema;
    extension.forloop = FORLOOP_SCHEMA;
  }

  if (Object.keys(extension).length === 0) {
    return baseSchema;
  }

  // Zod's .extend() returns a new ZodObject whose generic shape differs from DynamicStepContextSchema;
  // the cast is necessary because the added keys are dynamic and not reflected in the static type.
  return baseSchema.extend(extension) as typeof DynamicStepContextSchema;
}

const yamlStringCache = new WeakMap<Document, string | null>();

/**
 * Returns a cached re-serialisation of the YAML document.
 *
 * `lineWidth: -1` disables flow-scalar folding so the output preserves the same
 * byte offsets as the original parsed input. Without this, the default
 * `lineWidth: 80` inserts escape continuations (`\\\n`) into long
 * double-quoted strings, shifting every subsequent byte position and making
 * `Scalar.range` offsets (from the original parse) slice the wrong region.
 */
function getCachedYamlString(doc: Document): string | null {
  let cached = yamlStringCache.get(doc);
  if (cached === undefined) {
    try {
      cached = doc.toString({ lineWidth: -1 });
    } catch {
      cached = null;
    }
    yamlStringCache.set(doc, cached);
  }
  return cached;
}

/**
 * Resolves the scalar at the given YAML offset and, if it is a string (e.g. a
 * Liquid template), extends the base schema with template-local variables
 * (assign/capture/for-loop) valid at that offset. Used by both validation and
 * autocomplete so they share the same context logic.
 *
 * For block scalars the offset mapping extracts the raw YAML slice (header +
 * indented content) via `Document.toString({ lineWidth: -1 })` and
 * `Scalar.range`, since `Scalar.source` equals the resolved value and lacks
 * the header/indent information needed for accurate mapping. `lineWidth: -1`
 * is required to prevent flow-scalar folding that would shift byte offsets
 * relative to the original parse. The toString result is cached per Document
 * instance via a WeakMap to avoid repeated serialisation.
 */
export function getContextSchemaWithTemplateLocals(
  yamlDocument: Document,
  offset: number,
  baseSchema: typeof DynamicStepContextSchema,
  /** Original YAML source (e.g. editor model). Prefer over re-serialized `doc.toString()` for block scalars. */
  yamlSource?: string
): typeof DynamicStepContextSchema {
  const scalarNode = getScalarValueAtOffset(yamlDocument, offset);
  if (!scalarNode || typeof scalarNode.value !== 'string' || !scalarNode.range) {
    return baseSchema;
  }

  const scalarType = scalarNode.type;
  const templateString = scalarNode.value;
  const scalarStart = scalarNode.range[0];

  let offsetInTemplate: number;
  if (scalarType === 'BLOCK_LITERAL' || scalarType === 'BLOCK_FOLDED') {
    const yamlString = yamlSource ?? getCachedYamlString(yamlDocument);
    if (yamlString !== null) {
      const rawScalarSource = yamlString.slice(scalarStart, scalarNode.range[2]);
      offsetInTemplate = mapBlockScalarSourceToValueOffset(
        rawScalarSource,
        offset - scalarStart,
        templateString.length,
        { folded: scalarType === 'BLOCK_FOLDED' }
      );
    } else {
      offsetInTemplate = offset - scalarStart;
    }
  } else {
    const isQuoted = scalarType === 'QUOTE_DOUBLE' || scalarType === 'QUOTE_SINGLE';
    const quoteAdjustment = isQuoted ? 1 : 0;
    offsetInTemplate = offset - scalarStart - quoteAdjustment;
  }

  if (offsetInTemplate < 0 || offsetInTemplate > templateString.length) {
    return baseSchema;
  }

  return extendContextWithTemplateLocals(baseSchema, templateString, offsetInTemplate);
}
