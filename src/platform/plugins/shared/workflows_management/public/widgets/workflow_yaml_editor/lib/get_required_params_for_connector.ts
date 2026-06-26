/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { type ConnectorTypeInfo, isInternalConnector } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import { getCachedAllConnectors } from './connectors_cache';

export interface RequiredParamForConnector {
  name: string;
  // Example may be a primitive (string/number) or a structured object/array — e.g. body
  // example objects from `extractBodyExample` and discriminated-union scaffolds
  // like `{ type: '' }`. The downstream YAML stringifier renders either shape.
  example?: unknown;
  defaultValue?: string;
}

/**
 * Get required parameters for a connector type from generated schemas
 */
export function getRequiredParamsForConnector(
  connectorType: string,
  dynamicConnectorTypes?: Record<string, ConnectorTypeInfo>
): RequiredParamForConnector[] {
  // Get all connectors (both static and generated)
  const allConnectors = getCachedAllConnectors(dynamicConnectorTypes);

  // Find the connector by type
  const connector = allConnectors.find((c) => c.type === connectorType);

  if (connector && connector.paramsSchema) {
    try {
      if (isInternalConnector(connector) && connector.examples && connector.examples.params) {
        // Use examples directly from enhanced connector
        const exampleParams = connector.examples.params;
        // Using enhanced examples
        const result: RequiredParamForConnector[] = [];

        for (const [key, value] of Object.entries(exampleParams)) {
          // Include common important parameters for ES APIs
          if (
            [
              'index',
              'id',
              'body',
              'query',
              'size',
              'from',
              'sort',
              'aggs',
              'aggregations',
              'format',
            ].includes(key)
          ) {
            result.push({ name: key, example: value });
            // Added enhanced example
          }
        }

        if (result.length > 0) {
          // Returning enhanced examples
          return result;
        }
      }

      // Fallback to extracting from schema
      const params = extractRequiredParamsFromSchema(connector.paramsSchema);

      // Return only required parameters, or most important ones if no required ones
      const requiredParams = params.filter((p) => p.required);
      if (requiredParams.length > 0) {
        return requiredParams.map((p) => ({ name: p.name, example: p.example }));
      }

      // If no required params, return the most important ones for ES APIs
      const importantParams = params.filter((p) =>
        [
          'index',
          'id',
          'body',
          'query',
          'size',
          'from',
          'sort',
          'aggs',
          'aggregations',
          'format',
        ].includes(p.name)
      );
      if (importantParams.length > 0) {
        return importantParams.slice(0, 3).map((p) => ({ name: p.name, example: p.example }));
      }
    } catch (error) {
      // Silently continue with fallback parameters
    }
  }

  // Fallback to basic hardcoded ones for non-ES connectors
  const basicConnectorParams: Record<string, Array<{ name: string; example?: string }>> = {
    console: [{ name: 'message', example: 'Hello World' }],
    slack: [{ name: 'message', example: 'Hello Slack' }],
    http: [
      { name: 'url', example: 'https://api.example.com' },
      { name: 'method', example: 'GET' },
    ],
    wait: [{ name: 'duration', example: '5s' }],
    waitForInput: [{ name: 'message', example: 'Please approve before continuing' }],
  };

  return basicConnectorParams[connectorType] || [];
}

/**
 * Extract required parameters from a Zod schema
 */
function extractRequiredParamsFromSchema(
  schema: z.ZodType
): Array<{ name: string; example?: unknown; defaultValue?: string; required: boolean }> {
  const params: Array<{
    name: string;
    example?: unknown;
    defaultValue?: string;
    required: boolean;
  }> = [];

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const zodField = fieldSchema as z.ZodType;

      // Skip common non-parameter fields
      if (['pretty', 'human', 'error_trace', 'source', 'filter_path'].includes(key)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // Recommended way to check if field is required (not optional)
      const isOptional = zodField.safeParse(undefined).success;
      const isRequired = !isOptional;

      // Extract description for examples
      let description = '';
      let example: unknown = '';

      if ('description' in zodField && typeof zodField.description === 'string') {
        description = zodField.description;
        // Try to extract example from description
        const exampleMatch = description.match(
          /example[:\s]+['"]*([^'"]+)['"]*|default[:\s]+['"]*([^'"]+)['"]*/i
        );
        if (exampleMatch) {
          example = exampleMatch[1] || exampleMatch[2] || '';
        }
      }

      // Add some default examples based on common parameter names
      if (!example) {
        if (key === 'index') {
          example = 'my-index';
        } else if (key === 'id') {
          example = 'doc-id';
        } else if (key === 'body') {
          // Try to extract body structure from schema
          example = extractBodyExample(zodField);
        } else if (key === 'query') {
          example = '{}';
        } else if (key.includes('name')) {
          example = 'my-name';
        }
      }

      // Discriminated unions: scaffold the discriminator field so authors can
      // immediately narrow to a specific member (e.g. `attachment: { type: '' }`).
      // Plain object/array examples win over a generic discriminator stub.
      if (!example) {
        const discriminatorStub = extractDiscriminatorStub(zodField);
        if (discriminatorStub) {
          example = discriminatorStub;
        }
      }

      // Only include required parameters or very common ones
      if (isRequired || ['index', 'id', 'body'].includes(key)) {
        params.push({
          name: key,
          example,
          required: isRequired,
        });
      }
    }
  }

  return params;
}

