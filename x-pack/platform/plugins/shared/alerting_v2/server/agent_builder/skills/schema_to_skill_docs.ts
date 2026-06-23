/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { createRuleDataBaseSchema, createActionPolicyDataSchema } from '@kbn/alerting-v2-schemas';
import { ruleOperationSchema } from '../tools/manage_rule/operations';

const LARGE_ENUM_THRESHOLD = 20;

type JsonSchemaNode = Record<string, unknown>;

/**
 * Replaces large enum arrays with a compact description to keep token counts
 * manageable. Reuses the pattern from the workflows plugin
 * (`build_trigger_definitions_for_agent.ts`).
 */
function compactLargeEnums(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(compactLargeEnums);

  const obj = node as JsonSchemaNode;
  const result: JsonSchemaNode = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'enum' && Array.isArray(value) && value.length > LARGE_ENUM_THRESHOLD) {
      const examples = value.slice(0, 5) as string[];
      result.type = 'string';
      result.description = [
        obj.description ?? '',
        `One of ${value.length} allowed values, e.g.: ${examples.join(', ')}`,
      ]
        .filter(Boolean)
        .join('. ');
    } else {
      result[key] = compactLargeEnums(value);
    }
  }

  return result;
}

export class SchemaTranslationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SchemaTranslationError';
  }
}

function zodToJsonSchema(schema: z.ZodType): unknown {
  try {
    const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' });
    return compactLargeEnums(jsonSchema);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new SchemaTranslationError(`Failed to convert Zod schema to JSON Schema: ${message}`, e);
  }
}

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
  constraints: string;
}

function extractConstraints(prop: JsonSchemaNode): string {
  const parts: string[] = [];
  if (prop.minLength !== undefined) parts.push(`min length: ${prop.minLength}`);
  if (prop.maxLength !== undefined) parts.push(`max length: ${prop.maxLength}`);
  if (prop.minimum !== undefined) parts.push(`min: ${prop.minimum}`);
  if (prop.maximum !== undefined) parts.push(`max: ${prop.maximum}`);
  if (prop.pattern !== undefined) parts.push(`pattern: ${prop.pattern}`);
  if (prop.enum !== undefined && Array.isArray(prop.enum)) {
    parts.push(`enum: ${(prop.enum as string[]).join(' | ')}`);
  }
  if (prop.minItems !== undefined) parts.push(`min items: ${prop.minItems}`);
  if (prop.maxItems !== undefined) parts.push(`max items: ${prop.maxItems}`);
  if (prop.default !== undefined) parts.push(`default: ${JSON.stringify(prop.default)}`);
  return parts.join(', ');
}

function resolveType(prop: JsonSchemaNode): string {
  if (prop.enum !== undefined && Array.isArray(prop.enum)) {
    return (prop.enum as string[]).map((v) => `"${v}"`).join(' | ');
  }
  if (prop.anyOf !== undefined && Array.isArray(prop.anyOf)) {
    return (prop.anyOf as JsonSchemaNode[])
      .map((variant) => {
        if (variant.enum) return (variant.enum as string[]).map((v) => `"${v}"`).join(' | ');
        if (variant.const !== undefined) return `"${variant.const}"`;
        return (variant.type as string) ?? 'unknown';
      })
      .join(' | ');
  }
  if (prop.oneOf !== undefined && Array.isArray(prop.oneOf)) {
    return (prop.oneOf as JsonSchemaNode[])
      .map((variant) => {
        const disc = variant.properties as JsonSchemaNode | undefined;
        if (disc) {
          const firstKey = Object.keys(disc)[0];
          const firstProp = disc[firstKey] as JsonSchemaNode | undefined;
          if (firstProp?.const) return `{ ${firstKey}: "${firstProp.const}", ... }`;
        }
        return (variant.type as string) ?? 'variant';
      })
      .join(' | ');
  }
  if (prop.type === 'array') {
    const items = prop.items as JsonSchemaNode | undefined;
    const itemType = items ? resolveType(items) : 'unknown';
    return `${itemType}[]`;
  }
  return (prop.type as string) ?? 'unknown';
}

