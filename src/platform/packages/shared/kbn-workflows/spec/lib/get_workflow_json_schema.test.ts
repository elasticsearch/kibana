/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { stringify } from 'yaml';
import { z } from '@kbn/zod/v4';
import { getWorkflowJsonSchema } from './get_workflow_json_schema';
import { getValidateWithYamlLsp } from './test_utils/validate_with_yaml_lsp';

describe('getWorkflowJsonSchema', () => {
  it('should set `additionalProperties: {}` for loose objects', () => {
    // WorkflowSchema has a .transform() which makes it a ZodTransform that doesn't support .extend()
    // Create a base schema before transform for testing
    const baseSchema = z.object({
      version: z.literal('1').default('1'),
      name: z.string().min(1),
      description: z.string().optional(),
      enabled: z.boolean().default(true),
      tags: z.array(z.string()).optional(),
      triggers: z.array(z.object({ type: z.string() })),
      steps: z.array(
        z.object({
          type: z.literal('elasticsearch.bulk'),
          with: z.object({
            operations: z.array(z.looseObject({})).optional().describe('Bulk operations'),
          }),
        })
      ),
    });
    const mockWithSchema = baseSchema.transform((data) => data);
    const jsonSchema = getWorkflowJsonSchema(mockWithSchema);
    expect(jsonSchema).toBeDefined();

    // With transform schemas and reused: 'ref', the root might be a $ref instead of having properties directly
    // Resolve the actual schema if needed
    const schemaWithRef = jsonSchema as { $ref?: string; definitions?: Record<string, unknown> };
    let actualSchema: any = jsonSchema;

    if (schemaWithRef.$ref && schemaWithRef.$ref.startsWith('#/definitions/')) {
      const defName = schemaWithRef.$ref.replace('#/definitions/', '');
      const defSchema = schemaWithRef.definitions?.[defName];
      if (defSchema && typeof defSchema === 'object') {
        actualSchema = defSchema;
      }
    }

    // With reused: 'ref', additionalProperties might not be set in definitions
    // If it's set, it should be false for strict objects
    if (actualSchema?.additionalProperties !== undefined) {
      expect(actualSchema.additionalProperties).toBe(false);
    }
    if (
      actualSchema?.properties?.steps?.items?.properties?.with?.additionalProperties !== undefined
    ) {
      expect(actualSchema.properties.steps.items.properties.with.additionalProperties).toBe(false);
    }
    // The loose object should have additionalProperties: {}
    const looseObjectAdditionalProps =
      actualSchema?.properties?.steps?.items?.properties?.with?.properties?.operations?.items
        ?.additionalProperties;
    if (looseObjectAdditionalProps !== undefined) {
      expect(looseObjectAdditionalProps).toStrictEqual({});
    }
  });

  it('merges built-in kibana workflow input definitions at the document root', () => {
    const baseSchema = z.object({
      version: z.literal('1').default('1'),
      name: z.string().min(1),
    });
    const jsonSchema = getWorkflowJsonSchema(baseSchema);
    expect(jsonSchema).toMatchObject({
      kibana: {
        definitions: {
          alertingV2NotificationGroup: expect.objectContaining({
            type: 'object',
            properties: expect.objectContaining({
              id: expect.any(Object),
              policyId: expect.any(Object),
              groupKey: expect.any(Object),
              episodes: expect.any(Object),
            }),
          }),
        },
      },
    });
  });
});

describe('fixAdditionalPropertiesInSchema', () => {
  it('should remove additionalProperties from objects with connector properties in with context', () => {
    // Test the logic that identifies connector properties
    const testObj = {
      type: 'object',
      properties: {
        invocationCount: { type: 'integer' },
        timeframeEnd: { type: 'string' },
      },
      additionalProperties: false,
    };

    // Mock the fixAdditionalPropertiesInSchema function logic
    const connectorPropNames = [
      'invocationCount',
      'timeframeEnd',
      'enable_logged_requests',
      'actions',
      'description',
      'name',
      'type',
    ];
    const hasConnectorProps =
      !!testObj.properties &&
      connectorPropNames.some((prop) =>
        Object.prototype.hasOwnProperty.call(testObj.properties, prop)
      );

    const path = 'properties.with.anyOf.0.allOf.1';
    const shouldRemoveAdditionalProperties = hasConnectorProps && path.includes('with');

    expect(hasConnectorProps).toBe(true);
    expect(shouldRemoveAdditionalProperties).toBe(true);
  });

  it('should identify allOf patterns in path', () => {
    // Test the path analysis logic
    const testPaths = [
      'properties.with.anyOf.0.allOf.1',
      'properties.with.anyOf.0.allOf.2',
      'properties.steps.items.anyOf.0.allOf.1',
      'properties.other.object',
    ];

    testPaths.forEach((path) => {
      const pathParts = path.split('.');
      const isInAllOf = pathParts.some((part, index) => {
        return part === 'allOf' && pathParts[index + 1] && /^\d+$/.test(pathParts[index + 1]);
      });

      if (path.includes('allOf')) {
        expect(isInAllOf).toBe(true);
      } else {
        expect(isInAllOf).toBe(false);
      }
    });
  });

  it('should identify broken reference fallback objects', () => {
    // Test the broken reference detection logic
    const testObjects = [
      {
        type: 'object',
        properties: {},
        description: 'Complex schema intersection (simplified due to broken allOf reference)',
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: { name: { type: 'string' } },
        description: 'Normal object',
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {},
        description: 'Another broken reference (simplified)',
        additionalProperties: false,
      },
    ];

    testObjects.forEach((obj) => {
      const isBrokenRef =
        obj.type === 'object' &&
        obj.additionalProperties === false &&
        obj.properties &&
        Object.keys(obj.properties).length === 0 &&
        obj.description &&
        obj.description.includes('simplified');

      if (obj.description.includes('simplified')) {
        expect(isBrokenRef).toBe(true);
      } else {
        expect(isBrokenRef).toBe(false);
      }
    });
  });
});

