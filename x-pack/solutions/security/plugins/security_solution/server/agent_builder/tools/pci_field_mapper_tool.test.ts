/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '../../../../../../../../../ao-plan-detection-emulation-retir-20fd3f/x-pack/platform/packages/shared/agent-builder/agent-builder-common';
import type { ToolHandlerStandardReturn } from '../../../../../../../../../ao-plan-detection-emulation-retir-20fd3f/x-pack/platform/packages/shared/agent-builder/agent-builder-server/tools';
import { createToolHandlerContext, createToolTestMocks } from '../__mocks__/test_helpers';
import { pciFieldMapperTool, PCI_FIELD_MAPPER_TOOL_ID } from './pci_field_mapper_tool';

describe('pciFieldMapperTool', () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const tool = pciFieldMapperTool(mockCore, mockLogger);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('schema', () => {
    it('accepts a valid index pattern', () => {
      const result = tool.schema.safeParse({ indexPattern: 'logs-custom-myapp*' });
      expect(result.success).toBe(true);
    });

    it('rejects a missing index pattern', () => {
      const result = tool.schema.safeParse({});
      expect(result.success).toBe(false);
    });

    it.each([
      'logs-*"; DROP INDEX',
      'logs-*\n| FROM malicious',
      '../../etc/passwd',
      '\u0000logs-*',
    ])('rejects malicious index pattern %j', (indexPattern) => {
      const result = tool.schema.safeParse({ indexPattern });
      expect(result.success).toBe(false);
    });

    it('accepts an explicit ISO time range', () => {
      const result = tool.schema.safeParse({
        indexPattern: 'logs-*',
        timeRange: { from: '2024-01-01T00:00:00Z', to: '2024-01-08T00:00:00Z' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an inverted time range', () => {
      const result = tool.schema.safeParse({
        indexPattern: 'logs-*',
        timeRange: { from: '2024-02-01T00:00:00Z', to: '2024-01-01T00:00:00Z' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('properties', () => {
    it('returns the expected tool id', () => {
      expect(tool.id).toBe(PCI_FIELD_MAPPER_TOOL_ID);
    });
  });

  describe('handler', () => {
    it('maps non-ECS fields to ECS equivalents using word-boundary matching', async () => {
      mockEsClient.asCurrentUser.fieldCaps.mockResolvedValue({
        fields: {
          username: { keyword: { type: 'keyword' } },
          src_ip: { ip: { type: 'ip' } },
          result: { keyword: { type: 'keyword' } },
          hostname: { keyword: { type: 'keyword' } },
          '@timestamp': { date: { type: 'date' } },
        },
      } as never);

      mockEsClient.asCurrentUser.search.mockResolvedValue({
        hits: {
          hits: [{ _source: { username: 'admin', src_ip: '10.0.0.1' } }],
        },
      } as never);

      const result = (await tool.handler(
        { indexPattern: 'logs-custom*' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const payload = result.results[0].data as {
        suggestedMappings: Array<{
          sourceField: string;
          suggestedEcsField: string;
          confidence: number;
        }>;
      };

      const userNameMapping = payload.suggestedMappings.find((m) => m.sourceField === 'username');
      expect(userNameMapping?.suggestedEcsField).toBe('user.name');
      expect(userNameMapping?.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('maps hierarchical non-ECS fields (e.g. myorg.user_id, app.src_ip) to ECS targets', async () => {
      mockEsClient.asCurrentUser.fieldCaps.mockResolvedValue({
        fields: {
          'myorg.user_id': { keyword: { type: 'keyword' } },
          'app.src_ip': { ip: { type: 'ip' } },
          'svc.hostname': { keyword: { type: 'keyword' } },
          '@timestamp': { date: { type: 'date' } },
        },
      } as never);
      mockEsClient.asCurrentUser.search.mockResolvedValue({ hits: { hits: [] } } as never);

      const result = (await tool.handler(
        { indexPattern: 'logs-myorg*' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const payload = result.results[0].data as {
        suggestedMappings: Array<{ sourceField: string; suggestedEcsField: string }>;
      };
      const sourceFields = payload.suggestedMappings.map((m) => m.sourceField);
      expect(sourceFields).toEqual(
        expect.arrayContaining(['myorg.user_id', 'app.src_ip', 'svc.hostname'])
      );
    });

    it('does not propose ECS-namespace mappings (e.g. process.pid → process.name)', async () => {
      mockEsClient.asCurrentUser.fieldCaps.mockResolvedValue({
        fields: {
          'process.pid': { long: { type: 'long' } },
          'process.executable': { keyword: { type: 'keyword' } },
          '@timestamp': { date: { type: 'date' } },
        },
      } as never);
      mockEsClient.asCurrentUser.search.mockResolvedValue({ hits: { hits: [] } } as never);

      const result = (await tool.handler(
        { indexPattern: 'logs-ecs-shaped*' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const payload = result.results[0].data as {
        suggestedMappings: Array<{ sourceField: string; suggestedEcsField: string }>;
      };
      const intoProcess = payload.suggestedMappings.filter(
        (m) => m.suggestedEcsField === 'process.name'
      );
      expect(intoProcess).toHaveLength(0);
    });

    it('redacts sensitive fields from mapping suggestions', async () => {
      mockEsClient.asCurrentUser.fieldCaps.mockResolvedValue({
        fields: {
          card_number: { keyword: { type: 'keyword' } },
          cvv: { keyword: { type: 'keyword' } },
          username: { keyword: { type: 'keyword' } },
          password_hash: { keyword: { type: 'keyword' } },
          '@timestamp': { date: { type: 'date' } },
        },
      } as never);

      mockEsClient.asCurrentUser.search.mockResolvedValue({ hits: { hits: [] } } as never);

      const result = (await tool.handler(
        { indexPattern: 'logs-payments*' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const payload = result.results[0].data as {
        suggestedMappings: Array<{ sourceField: string }>;
      };

      const sensitiveFields = payload.suggestedMappings.filter(
        (m) =>
          m.sourceField === 'card_number' ||
          m.sourceField === 'cvv' ||
          m.sourceField === 'password_hash'
      );
      expect(sensitiveFields).toHaveLength(0);
    });

    it('constrains the sample search by the provided time range', async () => {
      mockEsClient.asCurrentUser.fieldCaps.mockResolvedValue({
        fields: { username: { keyword: { type: 'keyword' } } },
      } as never);
      mockEsClient.asCurrentUser.search.mockResolvedValue({ hits: { hits: [] } } as never);

      await tool.handler(
        {
          indexPattern: 'logs-custom*',
          timeRange: { from: '2024-01-01T00:00:00Z', to: '2024-01-08T00:00:00Z' },
        },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      );

      const searchCall = (mockEsClient.asCurrentUser.search as unknown as jest.Mock).mock
        .calls[0][0];
      expect(searchCall.query).toEqual({
        range: {
          '@timestamp': {
            gte: '2024-01-01T00:00:00Z',
            lte: '2024-01-08T00:00:00Z',
          },
        },
      });
    });

    it('returns a scopeClaim with the PCI DSS version + disclaimer', async () => {
      mockEsClient.asCurrentUser.fieldCaps.mockResolvedValue({
        fields: { username: { keyword: { type: 'keyword' } } },
      } as never);
      mockEsClient.asCurrentUser.search.mockResolvedValue({ hits: { hits: [] } } as never);

      const result = (await tool.handler(
        { indexPattern: 'logs-custom*' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const payload = result.results[0].data as {
        scopeClaim: {
          pciDssVersion: string;
          indices: string[];
          disclaimer: string;
          requiredFieldsChecked: string[];
        };
      };

      expect(payload.scopeClaim.pciDssVersion).toBe('4.0.1');
      expect(payload.scopeClaim.indices).toEqual(['logs-custom*']);
      expect(payload.scopeClaim.disclaimer).toContain('Qualified Security Assessor');
      expect(payload.scopeClaim.requiredFieldsChecked.length).toBeGreaterThan(0);
    });

    it('returns an error when fieldCaps fails', async () => {
      mockEsClient.asCurrentUser.fieldCaps.mockRejectedValue(new Error('index_not_found'));

      const result = (await tool.handler(
        { indexPattern: 'nonexistent-*' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.error);
    });
  });
});
