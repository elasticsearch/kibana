/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import type { RuleAttachmentData } from '@kbn/alerting-v2-schemas';
import {
  executeRuleOperations,
  RuleOperationValidationError,
  type RuleOperation,
} from './operations';

const createMockEsClient = () => elasticsearchServiceMock.createScopedClusterClient();

describe('executeRuleOperations', () => {
  describe('set_query with ES|QL validation', () => {
    it('validates a valid query against ES and stores the result', async () => {
      const esClient = createMockEsClient();
      esClient.asCurrentUser.esql.query.mockResolvedValueOnce({
        columns: [
          { name: 'host.name', type: 'keyword' },
          { name: 'cpu', type: 'double' },
        ],
        values: [],
      } as never);

      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | STATS avg(cpu) BY host.name' },
          },
        },
      ];

      const result = await executeRuleOperations({}, ops, esClient);

      expect(esClient.asCurrentUser.esql.query).toHaveBeenCalledWith({
        query: 'FROM metrics-* | STATS avg(cpu) BY host.name | LIMIT 0',
        format: 'json',
      });
      expect(result.data.query).toEqual({
        breach: { query: 'FROM metrics-* | STATS avg(cpu) BY host.name' },
        format: 'standalone',
      });
      expect(result.queryColumns).toEqual([
        { name: 'host.name', type: 'keyword' },
        { name: 'cpu', type: 'double' },
      ]);
    });

    it('throws with the ES error message when the query is invalid', async () => {
      const esClient = createMockEsClient();
      esClient.asCurrentUser.esql.query.mockRejectedValueOnce(
        new Error('Unknown index [nonexistent-*]')
      );

      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM nonexistent-* | STATS COUNT(*)' },
          },
        },
      ];

      await expect(executeRuleOperations({}, ops, esClient)).rejects.toThrow(
        'Invalid ES|QL query: Unknown index [nonexistent-*]'
      );
    });

    it('skips validation when esClient is not provided', async () => {
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | STATS COUNT(*)' },
          },
        },
      ];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.query).toEqual({
        breach: { query: 'FROM metrics-* | STATS COUNT(*)' },
        format: 'standalone',
      });
      expect(result.queryColumns).toBeUndefined();
    });

    it('stores recovery_strategy: "no_breach" on the rule data', async () => {
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: { format: 'standalone', breach: { query: 'FROM metrics-* | STATS COUNT(*)' } },
          recovery_strategy: 'no_breach',
        },
      ];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.recovery_strategy).toBe('no_breach');
    });

    it('stores recovery_strategy: "query" and recovery block on the rule data', async () => {
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | WHERE cpu > 0.9' },
            recovery: { query: 'FROM metrics-* | WHERE cpu < 0.5' },
          },
          recovery_strategy: 'query',
        },
      ];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.recovery_strategy).toBe('query');
      expect((result.data.query as { recovery?: { query: string } }).recovery).toEqual({
        query: 'FROM metrics-* | WHERE cpu < 0.5',
      });
    });

    it('stores no_data_strategy: "emit" and no_data block on the rule data', async () => {
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | WHERE cpu > 0.9' },
            no_data: { query: 'FROM heartbeat-* | STATS COUNT(*) BY host.name' },
          },
          no_data_strategy: 'emit',
        },
      ];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.no_data_strategy).toBe('emit');
      expect((result.data.query as { no_data?: { query: string } }).no_data).toEqual({
        query: 'FROM heartbeat-* | STATS COUNT(*) BY host.name',
      });
    });

    it('does not set recovery_strategy when omitted from set_query', async () => {
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: { format: 'standalone', breach: { query: 'FROM metrics-* | STATS COUNT(*)' } },
        },
      ];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.recovery_strategy).toBeUndefined();
      expect(result.data.no_data_strategy).toBeUndefined();
    });

    it('preserves existing recovery_strategy when a subsequent set_query omits it', async () => {
      const existing: Partial<RuleAttachmentData> = { recovery_strategy: 'no_breach' };
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: { format: 'standalone', breach: { query: 'FROM metrics-* | STATS COUNT(*)' } },
        },
      ];

      const result = await executeRuleOperations(existing, ops);

      expect(result.data.recovery_strategy).toBe('no_breach');
    });
  });

  describe('set_query with composed format', () => {
    it('validates composed query using base for the LIMIT 0 call', async () => {
      const esClient = createMockEsClient();
      esClient.asCurrentUser.esql.query.mockResolvedValueOnce({
        columns: [
          { name: 'host.name', type: 'keyword' },
          { name: 'avg_cpu', type: 'double' },
        ],
        values: [],
      } as never);

      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'composed',
            base: 'FROM metrics-* | STATS avg_cpu = AVG(cpu) BY host.name',
            breach: { segment: 'WHERE avg_cpu > 0.9' },
          },
        },
      ];

      const result = await executeRuleOperations({}, ops, esClient);

      expect(esClient.asCurrentUser.esql.query).toHaveBeenCalledWith({
        query: 'FROM metrics-* | STATS avg_cpu = AVG(cpu) BY host.name | LIMIT 0',
        format: 'json',
      });
      expect(result.data.query).toEqual({
        format: 'composed',
        base: 'FROM metrics-* | STATS avg_cpu = AVG(cpu) BY host.name',
        breach: { segment: 'WHERE avg_cpu > 0.9' },
      });
      expect(result.queryColumns).toEqual([
        { name: 'host.name', type: 'keyword' },
        { name: 'avg_cpu', type: 'double' },
      ]);
    });

    it('stores composed query with recovery segment and recovery_strategy', async () => {
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'composed',
            base: 'FROM metrics-* | STATS avg_cpu = AVG(cpu) BY host.name',
            breach: { segment: 'WHERE avg_cpu > 0.9' },
            recovery: { segment: 'WHERE avg_cpu < 0.5' },
          },
          recovery_strategy: 'query',
        },
      ];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.recovery_strategy).toBe('query');
      expect((result.data.query as { recovery?: { segment: string } }).recovery).toEqual({
        segment: 'WHERE avg_cpu < 0.5',
      });
    });
  });

  describe('set_query recovery cross-field validation', () => {
    it('throws when recovery block is present but recovery_strategy is not "query"', async () => {
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | WHERE cpu > 0.9' },
            recovery: { query: 'FROM metrics-* | WHERE cpu < 0.5' },
          },
          recovery_strategy: 'no_breach',
        },
      ];

      await expect(executeRuleOperations({}, ops)).rejects.toThrow(
        'query.recovery is only allowed when recovery_strategy is "query"'
      );
    });

    it('throws when recovery block is present with no recovery_strategy on existing rule', async () => {
      const existing: Partial<RuleAttachmentData> = { recovery_strategy: 'no_breach' };
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | WHERE cpu > 0.9' },
            recovery: { query: 'FROM metrics-* | WHERE cpu < 0.5' },
          },
        },
      ];

      await expect(executeRuleOperations(existing, ops)).rejects.toThrow(
        'query.recovery is only allowed when recovery_strategy is "query"'
      );
    });

    it('throws when recovery_strategy is "query" but no recovery block is provided', async () => {
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | WHERE cpu > 0.9' },
          },
          recovery_strategy: 'query',
        },
      ];

      const promise = executeRuleOperations({}, ops);
      await expect(promise).rejects.toThrow('recovery_strategy "query" requires a recovery block');
      await expect(executeRuleOperations({}, ops)).rejects.toBeInstanceOf(
        RuleOperationValidationError
      );
    });

    it('passes when recovery_strategy is "query" and recovery block is provided', async () => {
      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | WHERE cpu > 0.9' },
            recovery: { query: 'FROM metrics-* | WHERE cpu < 0.5' },
          },
          recovery_strategy: 'query',
        },
      ];

      const result = await executeRuleOperations({}, ops);
      expect(result.data.recovery_strategy).toBe('query');
    });
  });

  describe('set_grouping with column validation', () => {
    it('accepts grouping fields that exist in query columns', async () => {
      const esClient = createMockEsClient();
      esClient.asCurrentUser.esql.query.mockResolvedValueOnce({
        columns: [
          { name: 'host.name', type: 'keyword' },
          { name: 'cpu', type: 'double' },
        ],
        values: [],
      } as never);

      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | STATS avg(cpu) BY host.name' },
          },
        },
        { operation: 'set_grouping', fields: ['host.name'] },
      ];

      const result = await executeRuleOperations({}, ops, esClient);

      expect(result.data.grouping?.fields).toEqual(['host.name']);
    });

    it('throws when grouping fields are not in query columns', async () => {
      const esClient = createMockEsClient();
      esClient.asCurrentUser.esql.query.mockResolvedValueOnce({
        columns: [
          { name: 'host.name', type: 'keyword' },
          { name: 'cpu', type: 'double' },
        ],
        values: [],
      } as never);

      const ops: RuleOperation[] = [
        {
          operation: 'set_query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | STATS avg(cpu) BY host.name' },
          },
        },
        { operation: 'set_grouping', fields: ['service.name'] },
      ];

      await expect(executeRuleOperations({}, ops, esClient)).rejects.toThrow(
        'Grouping fields not found in query output columns: service.name'
      );
    });

    it('skips column validation when no prior query validation ran', async () => {
      const ops: RuleOperation[] = [{ operation: 'set_grouping', fields: ['service.name'] }];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.grouping?.fields).toEqual(['service.name']);
    });
  });

  describe('cross-field validation', () => {
    it('throws when isNew is true and no name is provided', async () => {
      const ops: RuleOperation[] = [{ operation: 'set_kind', kind: 'alert' }];

      await expect(executeRuleOperations({}, ops, undefined, { isNew: true })).rejects.toThrow(
        'A rule name is required when creating a new rule. Use a set_metadata operation with a name.'
      );
    });

    it('does not throw when isNew is true and a name is provided', async () => {
      const ops: RuleOperation[] = [{ operation: 'set_metadata', name: 'My Rule' }];

      const result = await executeRuleOperations({}, ops, undefined, { isNew: true });

      expect(result.data.metadata?.name).toBe('My Rule');
    });

    it('throws when state_transition is set on a non-alert kind', async () => {
      const ops: RuleOperation[] = [
        { operation: 'set_kind', kind: 'signal' },
        {
          operation: 'set_state_transition',
          pending_count: 3,
          pending_timeframe: '5m',
          recovering_count: 2,
          recovering_timeframe: '5m',
        },
      ];

      await expect(executeRuleOperations({}, ops)).rejects.toThrow(
        'state_transition is only allowed when kind is "alert"'
      );
    });

    it('throws when signal rule uses composed query format', async () => {
      const ops: RuleOperation[] = [
        { operation: 'set_kind', kind: 'signal' },
        {
          operation: 'set_query',
          query: {
            format: 'composed',
            base: 'FROM logs-*',
            breach: { segment: 'WHERE error == true' },
          },
        },
      ];

      await expect(executeRuleOperations({}, ops)).rejects.toThrow(
        'kind "signal" requires query.format "standalone"'
      );
    });

    it('throws when signal rule has recovery_strategy set', async () => {
      const ops: RuleOperation[] = [{ operation: 'set_kind', kind: 'signal' }];
      const initial: Partial<RuleAttachmentData> = {
        recovery_strategy: 'query',
        query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
      };

      await expect(executeRuleOperations(initial, ops)).rejects.toThrow(
        'Signal rules cannot set recovery_strategy or no_data_strategy'
      );
    });
  });

  describe('validation error class', () => {
    const expectValidationError = async (promise: Promise<unknown>) => {
      await expect(promise).rejects.toBeInstanceOf(RuleOperationValidationError);
    };

    it('wraps invalid ES|QL errors', async () => {
      const esClient = createMockEsClient();
      esClient.asCurrentUser.esql.query.mockRejectedValueOnce(new Error('boom'));
      await expectValidationError(
        executeRuleOperations(
          {},
          [
            {
              operation: 'set_query',
              query: { format: 'standalone', breach: { query: 'FROM x' } },
            },
          ],
          esClient
        )
      );
    });

    it('wraps unknown grouping fields', async () => {
      const esClient = createMockEsClient();
      esClient.asCurrentUser.esql.query.mockResolvedValueOnce({
        columns: [{ name: 'foo', type: 'keyword' }],
        values: [],
      } as never);
      await expectValidationError(
        executeRuleOperations(
          {},
          [
            {
              operation: 'set_query',
              query: { format: 'standalone', breach: { query: 'FROM x' } },
            },
            { operation: 'set_grouping', fields: ['bar'] },
          ],
          esClient
        )
      );
    });

    it('wraps missing-name error on new rule', async () => {
      await expectValidationError(
        executeRuleOperations({}, [{ operation: 'set_kind', kind: 'alert' }], undefined, {
          isNew: true,
        })
      );
    });

    it('wraps state_transition on non-alert kind', async () => {
      await expectValidationError(
        executeRuleOperations({}, [
          { operation: 'set_kind', kind: 'signal' },
          { operation: 'set_state_transition', pending_count: 1 },
        ])
      );
    });

    it('wraps composed query on signal kind', async () => {
      await expectValidationError(
        executeRuleOperations({}, [
          { operation: 'set_kind', kind: 'signal' },
          {
            operation: 'set_query',
            query: {
              format: 'composed',
              base: 'FROM logs-*',
              breach: { segment: 'WHERE error == true' },
            },
          },
        ])
      );
    });

    it('wraps recovery_strategy error on signal kind', async () => {
      await expectValidationError(
        executeRuleOperations(
          {
            recovery_strategy: 'query',
            query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
          },
          [{ operation: 'set_kind', kind: 'signal' }]
        )
      );
    });
  });

  describe('validate operation', () => {
    const validRule: Partial<RuleAttachmentData> = {
      kind: 'alert',
      metadata: { name: 'Test Rule', description: 'A test rule' },
      schedule: { every: '5m', lookback: '10m' },
      query: { format: 'standalone', breach: { query: 'FROM metrics-* | STATS COUNT(*)' } },
      time_field: '@timestamp',
      state_transition: null,
    };

    it('passes validation for a complete rule', async () => {
      const ops: RuleOperation[] = [{ operation: 'validate' }];

      const result = await executeRuleOperations(validRule, ops);

      expect(result.data.kind).toBe('alert');
    });

    it('passes validation when validate follows mutation operations', async () => {
      const ops: RuleOperation[] = [
        { operation: 'set_metadata', name: 'My Rule' },
        { operation: 'set_kind', kind: 'signal' },
        { operation: 'set_schedule', every: '1m', lookback: '5m' },
        {
          operation: 'set_query',
          query: { format: 'standalone', breach: { query: 'FROM logs-* | STATS COUNT(*)' } },
        },
        { operation: 'validate' },
      ];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.metadata?.name).toBe('My Rule');
    });

    it('throws RuleOperationValidationError when kind is missing', async () => {
      const ops: RuleOperation[] = [{ operation: 'validate' }];

      await expect(
        executeRuleOperations({ metadata: { name: 'Test' }, schedule: { every: '5m' } }, ops)
      ).rejects.toThrow(RuleOperationValidationError);
    });

    it('throws when metadata is missing', async () => {
      const ops: RuleOperation[] = [{ operation: 'validate' }];

      await expect(executeRuleOperations({ kind: 'alert' }, ops)).rejects.toThrow(
        'Rule is not ready to save'
      );
    });

    it('includes Zod issue paths in the error message', async () => {
      const ops: RuleOperation[] = [{ operation: 'validate' }];

      await expect(executeRuleOperations({}, ops)).rejects.toThrow(/kind:/);
    });

    it('does not persist changes when validate throws', async () => {
      const ops: RuleOperation[] = [
        { operation: 'set_metadata', name: 'Test' },
        { operation: 'validate' },
      ];

      await expect(executeRuleOperations({}, ops)).rejects.toThrow(RuleOperationValidationError);
    });

    it('passes validation for a rule with recovery_strategy: "query"', async () => {
      const ops: RuleOperation[] = [{ operation: 'validate' }];

      const result = await executeRuleOperations(
        {
          ...validRule,
          recovery_strategy: 'query',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | STATS COUNT(*)' },
            recovery: { query: 'FROM metrics-* | WHERE ok == true' },
          },
        },
        ops
      );

      expect(result.data.recovery_strategy).toBe('query');
    });

    it('passes validation for a rule with no_data_strategy: "emit"', async () => {
      const ops: RuleOperation[] = [{ operation: 'validate' }];

      const result = await executeRuleOperations(
        {
          ...validRule,
          no_data_strategy: 'emit',
          query: {
            format: 'standalone',
            breach: { query: 'FROM metrics-* | STATS COUNT(*)' },
            no_data: { query: 'FROM heartbeat-* | STATS COUNT(*) BY host.name' },
          },
        },
        ops
      );

      expect(result.data.no_data_strategy).toBe('emit');
    });
  });

  describe('basic operations without ES client', () => {
    it('applies set_metadata', async () => {
      const ops: RuleOperation[] = [
        { operation: 'set_metadata', name: 'Test Rule', description: 'A test', tags: ['test'] },
      ];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.metadata).toEqual({
        name: 'Test Rule',
        description: 'A test',
        tags: ['test'],
      });
    });

    it('merges metadata with existing data', async () => {
      const existing: Partial<RuleAttachmentData> = {
        metadata: { name: 'Old Name', description: 'Old desc' },
      };
      const ops: RuleOperation[] = [{ operation: 'set_metadata', name: 'New Name' }];

      const result = await executeRuleOperations(existing, ops);

      expect(result.data.metadata?.name).toBe('New Name');
      expect(result.data.metadata?.description).toBe('Old desc');
    });

    it('applies set_kind', async () => {
      const ops: RuleOperation[] = [{ operation: 'set_kind', kind: 'alert' }];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.kind).toBe('alert');
    });

    it('applies set_schedule', async () => {
      const ops: RuleOperation[] = [{ operation: 'set_schedule', every: '1m', lookback: '5m' }];

      const result = await executeRuleOperations({}, ops);

      expect(result.data.schedule).toEqual({ every: '1m', lookback: '5m' });
    });
  });
});