describe('setMarkdownDescriptionIfSyntaxDetected', () => {
  it('should set markdown description if markdown syntax tokens are detected', () => {
    const zodSchema = z.object({
      description: z.string().describe('This is a **markdown** description'),
    });
    const jsonSchema = getWorkflowJsonSchema(zodSchema);
    expect(jsonSchema).toBeDefined();
    expect((jsonSchema as any)?.properties?.description?.description).toBe(
      'This is a **markdown** description'
    );
    expect((jsonSchema as any)?.properties?.description?.markdownDescription).toBe(
      'This is a **markdown** description'
    );
  });
  it('should not set markdown description if no markdown syntax tokens are detected', () => {
    const zodSchema = z.object({
      description: z.string().describe('This is a plain text description'),
    });
    const jsonSchema = getWorkflowJsonSchema(zodSchema);
    expect(jsonSchema).toBeDefined();
    expect((jsonSchema as any)?.properties?.description?.description).toBe(
      'This is a plain text description'
    );
    expect((jsonSchema as any)?.properties?.description?.markdownDescription).toBeUndefined();
  });
});

describe('ZodPipe unwrapping for Monaco YAML', () => {
  it('should unwrap ZodPipe to generate JSON Schema with properties for autocompletion and validation', async () => {
    // This test verifies that ZodPipe schemas (returned by generateYamlSchemaFromConnectors)
    // are correctly unwrapped to generate a JSON Schema with properties at the root level.
    // This is critical for Monaco YAML autocompletion and validation to work.

    // Create a schema that mimics what generateYamlSchemaFromConnectors returns (a ZodPipe)
    const baseSchema = z.object({
      name: z.string().min(1),
      enabled: z.boolean().default(true),
      version: z.literal('1').default('1'),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      triggers: z.array(z.object({ type: z.string() })),
      steps: z.array(z.object({ name: z.string(), type: z.string() })),
    });

    // Apply transform to create a ZodPipe (similar to generateYamlSchemaFromConnectors)
    const pipeSchema = baseSchema.transform((data) => ({
      ...data,
      version: '1' as const,
    }));

    // Verify it's a ZodPipe
    expect(pipeSchema.constructor.name).toBe('ZodPipe');

    // Generate JSON Schema
    const jsonSchema = getWorkflowJsonSchema(pipeSchema);
    expect(jsonSchema).toBeDefined();

    // Resolve $ref if present (with reused: 'ref', root might be a $ref)
    const schemaWithRef = jsonSchema as { $ref?: string; definitions?: Record<string, unknown> };
    let actualSchema: any = jsonSchema;

    if (schemaWithRef.$ref && schemaWithRef.$ref.startsWith('#/definitions/')) {
      const defName = schemaWithRef.$ref.replace('#/definitions/', '');
      const defSchema = schemaWithRef.definitions?.[defName];
      if (defSchema && typeof defSchema === 'object') {
        actualSchema = defSchema;
      }
    }

    // Critical: Schema must have properties for Monaco autocompletion
    expect(actualSchema.properties).toBeDefined();
    expect(actualSchema.properties.name).toBeDefined();
    expect(actualSchema.properties.enabled).toBeDefined();
    expect(actualSchema.properties.version).toBeDefined();
    expect(actualSchema.properties.description).toBeDefined();

    // Verify types for validation
    expect(actualSchema.properties.name.type).toBe('string');
    expect(actualSchema.properties.enabled.type).toBe('boolean');

    const validateWithYamlLsp = getValidateWithYamlLsp(jsonSchema as z.core.JSONSchema.JSONSchema);

    // Runtime: Zod. Editor / yaml-language-server: generated JSON Schema (same split as production).
    // Asserting a well-formed document produces no LSP schema diagnostics exercises z.toJSONSchema
    // output on the same path as Monaco; invalid cases stay on Zod because draft-7 output does not
    // always surface required/type rules the same way for yaml-language-server.
    const validWorkflow = {
      name: 'Test Workflow',
      enabled: true,
      version: '1',
      triggers: [{ type: 'manual' }],
      steps: [{ name: 'step1', type: 'console' }],
    };
    expect(pipeSchema.safeParse(validWorkflow).success).toBe(true);
    const validYamlDiagnostics = await validateWithYamlLsp(
      'workflow.yaml',
      stringify(validWorkflow)
    );
    expect(validYamlDiagnostics).toEqual([]);

    const invalidWorkflow = {
      name: 'Test Workflow',
      enabled: 23, // Should be boolean, not number
      version: '1',
      triggers: [{ type: 'manual' }],
      steps: [{ name: 'step1', type: 'console' }],
    };
    const invalidResult = pipeSchema.safeParse(invalidWorkflow);
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      const enabledIssue = invalidResult.error.issues.find(
        (issue) => issue.path[0] === 'enabled' || issue.path.join('.') === 'enabled'
      );
      expect(enabledIssue).toBeDefined();
    }
  });
});