function jsonSchemaToFieldTable(jsonSchema: unknown): FieldInfo[] {
  if (!jsonSchema || typeof jsonSchema !== 'object') return [];
  const schema = jsonSchema as JsonSchemaNode;
  const properties = schema.properties as JsonSchemaNode | undefined;
  if (!properties) return [];
  const required = new Set((schema.required as string[]) ?? []);

  return Object.entries(properties).map(([name, rawProp]) => {
    const prop = rawProp as JsonSchemaNode;
    return {
      name,
      type: resolveType(prop),
      required: required.has(name),
      description: (prop.description as string) ?? '',
      constraints: extractConstraints(prop),
    };
  });
}

function formatFieldTable(fields: FieldInfo[]): string {
  if (fields.length === 0) return '';
  const rows = fields.map(
    (f) =>
      `| \`${f.name}\` | ${f.type} | ${f.required ? 'required' : 'optional'} | ${f.description}${
        f.constraints ? ` (${f.constraints})` : ''
      } |`
  );
  return ['| Field | Type | Required | Description |', '|---|---|---|---|', ...rows].join('\n');
}

function formatVariantSchemas(jsonSchema: unknown): string {
  if (!jsonSchema || typeof jsonSchema !== 'object') return '';
  const schema = jsonSchema as JsonSchemaNode;
  const variants = (schema.oneOf ?? schema.anyOf) as JsonSchemaNode[] | undefined;
  if (!variants) return '';

  const sections: string[] = [];
  for (const variant of variants) {
    const props = variant.properties as JsonSchemaNode | undefined;
    if (!props) continue;

    const discriminatorKey = Object.keys(props).find((k) => {
      const p = props[k] as JsonSchemaNode;
      return p.const !== undefined || (p.enum && (p.enum as string[]).length === 1);
    });
    const discriminatorValue = discriminatorKey
      ? ((props[discriminatorKey] as JsonSchemaNode).const as string) ??
        ((props[discriminatorKey] as JsonSchemaNode).enum as string[])?.[0]
      : undefined;

    const label =
      discriminatorKey && discriminatorValue
        ? `\`${discriminatorKey}: "${discriminatorValue}"\``
        : variant.description ?? 'Variant';

    const fields = jsonSchemaToFieldTable(variant);
    if (fields.length > 0) {
      sections.push(`#### ${label}\n\n${formatFieldTable(fields)}`);
    }
  }
  return sections.join('\n\n');
}

/**
 * Generates concise markdown documentation from the create-rule Zod schema.
 * Intended for embedding in the skill's `referencedContent`.
 */
export const generateRuleSchemaDoc = (): string => {
  const jsonSchema = zodToJsonSchema(createRuleDataBaseSchema);
  const fields = jsonSchemaToFieldTable(jsonSchema);
  const fieldTable = formatFieldTable(fields);

  let queryVariants = '';
  if (jsonSchema && typeof jsonSchema === 'object') {
    const schema = jsonSchema as JsonSchemaNode;
    const props = schema.properties as JsonSchemaNode | undefined;
    if (props?.query) {
      queryVariants = formatVariantSchemas(props.query as JsonSchemaNode);
    }
  }

  const sections = [
    '# Rule API Schema Reference',
    '',
    'Auto-generated from `@kbn/alerting-v2-schemas`. This is the source of truth for field names, types, and constraints.',
    '',
    '## Top-Level Fields',
    '',
    fieldTable,
  ];

  if (queryVariants) {
    sections.push('', '## Query Formats', '', queryVariants);
  }

  return sections.join('\n');
};

/**
 * Generates concise markdown documentation for the manage_rule tool operations.
 */
export const generateRuleOperationsDoc = (): string => {
  const jsonSchema = zodToJsonSchema(ruleOperationSchema);
  const variants = formatVariantSchemas(jsonSchema);

  return [
    '# Rule Operations Schema Reference',
    '',
    'Auto-generated from the `manage_rule` tool Zod schemas.',
    '',
    variants,
  ].join('\n');
};

/**
 * Generates concise markdown documentation from the create-action-policy Zod schema.
 */
export const generateActionPolicySchemaDoc = (): string => {
  const jsonSchema = zodToJsonSchema(createActionPolicyDataSchema);
  const fields = jsonSchemaToFieldTable(jsonSchema);
  const fieldTable = formatFieldTable(fields);

  return [
    '# Action Policy API Schema Reference',
    '',
    'Auto-generated from `@kbn/alerting-v2-schemas`. This is the source of truth for field names, types, and constraints.',
    '',
    fieldTable,
  ].join('\n');
};
