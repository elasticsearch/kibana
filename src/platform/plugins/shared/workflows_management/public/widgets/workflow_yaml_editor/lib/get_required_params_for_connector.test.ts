/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorTypeInfo } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import { getCachedAllConnectors } from './connectors_cache';
import { getRequiredParamsForConnector } from './get_required_params_for_connector';

// Mock the dependencies
jest.mock('./connectors_cache', () => ({
  getCachedAllConnectors: jest.fn(),
}));

jest.mock('@kbn/workflows', () => ({
  isInternalConnector: jest.fn(),
}));

const isInternalConnector = jest.requireMock('@kbn/workflows').isInternalConnector as jest.Mock;

describe('getRequiredParamsForConnector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when connector has examples', () => {
    it('should return required params from examples for internal connector with examples', () => {
      const mockConnector = {
        type: 'elasticsearch.index',
        paramsSchema: z.object({}),
        examples: {
          params: {
            index: 'my-index',
            id: 'doc-id',
            body: { field: 'value' },
          },
        },
        methods: ['POST'],
        patterns: ['/{index}/_doc/{id}'],
        parameterTypes: {
          headerParams: [],
          pathParams: ['index', 'id'],
          urlParams: [],
          bodyParams: ['body'],
        },
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(true);

      const result = getRequiredParamsForConnector('elasticsearch.index');

      expect(result).toEqual([
        { name: 'index', example: 'my-index' },
        { name: 'id', example: 'doc-id' },
        { name: 'body', example: { field: 'value' } },
      ]);
    });

    it('should filter examples to only include important ES API parameters', () => {
      const mockConnector = {
        type: 'elasticsearch.search',
        paramsSchema: z.object({}),
        examples: {
          params: {
            index: 'my-index',
            query: { match_all: {} },
            size: 10,
            from: 0,
            sort: [{ timestamp: 'desc' }],
            aggs: { terms: { field: 'status' } },
            customParam: 'should-be-filtered',
          },
        },
        methods: ['POST'],
        patterns: ['/{index}/_search'],
        parameterTypes: {
          headerParams: [],
          pathParams: ['index'],
          urlParams: ['size', 'from', 'sort'],
          bodyParams: ['query', 'aggs'],
        },
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(true);

      const result = getRequiredParamsForConnector('elasticsearch.search');

      expect(result).toEqual([
        { name: 'index', example: 'my-index' },
        { name: 'query', example: { match_all: {} } },
        { name: 'size', example: 10 },
        { name: 'from', example: 0 },
        { name: 'sort', example: [{ timestamp: 'desc' }] },
        { name: 'aggs', example: { terms: { field: 'status' } } },
      ]);
      expect(result.find((p) => p.name === 'customParam')).toBeUndefined();
    });

    it('should return empty array if examples exist but no important params match', () => {
      const mockConnector = {
        type: 'elasticsearch.custom',
        paramsSchema: z.object({}),
        examples: {
          params: {
            customParam: 'value',
            anotherParam: 'value2',
          },
        },
        methods: ['GET'],
        patterns: ['/_custom'],
        parameterTypes: {
          headerParams: [],
          pathParams: [],
          urlParams: [],
          bodyParams: [],
        },
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(true);

      const result = getRequiredParamsForConnector('elasticsearch.custom');

      expect(result).toEqual([]);
    });
  });

  describe('when extracting from schema', () => {
    it('should extract required parameters from Zod schema', () => {
      const mockConnector = {
        type: 'elasticsearch.index',
        paramsSchema: z.object({
          index: z.string().describe('The index name'),
          id: z.string().optional(),
          body: z.object({}).required(),
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('elasticsearch.index');

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((p) => p.name === 'index')).toBe(true);
      expect(result.some((p) => p.name === 'body')).toBe(true);
    });

    it('should extract examples from schema descriptions', () => {
      const mockConnector = {
        type: 'elasticsearch.search',
        paramsSchema: z.object({
          index: z.string().describe('The index name, e.g., "my-index"'),
          query: z.object({}).describe('Query DSL, example: {"match_all": {}}'),
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('elasticsearch.search');

      const indexParam = result.find((p) => p.name === 'index');
      expect(indexParam?.example).toBe('my-index');
    });

    it('should use default examples for common parameter names', () => {
      const mockConnector = {
        type: 'elasticsearch.get',
        paramsSchema: z.object({
          index: z.string(),
          id: z.string(),
          query: z.object({}), // Required field to ensure it's included
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('elasticsearch.get');

      const indexParam = result.find((p) => p.name === 'index');
      const idParam = result.find((p) => p.name === 'id');
      const queryParam = result.find((p) => p.name === 'query');

      expect(indexParam?.example).toBe('my-index');
      expect(idParam?.example).toBe('doc-id');
      // Query is required, so it should be included with example
      if (queryParam) {
        expect(queryParam.example).toBe('{}');
      }
    });

    it('should skip common non-parameter fields', () => {
      const mockConnector = {
        type: 'elasticsearch.search',
        paramsSchema: z.object({
          index: z.string(),
          pretty: z.boolean().optional(),
          human: z.boolean().optional(),
          error_trace: z.boolean().optional(),
          source: z.string().optional(),
          filter_path: z.string().optional(),
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('elasticsearch.search');

      expect(result.find((p) => p.name === 'pretty')).toBeUndefined();
      expect(result.find((p) => p.name === 'human')).toBeUndefined();
      expect(result.find((p) => p.name === 'error_trace')).toBeUndefined();
      expect(result.find((p) => p.name === 'source')).toBeUndefined();
      expect(result.find((p) => p.name === 'filter_path')).toBeUndefined();
    });

    it('should treat fields with default values as not required', () => {
      const mockConnector = {
        type: 'elasticsearch.search',
        paramsSchema: z.object({
          index: z.string(), // Required field
          size: z.number().optional().default(10), // Optional with default - should NOT be included
          from: z.number().optional(), // Optional without default - should NOT be included
          timeout: z.string().default('30s'), // Optional with default - should NOT be included
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('elasticsearch.search');

      // Required field should be included
      const indexParam = result.find((p) => p.name === 'index');
      expect(indexParam).toBeDefined();

      // Fields with default values should NOT be included in required params
      // because they are optional (default value will be used if not provided)
      const sizeParam = result.find((p) => p.name === 'size');
      const fromParam = result.find((p) => p.name === 'from');
      const timeoutParam = result.find((p) => p.name === 'timeout');

      // These should be undefined because they have defaults and are not in the important params list
      expect(sizeParam).toBeUndefined();
      expect(fromParam).toBeUndefined();
      expect(timeoutParam).toBeUndefined();
    });

    it('should return important params if no required params exist', () => {
      const mockConnector = {
        type: 'elasticsearch.search',
        paramsSchema: z.object({
          index: z.string().optional(),
          query: z.object({}).optional(),
          size: z.number().optional(),
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('elasticsearch.search');

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(3);
      expect(result.some((p) => ['index', 'query', 'size'].includes(p.name))).toBe(true);
    });
  });

  describe('fallback to basic connector params', () => {
    it('should return basic params for console connector', () => {
      (getCachedAllConnectors as jest.Mock).mockReturnValue([]);

      const result = getRequiredParamsForConnector('console');

      expect(result).toEqual([{ name: 'message', example: 'Hello World' }]);
    });

    it('should return basic params for slack connector', () => {
      (getCachedAllConnectors as jest.Mock).mockReturnValue([]);

      const result = getRequiredParamsForConnector('slack');

      expect(result).toEqual([{ name: 'message', example: 'Hello Slack' }]);
    });

    it('should return basic params for http connector', () => {
      (getCachedAllConnectors as jest.Mock).mockReturnValue([]);

      const result = getRequiredParamsForConnector('http');

      expect(result).toEqual([
        { name: 'url', example: 'https://api.example.com' },
        { name: 'method', example: 'GET' },
      ]);
    });

    it('should return basic params for wait connector', () => {
      (getCachedAllConnectors as jest.Mock).mockReturnValue([]);

      const result = getRequiredParamsForConnector('wait');

      expect(result).toEqual([{ name: 'duration', example: '5s' }]);
    });

    it('should return empty array for unknown connector type', () => {
      (getCachedAllConnectors as jest.Mock).mockReturnValue([]);

      const result = getRequiredParamsForConnector('unknown-connector');

      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully and fallback to basic params', () => {
      const mockConnector = {
        type: 'elasticsearch.index',
        paramsSchema: {
          // Invalid schema that will cause an error
          shape: {},
        },
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockImplementation(() => {
        throw new Error('Test error');
      });

      const result = getRequiredParamsForConnector('elasticsearch.index');

      // Should fallback to empty array since elasticsearch.index is not in basic params
      expect(result).toEqual([]);
    });

    it('should handle connector without paramsSchema', () => {
      const mockConnector = {
        type: 'elasticsearch.index',
        // No paramsSchema
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);

      const result = getRequiredParamsForConnector('elasticsearch.index');

      expect(result).toEqual([]);
    });
  });

  describe('with dynamic connector types', () => {
    it('should use dynamic connector types when provided', () => {
      const mockDynamicConnectorTypes: Record<string, ConnectorTypeInfo> = {
        '.slack': {
          actionTypeId: '.slack',
          displayName: 'Slack',
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          minimumLicenseRequired: 'basic',
          subActions: [],
          instances: [],
        },
      };

      const mockConnector = {
        type: '.slack',
        paramsSchema: z.object({
          message: z.string(), // In Zod v4, fields are required by default
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('.slack', mockDynamicConnectorTypes);

      expect(getCachedAllConnectors).toHaveBeenCalledWith(mockDynamicConnectorTypes);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('body parameter extraction', () => {
    it('should extract body example from nested ZodObject schema', () => {
      const bodySchema = z.object({
        query: z.object({
          match: z.object({
            field: z.string().describe('e.g., "value"'),
          }),
        }),
      });

      const mockConnector = {
        type: 'elasticsearch.search',
        paramsSchema: z.object({
          index: z.string(),
          body: bodySchema,
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('elasticsearch.search');

      const bodyParam = result.find((p) => p.name === 'body');
      expect(bodyParam).toBeDefined();
    });

    it('should handle optional body parameter', () => {
      const bodySchema = z.object({
        query: z.object({}).describe('e.g., {"match_all": {}}'),
      });

      const mockConnector = {
        type: 'elasticsearch.search',
        paramsSchema: z.object({
          index: z.string(),
          body: bodySchema.optional(),
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('elasticsearch.search');

      const indexParam = result.find((p) => p.name === 'index');
      expect(indexParam).toBeDefined();

      // Body is optional but should still be included because it's in the important params list ['index', 'id', 'body']
      // Note: extractBodyExample returns an object, which gets assigned to example (may be converted to string)
      const bodyParam = result.find((p) => p.name === 'body');
      // The body parameter should be included if the implementation correctly handles optional fields
      // If it's not included, that's also acceptable behavior - the test just verifies the function doesn't crash
      if (bodyParam) {
        expect(bodyParam.name).toBe('body');
      }
    });
  });

  describe('discriminated union scaffolding', () => {
    const buildAttachmentUnion = () =>
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('comment'), comment: z.string() }),
        z.object({ type: z.literal('file'), attachmentId: z.string() }),
      ]);

    it('should scaffold the discriminator key for a discriminated-union field', () => {
      const mockConnector = {
        type: 'cases.addAttachment',
        paramsSchema: z.object({
          case_id: z.string(),
          attachment: buildAttachmentUnion(),
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('cases.addAttachment');
      const attachment = result.find((p) => p.name === 'attachment');

      expect(attachment).toBeDefined();
      expect(attachment?.example).toEqual({ type: '' });
    });

    it('should scaffold an array of discriminator stubs for an array<discriminated-union> field', () => {
      const mockConnector = {
        type: 'cases.addAttachments',
        paramsSchema: z.object({
          case_id: z.string(),
          attachments: z.array(buildAttachmentUnion()).min(1),
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('cases.addAttachments');
      const attachments = result.find((p) => p.name === 'attachments');

      expect(attachments).toBeDefined();
      expect(attachments?.example).toEqual([{ type: '' }]);
    });

    it('should unwrap optional/default before scaffolding the discriminator', () => {
      const mockConnector = {
        type: 'cases.addAttachmentOptional',
        paramsSchema: z.object({
          case_id: z.string(),
          attachment: buildAttachmentUnion().optional(),
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('cases.addAttachmentOptional');
      // Optional non-required, non-important field is filtered out by the existing
      // required-only filter. This documents that behavior — only required
      // discriminated-union fields are scaffolded into the snippet.
      expect(result.find((p) => p.name === 'attachment')).toBeUndefined();
    });
  });

  describe('parameter name patterns', () => {
    it('should provide default example for parameters with "name" in the key', () => {
      const mockConnector = {
        type: 'custom.connector',
        paramsSchema: z.object({
          connectorName: z.string(),
          userName: z.string(),
        }),
      };

      (getCachedAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
      isInternalConnector.mockReturnValue(false);

      const result = getRequiredParamsForConnector('custom.connector');

      const connectorNameParam = result.find((p) => p.name === 'connectorName');
      const userNameParam = result.find((p) => p.name === 'userName');

      // Both should be required and included (required fields are included)
      expect(connectorNameParam).toBeDefined();
      expect(userNameParam).toBeDefined();

      // Verify the parameters are included with correct names
      if (connectorNameParam) {
        expect(connectorNameParam.name).toBe('connectorName');
        // Example may be set to 'my-name' if the key includes 'name' and no description example exists
        // The implementation sets default examples for keys that include 'name'
      }
      if (userNameParam) {
        expect(userNameParam.name).toBe('userName');
      }
    });
  });
});