/**
 * Returns a placeholder shape that surfaces the discriminator key for a
 * `ZodDiscriminatedUnion` field, or an array containing one such shape for
 * `ZodArray<ZodDiscriminatedUnion>`. Unwraps `ZodOptional`/`ZodDefault` first.
 *
 * Examples:
 *   z.discriminatedUnion('type', [...])              -> { type: '' }
 *   z.array(z.discriminatedUnion('type', [...]))     -> [{ type: '' }]
 *
 * Returns `undefined` for any other shape so callers can fall back.
 */
function extractDiscriminatorStub(fieldSchema: z.ZodType): unknown {
  let inner: z.ZodType = fieldSchema;
  if (inner instanceof z.ZodOptional || inner instanceof z.ZodDefault) {
    inner = inner.unwrap() as z.ZodType;
  }

  if (inner instanceof z.ZodDiscriminatedUnion) {
    const key = getDiscriminatorKey(inner);
    return key ? { [key]: '' } : undefined;
  }

  if (inner instanceof z.ZodArray) {
    let element = inner.element as z.ZodType;
    if (element instanceof z.ZodOptional || element instanceof z.ZodDefault) {
      element = element.unwrap() as z.ZodType;
    }
    if (element instanceof z.ZodDiscriminatedUnion) {
      const key = getDiscriminatorKey(element);
      return key ? [{ [key]: '' }] : undefined;
    }
  }

  return undefined;
}

function getDiscriminatorKey(union: z.ZodDiscriminatedUnion): string | undefined {
  // Zod v4 exposes the discriminator on `def.discriminator`. Fall back to scanning
  // the first member's shape for a literal field if the API ever changes.
  const fromDef = (union as unknown as { def?: { discriminator?: unknown } }).def?.discriminator;
  if (typeof fromDef === 'string') {
    return fromDef;
  }

  const options = (union as unknown as { def?: { options?: z.ZodType[] } }).def?.options;
  const first = options?.[0];
  if (first instanceof z.ZodObject) {
    for (const [key, value] of Object.entries(first.shape)) {
      if (value instanceof z.ZodLiteral) {
        return key;
      }
    }
  }
  return undefined;
}

/**
 * Extract example for body parameter based on its schema
 */
function extractBodyExample(bodySchema: z.ZodType): any {
  try {
    // Handle ZodOptional wrapper
    let schema = bodySchema;
    if (bodySchema instanceof z.ZodOptional) {
      schema = bodySchema.unwrap() as z.ZodType;
    }

    // If it's a ZodObject, try to extract its shape and build YAML-compatible example
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const example: any = {};

      // Extract examples from each field
      for (const [key, fieldSchema] of Object.entries(shape)) {
        const field = fieldSchema as z.ZodType;
        const description = (field as any)?._def?.description || '';

        // Extract example from description if available
        const stringExampleMatch = description.match(/e\.g\.,?\s*"([^"]+)"/);
        const objectExampleMatch = description.match(/e\.g\.,?\s*(\{[^}]+\})/);

        if (stringExampleMatch) {
          example[key] = stringExampleMatch[1];
        } else if (objectExampleMatch) {
          try {
            example[key] = JSON.parse(objectExampleMatch[1]);
          } catch {
            // If JSON parse fails, use as string
            example[key] = objectExampleMatch[1];
          }
        }
        // No fallback - only use examples explicitly defined in enhanced connectors
      }

      if (Object.keys(example).length > 0) {
        return example; // Return object, not JSON string
      }
    }
  } catch (error) {
    // Fallback to empty object
  }

  return {};
}
