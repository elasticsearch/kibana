/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PublicStepDefinition } from '@kbn/workflows-extensions/public';
import { z } from '@kbn/zod/v4';
import { getOutputSchemaForStepType } from './get_output_schema_for_step_type';
import { stepSchemas } from '../../../../common/step_schemas';

describe('getOutputSchemaForStepType', () => {
  let originalGetAllConnectorsMapCache: typeof stepSchemas.getAllConnectorsMapCache;
  let mockConnectorsMap: Map<string, { type: string; outputSchema?: z.ZodSchema }>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Save original and mock getAllConnectorsMapCache
    originalGetAllConnectorsMapCache = stepSchemas.getAllConnectorsMapCache;
    mockConnectorsMap = new Map();
    stepSchemas.getAllConnectorsMapCache = jest.fn().mockImplementation(() => mockConnectorsMap);
  });

  afterEach(() => {
    stepSchemas.getAllConnectorsMapCache = originalGetAllConnectorsMapCache;
  });

  describe('elasticsearch and kibana connectors', () => {
    it('should return outputSchema from elasticsearch connector', () => {
      const mockOutputSchema = z.object({ hits: z.array(z.any()) });
      mockConnectorsMap.set('elasticsearch.search', {
        type: 'elasticsearch.search',
        outputSchema: mockOutputSchema,
      });

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'elasticsearch.search',
        type: 'atomic' as const,
        configuration: {},
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result).toBe(mockOutputSchema);
    });

    it('should return outputSchema from kibana connector', () => {
      const mockOutputSchema = z.object({ id: z.string(), title: z.string() });
      mockConnectorsMap.set('kibana.create_case_default_space', {
        type: 'kibana.create_case_default_space',
        outputSchema: mockOutputSchema,
      });

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'kibana.create_case_default_space',
        type: 'atomic' as const,
        configuration: {},
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result).toBe(mockOutputSchema);
    });

    it('should return z.unknown() when connector has no outputSchema', () => {
      mockConnectorsMap.set('elasticsearch.search', {
        type: 'elasticsearch.search',
        // no outputSchema defined
      });

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'elasticsearch.search',
        type: 'atomic' as const,
        configuration: {},
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result.def.type).toBe('unknown');
    });

    it.each([
      'elasticsearch.indices.exists',
      'elasticsearch.indices.delete',
      'elasticsearch.index',
      'elasticsearch.search',
      'elasticsearch.bulk',
    ])('should return connector outputSchema for %s', (stepType) => {
      const mockOutputSchema = z.object({ result: z.string() });
      mockConnectorsMap.set(stepType, {
        type: stepType,
        outputSchema: mockOutputSchema,
      });

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType,
        type: 'atomic' as const,
        configuration: {},
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result).toBe(mockOutputSchema);
    });

    it.each(['kibana.create_case_default_space', 'kibana.add_case_comment_default_space'])(
      'should return connector outputSchema for %s',
      (stepType) => {
        const mockOutputSchema = z.object({ id: z.string() });
        mockConnectorsMap.set(stepType, {
          type: stepType,
          outputSchema: mockOutputSchema,
        });

        const mockNode = {
          id: 'test-id',
          stepId: 'test-step-id',
          stepType,
          type: 'atomic' as const,
          configuration: {},
        };

        const result = getOutputSchemaForStepType(mockNode);

        expect(result).toBe(mockOutputSchema);
      }
    );
  });

  describe('structural step nodes', () => {
    it('should return conditionResult schema for enter-if node', () => {
      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'if',
        type: 'enter-if' as const,
        exitNodeId: 'exit-id',
        configuration: {},
      };

      const result = getOutputSchemaForStepType(mockNode as any);
      const parsed = result.safeParse({ conditionResult: true });

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ conditionResult: true });
    });

    it('should return conditionResult schema for exit-if node', () => {
      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'if',
        type: 'exit-if' as const,
        startNodeId: 'enter-id',
      };

      const result = getOutputSchemaForStepType(mockNode as any);
      const parsed = result.safeParse({ conditionResult: false });

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ conditionResult: false });
    });

    it('should resolve structural schema by stepType regardless of node type', () => {
      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'if',
        type: 'exit-then-branch' as const,
      };

      const result = getOutputSchemaForStepType(mockNode as any);
      const parsed = result.safeParse({ conditionResult: true });

      expect(parsed.success).toBe(true);
    });

    it('should fall through to z.unknown() for structural nodes without a registered schema', () => {
      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'retry',
        type: 'enter-retry' as const,
      };

      const result = getOutputSchemaForStepType(mockNode as any);

      expect(result.def.type).toBe('unknown');
    });
  });

  describe('fallback behavior', () => {
    it('should return z.unknown() for unknown step types', () => {
      // Map is empty, connector not found

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'unknown-step-type',
        type: 'atomic' as const,
        configuration: {},
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result.def.type).toBe('unknown');
      expect(result.safeParse(undefined)).toEqual({ success: true, data: undefined });
    });

    it('should return z.unknown() for node with empty stepType', () => {
      // Map is empty, connector not found

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: '',
        type: 'atomic' as const,
        configuration: {},
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result.def.type).toBe('unknown');
      expect(result.safeParse({})).toEqual({ success: true, data: {} });
    });

    it('should return z.unknown() when connectors map cache is null', () => {
      stepSchemas.getAllConnectorsMapCache = jest.fn().mockReturnValue(null);

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'elasticsearch.search',
        type: 'atomic' as const,
        configuration: {},
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result.def.type).toBe('unknown');
    });
  });

  describe('zod schema validation', () => {
    it('should validate that returned schema is a Zod schema', () => {
      // Map is empty, will return z.unknown()

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'test-step',
        type: 'atomic' as const,
        configuration: {},
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result).toHaveProperty('def');
      expect(typeof result.parse).toBe('function');
      expect(typeof result.safeParse).toBe('function');
    });

    it('should handle nodes with configuration objects', () => {
      // Map is empty, will return z.unknown()

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'test-step',
        type: 'atomic' as const,
        configuration: {
          with: { param: 'value' },
        },
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result.def.type).toBe('unknown');
    });

    it('should handle nodes with null configuration', () => {
      // Map is empty, will return z.unknown()

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'test-step',
        type: 'atomic' as const,
        configuration: null,
      };

      const result = getOutputSchemaForStepType(mockNode);

      expect(result.def.type).toBe('unknown');
    });
  });

  describe('custom steps output schemas', () => {
    let originalGetStepDefinition: typeof stepSchemas.getStepDefinition;
    let originalIsPublicStepDefinition: typeof stepSchemas.isPublicStepDefinition;

    let mockStepDefinition: Partial<PublicStepDefinition>;

    beforeEach(() => {
      originalGetStepDefinition = stepSchemas.getStepDefinition;
      originalIsPublicStepDefinition = stepSchemas.isPublicStepDefinition;
      stepSchemas.getStepDefinition = jest.fn().mockImplementation(() => mockStepDefinition);
      (stepSchemas.isPublicStepDefinition as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(true);
      // Reset connector map for custom steps tests (empty map)
      mockConnectorsMap.clear();
    });

    afterEach(() => {
      stepSchemas.getStepDefinition = originalGetStepDefinition;
      stepSchemas.isPublicStepDefinition = originalIsPublicStepDefinition;
    });

    it('should use getOutputSchema when available and return its result', () => {
      const mockDynamicSchema = {
        def: { type: 'string' },
        safeParse: (val: any) => ({ success: true, data: String(val) }),
      } as any;

      mockStepDefinition = {
        id: 'dynamic-step',
        outputSchema: { def: { type: 'unknown' } } as any,
        editorHandlers: {
          dynamicSchema: {
            getOutputSchema: jest.fn().mockReturnValue(mockDynamicSchema),
          },
        },
      };

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'dynamic-step',
        type: 'atomic' as const,
        configuration: {
          with: {
            customParam: 'dynamicValue',
          },
        },
      };

      const result = getOutputSchemaForStepType(mockNode);

      // Should call getOutputSchema with configuration.with
      expect(
        mockStepDefinition?.editorHandlers?.dynamicSchema?.getOutputSchema
      ).toHaveBeenCalledWith({
        input: {
          customParam: 'dynamicValue',
        },
        config: mockNode.configuration,
      });

      // Should return the dynamic schema
      expect(result).toBe(mockDynamicSchema);
      expect(result.def.type).toBe('string');
    });

    it('should fallback to static outputSchema when getOutputSchema throws an error', () => {
      const mockStaticSchema = {
        def: { type: 'object' },
        safeParse: (val: any) => ({ success: true, data: val }),
      } as any;

      mockStepDefinition = {
        id: 'error-step',
        outputSchema: mockStaticSchema,
        editorHandlers: {
          dynamicSchema: {
            getOutputSchema: jest.fn().mockImplementation(() => {
              throw new Error('Dynamic schema generation failed');
            }),
          },
        },
      };

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'error-step',
        type: 'atomic' as const,
        configuration: {
          with: { param: 'value' },
        },
      };

      const result = getOutputSchemaForStepType(mockNode);

      // Should call getOutputSchema first
      expect(
        mockStepDefinition.editorHandlers?.dynamicSchema?.getOutputSchema
      ).toHaveBeenCalledWith({
        input: {
          param: 'value',
        },
        config: mockNode.configuration,
      });

      // Should fallback to static schema when dynamic throws
      expect(result).toBe(mockStaticSchema);
      expect(result.def.type).toBe('object');
    });

    it('should use static outputSchema when getOutputSchema is not defined', () => {
      const mockStaticSchema = {
        def: { type: 'array' },
        safeParse: (val: any) => ({ success: true, data: val }),
      } as any;

      mockStepDefinition = {
        id: 'static-step',
        outputSchema: mockStaticSchema,
        // no getOutputSchema property
      };

      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'static-step',
        type: 'atomic' as const,
        configuration: {
          with: { param: 'value' },
        },
      };

      const result = getOutputSchemaForStepType(mockNode);

      // Should return the static schema directly
      expect(result).toBe(mockStaticSchema);
      expect(result.def.type).toBe('array');
    });

    it('should resolve dynamic output schema for waitForInput with a typed schema', () => {
      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'waitForInput',
        type: 'waitForInput' as const,
        configuration: {
          with: {
            schema: {
              type: 'object',
              properties: { approved: { type: 'boolean' } },
              required: ['approved'],
            },
          },
        },
      };

      const result = getOutputSchemaForStepType(mockNode as any);

      // Should produce a typed Zod schema, not the permissive record fallback.
      const valid = result.safeParse({
        response: { approved: true },
        respondedBy: 'external-user',
      });
      const invalid = result.safeParse({
        response: { approved: 'not-a-boolean' },
        respondedBy: 'external-user',
      });
      expect(valid.success).toBe(true);
      expect(invalid.success).toBe(false);
    });

    it('should return permissive record schema for waitForInput without a schema', () => {
      const mockNode = {
        id: 'test-id',
        stepId: 'test-step-id',
        stepType: 'waitForInput',
        type: 'waitForInput' as const,
        configuration: { with: { message: 'Please approve' } },
      };

      const result = getOutputSchemaForStepType(mockNode as any);

      expect(
        result.safeParse({ response: { anything: true }, respondedBy: 'external-user' }).success
      ).toBe(true);
    });
  });
});
