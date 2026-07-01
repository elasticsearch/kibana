/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { loggerMock } from '@kbn/logging-mocks';
import type { RulesClientApi } from '@kbn/alerting-v2-plugin/server';
import { RulesAdapterV2, RulesNotInstalledAdapterV2 } from './v2_rules_adapter';
import type { CreateRuleBody, UpdateRuleBody } from './rules_management_client';
import { STREAMS_RULE_CONSUMER, STREAMS_ESQL_RULE_TYPE_ID } from './rules_management_client';

function makeRulesClientMock() {
  return {
    createRule: jest.fn(),
    updateRule: jest.fn(),
    bulkDeleteRules: jest.fn(),
  };
}

function makeAdapter(mock: ReturnType<typeof makeRulesClientMock>) {
  return new RulesAdapterV2(mock as unknown as RulesClientApi);
}

function lastCreateCall(mock: ReturnType<typeof makeRulesClientMock>) {
  const call = mock.createRule.mock.calls[mock.createRule.mock.calls.length - 1][0];
  return call;
}

function lastUpdateCall(mock: ReturnType<typeof makeRulesClientMock>) {
  const call = mock.updateRule.mock.calls[mock.updateRule.mock.calls.length - 1][0];
  return call;
}

const createBody: CreateRuleBody = {
  name: 'High error rate',
  consumer: STREAMS_RULE_CONSUMER,
  alertTypeId: STREAMS_ESQL_RULE_TYPE_ID,
  actions: [] as never[],
  params: {
    timestampField: '@timestamp',
    query: 'FROM logs-* METADATA _id, _source | WHERE level == "error"',
  },
  enabled: true,
  tags: ['streams', 'my-stream'],
  schedule: { interval: '1m' },
};

const updateBody: UpdateRuleBody = {
  name: 'Updated title',
  actions: [] as never[],
  params: {
    timestampField: '@timestamp',
    query: 'FROM logs-* METADATA _id, _source | WHERE level == "error"',
  },
  tags: ['streams', 'my-stream'],
  schedule: { interval: '1m' },
};

describe('RulesAdapterV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('v2 body mapping', () => {
    it('maps createRule body to v2 signal shape', async () => {
      const mock = makeRulesClientMock();
      mock.createRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.createRule('rule-1', createBody);

      expect(lastCreateCall(mock).data).toEqual({
        kind: 'signal',
        metadata: {
          name: 'High error rate',
          tags: ['sigevents:stream:my-stream'],
        },
        time_field: '@timestamp',
        schedule: { every: '1m', lookback: '2m' },
        grouping: { fields: ['_id'] },
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-* METADATA _id | WHERE level == "error"' },
        },
      });
      expect(lastCreateCall(mock).options).toEqual({ id: 'rule-1' });
    });

    it('includes a 2-minute lookback to match v1 MATCH_LOOKBACK_MINUTES', async () => {
      const mock = makeRulesClientMock();
      mock.createRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.createRule('rule-1', createBody);

      const data = lastCreateCall(mock).data as Record<string, unknown>;
      expect((data.schedule as Record<string, unknown>).lookback).toBe('2m');
    });

    it('groups by _id so overlapping windows dedupe per source document', async () => {
      const mock = makeRulesClientMock();
      mock.createRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.createRule('rule-1', createBody);

      const data = lastCreateCall(mock).data as { grouping: { fields: string[] } };
      expect(data.grouping).toEqual({ fields: ['_id'] });
    });

    it('rejects STATS queries until rule-on-rule provisioning', async () => {
      const mock = makeRulesClientMock();
      const adapter = makeAdapter(mock);
      const statsQuery =
        'FROM logs-* | STATS count = COUNT(*) BY bucket = BUCKET(@timestamp, 5 minutes) | WHERE count > 0';

      await expect(
        adapter.createRule('rule-stats', {
          ...createBody,
          params: { ...createBody.params, query: statsQuery },
        })
      ).rejects.toThrow('STATS queries cannot be installed as v2 signal rules');

      expect(mock.createRule).not.toHaveBeenCalled();
    });

    it('maps updateRule body to v2 partial shape (no kind)', async () => {
      const mock = makeRulesClientMock();
      mock.updateRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.updateRule('rule-1', updateBody);

      expect(lastUpdateCall(mock)).toEqual({
        id: 'rule-1',
        data: {
          metadata: {
            name: 'Updated title',
            tags: ['sigevents:stream:my-stream'],
          },
          time_field: '@timestamp',
          schedule: { every: '1m', lookback: '2m' },
          grouping: { fields: ['_id'] },
          query: {
            format: 'standalone',
            breach: { query: 'FROM logs-* METADATA _id | WHERE level == "error"' },
          },
        },
      });
    });

    it('forwards timestampField as time_field in updateRule bodies', async () => {
      const mock = makeRulesClientMock();
      mock.updateRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.updateRule('rule-1', {
        ...updateBody,
        params: { ...updateBody.params, timestampField: 'event.ingested' },
      });

      const data = lastUpdateCall(mock).data as { time_field: string };
      expect(data.time_field).toBe('event.ingested');
    });

    it('keeps grouping in updateRule bodies so dedup config stays in sync', async () => {
      const mock = makeRulesClientMock();
      mock.updateRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.updateRule('rule-1', updateBody);

      const data = lastUpdateCall(mock).data as { grouping: { fields: string[] } };
      expect(data.grouping).toEqual({ fields: ['_id'] });
    });

    it('maps v1 tags ["streams", "<name>"] to a single structured v2 tag', async () => {
      const mock = makeRulesClientMock();
      mock.createRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.createRule('rule-1', {
        ...createBody,
        tags: ['streams', 'web-server.errors'],
      });

      const data = lastCreateCall(mock).data as { metadata: { tags: string[] } };
      expect(data.metadata.tags).toEqual(['sigevents:stream:web-server.errors']);
    });

    it('preserves v1 tags as-is when no stream name is present', async () => {
      const mock = makeRulesClientMock();
      mock.createRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.createRule('rule-1', { ...createBody, tags: ['streams'] });

      const data = lastCreateCall(mock).data as { metadata: { tags: string[] } };
      expect(data.metadata.tags).toEqual(['streams']);
    });

    it('strips _source from METADATA but keeps _id so v2 grouping can dedupe per document', async () => {
      const mock = makeRulesClientMock();
      mock.createRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.createRule('rule-1', {
        ...createBody,
        params: {
          timestampField: '@timestamp',
          query: 'FROM logs.child,logs.child.* METADATA _id, _source | WHERE KQL("message: error")',
        },
      });

      const data = lastCreateCall(mock).data as {
        query: { format: 'standalone'; breach: { query: string } };
      };
      expect(data.query.breach.query).toBe(
        'FROM logs.child, logs.child.* METADATA _id | WHERE KQL("message: error")'
      );
    });

    it('strips _source from updateRule queries while keeping _id', async () => {
      const mock = makeRulesClientMock();
      mock.updateRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.updateRule('rule-1', {
        ...updateBody,
        params: {
          timestampField: '@timestamp',
          query: 'FROM logs-* METADATA _id, _source | WHERE level == "error"',
        },
      });

      const data = lastUpdateCall(mock).data as {
        query: { format: 'standalone'; breach: { query: string } };
      };
      expect(data.query.breach.query).toBe('FROM logs-* METADATA _id | WHERE level == "error"');
    });

    it('leaves queries without METADATA unchanged', async () => {
      const mock = makeRulesClientMock();
      mock.createRule.mockResolvedValue({} as never);
      const adapter = makeAdapter(mock);
      await adapter.createRule('rule-1', {
        ...createBody,
        params: {
          timestampField: '@timestamp',
          query: 'FROM logs-* | WHERE level == "error"',
        },
      });

      const data = lastCreateCall(mock).data as {
        query: { format: 'standalone'; breach: { query: string } };
      };
      expect(data.query.breach.query).toBe('FROM logs-* | WHERE level == "error"');
    });
  });

  describe('createRule', () => {
    it('falls back to updateRule on 409 conflict', async () => {
      const mock = makeRulesClientMock();
      mock.createRule.mockRejectedValueOnce(Boom.conflict('exists'));
      mock.updateRule.mockResolvedValueOnce({} as never);
      const adapter = makeAdapter(mock);
      await adapter.createRule('rule-1', createBody);

      expect(mock.createRule).toHaveBeenCalledTimes(1);
      expect(mock.updateRule).toHaveBeenCalledTimes(1);
      expect(lastUpdateCall(mock).id).toBe('rule-1');
    });

    it('throws on non-409 errors', async () => {
      const mock = makeRulesClientMock();
      mock.createRule.mockRejectedValueOnce(Boom.badRequest('invalid'));
      const adapter = makeAdapter(mock);
      await expect(adapter.createRule('rule-1', createBody)).rejects.toMatchObject({
        output: { statusCode: 400 },
      });
    });
  });

  describe('updateRule', () => {
    it('falls back to createRule on 404 not found', async () => {
      const mock = makeRulesClientMock();
      mock.updateRule.mockRejectedValueOnce(Boom.notFound('missing'));
      mock.createRule.mockResolvedValueOnce({} as never);
      const adapter = makeAdapter(mock);
      await adapter.updateRule('rule-1', updateBody);

      expect(mock.updateRule).toHaveBeenCalledTimes(1);
      expect(mock.createRule).toHaveBeenCalledTimes(1);
      expect(lastCreateCall(mock).options).toEqual({ id: 'rule-1' });
    });

    it('treats 409 during the fallback create as success (breaks the 404/409 cycle)', async () => {
      const mock = makeRulesClientMock();
      mock.updateRule.mockRejectedValueOnce(Boom.notFound('missing'));
      mock.createRule.mockRejectedValueOnce(Boom.conflict('race'));
      const adapter = makeAdapter(mock);
      await expect(adapter.updateRule('rule-1', updateBody)).resolves.toBeUndefined();

      expect(mock.createRule).toHaveBeenCalledTimes(1);
      expect(mock.updateRule).toHaveBeenCalledTimes(1);
    });

    it('throws on non-404 errors', async () => {
      const mock = makeRulesClientMock();
      mock.updateRule.mockRejectedValueOnce(Boom.forbidden('no'));
      const adapter = makeAdapter(mock);
      await expect(adapter.updateRule('rule-1', updateBody)).rejects.toMatchObject({
        output: { statusCode: 403 },
      });
    });
  });

  describe('bulkDeleteRules', () => {
    it('calls bulkDeleteRules with ids', async () => {
      const mock = makeRulesClientMock();
      mock.bulkDeleteRules.mockResolvedValue({ rules: [], errors: [] });
      const adapter = makeAdapter(mock);
      await adapter.bulkDeleteRules(['id-1', 'id-2']);

      expect(mock.bulkDeleteRules).toHaveBeenCalledWith({ ids: ['id-1', 'id-2'] });
    });

    it('is a no-op for an empty array', async () => {
      const mock = makeRulesClientMock();
      const adapter = makeAdapter(mock);
      await adapter.bulkDeleteRules([]);

      expect(mock.bulkDeleteRules).not.toHaveBeenCalled();
    });

    it('treats per-rule 404 errors as benign', async () => {
      const mock = makeRulesClientMock();
      mock.bulkDeleteRules.mockResolvedValue({
        rules: [],
        errors: [{ id: 'id-1', error: { message: 'nope', statusCode: 404 } }],
      });
      const adapter = makeAdapter(mock);
      await expect(adapter.bulkDeleteRules(['id-1'])).resolves.toBeUndefined();
    });

    it('throws when any error is not 404', async () => {
      const mock = makeRulesClientMock();
      mock.bulkDeleteRules.mockResolvedValue({
        rules: [],
        errors: [{ id: 'id-1', error: { message: 'storage failure', statusCode: 500 } }],
      });
      const adapter = makeAdapter(mock);
      await expect(adapter.bulkDeleteRules(['id-1'])).rejects.toThrow(
        'V2 bulk delete failed for 1 rule(s)'
      );
    });
  });
});

describe('RulesNotInstalledAdapterV2', () => {
  it('bulkDeleteRules is a no-op', async () => {
    const adapter = new RulesNotInstalledAdapterV2(loggerMock.create());
    await expect(adapter.bulkDeleteRules(['a'])).resolves.toBeUndefined();
  });
});
