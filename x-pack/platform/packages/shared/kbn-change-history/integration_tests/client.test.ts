/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { ToolingLog } from '@kbn/tooling-log';
import type { EsTestCluster } from '@kbn/test';
import { createTestEsCluster } from '@kbn/test';
import { ChangeHistoryClient } from '..';
import { DATA_STREAM_NAME } from '../src/client';
import type { LogChangeHistoryOptions, ObjectChange } from '..';
import { sha256, REDACTED } from '../src/utils';
import { asKibanaClient } from '../test_utils';

const KIBANA_SPACE = 'default';
const TEST_MODULE = 'test-module';
const TEST_DATASET = 'test-dataset';

const defaultLogOpts: LogChangeHistoryOptions = {
  action: 'rule_create',
  username: 'test-user',
  userProfileId: 'test-user-profile-id',
  spaceId: 'default',
  refresh: true,
};

describe('ChangeHistoryClient', () => {
  let esServer: EsTestCluster;
  let esClient: Client;
  const logger = loggingSystemMock.createLogger();

  const defaultCostructorOpts = {
    module: TEST_MODULE,
    dataset: TEST_DATASET,
    logger,
    kibanaVersion: '1.0.0',
  };

  const cleanup = async () => {
    await esClient.indices.deleteDataStream({ name: DATA_STREAM_NAME }).catch(() => {});
    await esClient.indices.deleteIndexTemplate({ name: DATA_STREAM_NAME }).catch(() => {});
  };

  beforeAll(async () => {
    jest.setTimeout(30_000);
    esServer = createTestEsCluster({
      log: new ToolingLog({ writeTo: process.stdout, level: 'debug' }),
    });
    await esServer.start();
    esClient = asKibanaClient(esServer.getClient());
  });

  afterAll(async () => {
    await esServer.stop();
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('initialize', () => {
    const getEsDataStreams = async (name: string) => {
      try {
        const res = await esClient.indices.getDataStream({ name });
        return res?.data_streams?.map((s) => s.name) ?? [];
      } catch (error) {
        if (
          error.meta?.statusCode === 404 &&
          error.body?.error?.type === 'index_not_found_exception'
        ) {
          return [];
        }
        throw error;
      }
    };

    it('should initialize the data stream', async () => {
      const client = new ChangeHistoryClient(defaultCostructorOpts);
      expect(client.isInitialized()).toBe(false);

      expect(await getEsDataStreams(DATA_STREAM_NAME)).toHaveLength(0);

      await client.initialize(esClient);
      expect(client.isInitialized()).toBe(true);

      expect(await getEsDataStreams(DATA_STREAM_NAME)).toEqual([DATA_STREAM_NAME]);

      const result = await client.getHistory(KIBANA_SPACE, 'rule', 'any-id');
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('enrolls the data stream in DSL lifecycle without ILM or data_retention', async () => {
      const client = new ChangeHistoryClient(defaultCostructorOpts);
      await client.initialize(esClient);

      const template = await esClient.indices.getIndexTemplate({ name: DATA_STREAM_NAME });
      const indexTemplate = template.index_templates[0]?.index_template;
      expect(indexTemplate?.template?.settings?.index?.lifecycle?.name).toBeUndefined();
      expect(indexTemplate?.template?.lifecycle).toEqual({ enabled: true });
    });
  });

  describe('error behavior', () => {
    it('should throw when creating with invalid module or dataset', async () => {
      await expect(
        () => new ChangeHistoryClient({ ...defaultCostructorOpts, module: 'invalid|module' })
      ).toThrow('Invalid module');
      await expect(
        () => new ChangeHistoryClient({ ...defaultCostructorOpts, dataset: 'invalid|dataset' })
      ).toThrow('Invalid dataset');
    });

    it('should throw when log is called before initialize', async () => {
      const client = new ChangeHistoryClient(defaultCostructorOpts);
      const change: ObjectChange = {
        objectType: 'rule',
        objectId: 'id-1',
        snapshot: { name: 'Rule 1' },
      };
      await expect(() =>
        client.log(change, { ...defaultLogOpts, spaceId: 'default' })
      ).rejects.toThrow('Change history data stream not initialized');
    });

    it('should throw when getHistory is called before initialize', async () => {
      const client = new ChangeHistoryClient(defaultCostructorOpts);
      await expect(() => client.getHistory(KIBANA_SPACE, 'rule', 'id-1')).rejects.toThrow(
        'Change history data stream not initialized'
      );
    });

    it('should throw when getHistoryByFields is called before initialize', async () => {
      const client = new ChangeHistoryClient(defaultCostructorOpts);
      await expect(() =>
        client.getHistoryByFields(KIBANA_SPACE, 'rule', 'id-1', ['user.name'])
      ).rejects.toThrow('Change history data stream not initialized');
    });
  });

  describe('log and getHistory', () => {
    let client: ChangeHistoryClient;

    beforeEach(async () => {
      client = new ChangeHistoryClient(defaultCostructorOpts);
      await client.initialize(esClient);
    });

    it('should log one change and return it via getHistory', async () => {
      const change: ObjectChange = {
        objectType: 'rule',
        objectId: 'id-1',
        sequence: 1,
        snapshot: { name: 'Rule 1', enabled: true },
      };
      const hash = sha256(JSON.stringify(change.snapshot));
      await client.log(change, { ...defaultLogOpts, spaceId: 'default' });

      const result = await client.getHistory(KIBANA_SPACE, 'rule', 'id-1');
      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      const doc = result.items[0];
      expect(doc).toMatchObject({
        '@timestamp': expect.any(String),
        ecs: { version: '9.3.0' },
        user: { name: 'test-user', id: 'test-user-profile-id' },
        event: {
          id: expect.any(String),
          created: expect.any(String),
          module: TEST_MODULE,
          dataset: TEST_DATASET,
          action: 'rule_create',
          type: 'change',
        },
        object: {
          type: 'rule',
          id: 'id-1',
          hash,
          sequence: 1,
          fields: { hashed: [] },
          snapshot: { name: 'Rule 1', enabled: true },
        },
        service: {
          type: 'kibana',
          version: expect.any(String),
        },
      });
      expect(doc).not.toHaveProperty('kibana');
    });
  });

  describe('logBulk and getHistory', () => {
    let client: ChangeHistoryClient;

    beforeEach(async () => {
      client = new ChangeHistoryClient(defaultCostructorOpts);
      await client.initialize(esClient);
    });

    it('should log multiple changes and return them via getHistory with correct count and ordering', async () => {
      const timestamp = new Date(Date.now() - 1).toISOString();
      const changes: ObjectChange[] = [
        { objectType: 'rule', objectId: 'id-a', snapshot: { name: 'Rule A update 1' } },
        { objectType: 'rule', objectId: 'id-c', snapshot: { name: 'Rule C update 3' } },
        {
          objectType: 'rule',
          objectId: 'id-b',
          snapshot: { name: 'Rule B update 3' },
          sequence: 3,
        }, // <-- higher sequence, happened later
        { objectType: 'rule', objectId: 'id-a', snapshot: { name: 'Rule A update 2' } },
      ];
      await client.logBulk(changes, { ...defaultLogOpts, spaceId: 'default' });
      const changes2: ObjectChange[] = [
        { objectType: 'rule', objectId: 'id-a', snapshot: { name: 'Rule A update 3' } },
        { objectType: 'rule', objectId: 'id-c', snapshot: { name: 'Rule C update 1' }, timestamp }, // <-- older timestamp, happened first
        {
          objectType: 'rule',
          objectId: 'id-b',
          snapshot: { name: 'Rule B update 1' },
          sequence: 1,
        },
        {
          objectType: 'rule',
          objectId: 'id-b',
          snapshot: { name: 'Rule B update 2' },
          sequence: 2,
        },
        { objectType: 'rule', objectId: 'id-c', snapshot: { name: 'Rule C update 2' }, timestamp }, // <-- older timestamp, happened first
        { objectType: 'rule', objectId: 'id-c', snapshot: { name: 'Rule C update 4' } },
      ];
      await client.logBulk(changes2, { ...defaultLogOpts, spaceId: 'default' });

      // Check Rule A
      const resultA = await client.getHistory(KIBANA_SPACE, 'rule', 'id-a');
      expect(resultA.total).toBe(3);
      const snapshotsA = resultA.items.map((i) => i.object.snapshot);
      expect(snapshotsA).toEqual([
        { name: 'Rule A update 3' },
        { name: 'Rule A update 2' },
        { name: 'Rule A update 1' },
      ]);

      // Check Rule B
      const resultB = await client.getHistory(KIBANA_SPACE, 'rule', 'id-b');
      expect(resultB.total).toBe(3);
      const snapshotsB = resultB.items.map((i) => i.object.snapshot);
      expect(snapshotsB).toEqual([
        { name: 'Rule B update 3' },
        { name: 'Rule B update 2' },
        { name: 'Rule B update 1' },
      ]);

      // Check Rule C
      const resultC = await client.getHistory(KIBANA_SPACE, 'rule', 'id-c');
      expect(resultC.total).toBe(4);
      const snapshotsC = resultC.items.map((i) => i.object.snapshot);
      expect(snapshotsC).toEqual([
        { name: 'Rule C update 4' },
        { name: 'Rule C update 3' },
        { name: 'Rule C update 2' },
        { name: 'Rule C update 1' },
      ]);

      // Check decreasing Event Ids
      // (reverse order in the output)
      const eventIds = resultA.items.map((i) => i.event.id);
      expect(eventIds).toEqual(eventIds.slice().sort().reverse());

      // Check decreasing sequence
      const sequence = resultB.items.map((i) => i.object.sequence);
      expect(sequence).toEqual(sequence.slice().sort().reverse());

      // Check decreasing timestamps
      const timestamps = resultC.items.map((i) => i['@timestamp']);
      expect(timestamps).toEqual(timestamps.slice().sort().reverse());
    });

    it('should not throw on partial success when some bulk items fail', async () => {
      const changes: ObjectChange[] = [
        {
          objectType: 'rule',
          objectId: 'rule-id',
          snapshot: { name: 'First Rule' },
        },
        {
          objectType: 'rule',
          objectId: 'rule-id',
          snapshot: { name: 'Unindexable — bad sequence type' },
          // Intentionally wrong runtime type for ES (integration test only).
          sequence: 'not-an-integer' as unknown as number,
        },
        {
          objectType: 'rule',
          objectId: 'rule-id',
          snapshot: { name: 'Also unindexable — bad sequence type' },
          sequence: {} as unknown as number,
        },
        {
          objectType: 'rule',
          objectId: 'rule-id',
          snapshot: { name: 'Last Rule' },
        },
      ];
      await expect(
        client.logBulk(changes, { ...defaultLogOpts, spaceId: 'default' })
      ).resolves.not.toThrow();

      const result = await client.getHistory(KIBANA_SPACE, 'rule', 'rule-id');
      expect(result.total).toBe(2);
      const snapshots = result.items.map((i) => i.object.snapshot);
      expect(snapshots[0]).toEqual({ name: 'Last Rule' });
      expect(snapshots[1]).toEqual({ name: 'First Rule' });
    });
  });

  describe('masking selected fields', () => {
    let client: ChangeHistoryClient;

    beforeEach(async () => {
      client = new ChangeHistoryClient(defaultCostructorOpts);
      await client.initialize(esClient);
    });

    it('should hash and redact sensitive fields and list paths in object.fields', async () => {
      const change: ObjectChange = {
        objectType: 'rule',
        objectId: 'masked-id',
        snapshot: {
          name: 'My Rule',
          user: { name: 'Alice' },
          apiKey: 'sk-secret-key-12345',
        },
      };
      const fieldsToHash = {
        apiKey: true,
      };
      const fieldsToRedact = {
        user: { name: true },
      };
      await client.log(change, {
        ...defaultLogOpts,
        spaceId: 'default',
        fieldsToHash,
        fieldsToRedact,
      });

      const result = await client.getHistory(KIBANA_SPACE, 'rule', 'masked-id');
      expect(result.total).toBe(1);
      const doc = result.items[0];

      // Check hash
      const hash = sha256(JSON.stringify(change.snapshot));
      expect(doc.object.hash).toEqual(hash);

      // Check hashed and redacted field paths
      expect(doc.object.fields.hashed).toEqual(['apiKey']);
      expect(doc.object.fields.redacted).toEqual(['user.name']);
      const snapshot = doc.object.snapshot as Record<string, unknown>;
      expect(snapshot).toEqual({
        name: 'My Rule',
        user: {
          name: REDACTED,
        },
        apiKey: sha256('masked-id' + 'sk-secret-key-12345').slice(-12),
      });
    });
  });

  describe('getHistoryByFields', () => {
    let client: ChangeHistoryClient;

    beforeEach(async () => {
      client = new ChangeHistoryClient(defaultCostructorOpts);
      await client.initialize(esClient);
    });

    it('should bucket user.name scoped to the object', async () => {
      await client.logBulk(
        [
          { objectType: 'rule', objectId: 'actor-rule', snapshot: { name: 'v1' } },
          { objectType: 'rule', objectId: 'actor-rule', snapshot: { name: 'v2' } },
          { objectType: 'rule', objectId: 'other-rule', snapshot: { name: 'other' } },
        ],
        { ...defaultLogOpts, username: 'alice', userProfileId: 'alice-profile', spaceId: 'default' }
      );
      await client.log(
        { objectType: 'rule', objectId: 'actor-rule', snapshot: { name: 'v3' } },
        { ...defaultLogOpts, username: 'bob', userProfileId: 'bob-profile', spaceId: 'default' }
      );

      const { results } = await client.getHistoryByFields(KIBANA_SPACE, 'rule', 'actor-rule', [
        'user.name',
      ]);

      expect(results).toEqual([
        {
          field: 'user.name',
          buckets: [
            { key: 'alice', docCount: 2 },
            { key: 'bob', docCount: 1 },
          ],
          sumOtherDocCount: 0,
        },
      ]);
    });

    it('should bucket event.action values', async () => {
      await client.log(
        { objectType: 'rule', objectId: 'action-rule', snapshot: { name: 'v1' } },
        { ...defaultLogOpts, action: 'rule_create', spaceId: 'default' }
      );
      await client.log(
        { objectType: 'rule', objectId: 'action-rule', snapshot: { name: 'v2' } },
        { ...defaultLogOpts, action: 'rule_update', spaceId: 'default' }
      );

      const { results } = await client.getHistoryByFields(KIBANA_SPACE, 'rule', 'action-rule', [
        'event.action',
      ]);

      expect(results).toEqual([
        {
          field: 'event.action',
          buckets: [
            { key: 'rule_create', docCount: 1 },
            { key: 'rule_update', docCount: 1 },
          ],
          sumOtherDocCount: 0,
        },
      ]);
    });

    it('should return empty buckets for an object with no history', async () => {
      const { results } = await client.getHistoryByFields(KIBANA_SPACE, 'rule', 'empty-rule', [
        'user.name',
      ]);

      expect(results).toEqual([
        {
          field: 'user.name',
          buckets: [],
          sumOtherDocCount: 0,
        },
      ]);
    });

    it('should expose sumOtherDocCount when bucket size is exceeded', async () => {
      for (const username of ['user-a', 'user-b', 'user-c']) {
        await client.log(
          { objectType: 'rule', objectId: 'trunc-rule', snapshot: { name: username } },
          { ...defaultLogOpts, username, spaceId: 'default' }
        );
      }

      const { results } = await client.getHistoryByFields(
        KIBANA_SPACE,
        'rule',
        'trunc-rule',
        ['user.name'],
        { size: 2 }
      );

      expect(results[0]?.buckets).toHaveLength(2);
      expect(results[0]?.sumOtherDocCount).toBe(1);
    });

    it('should honor additionalFilters in getHistoryByFields', async () => {
      await client.log(
        { objectType: 'rule', objectId: 'filtered-actors', snapshot: { name: 'old' } },
        { ...defaultLogOpts, username: 'old-user', spaceId: 'default' }
      );
      await client.log(
        { objectType: 'rule', objectId: 'filtered-actors', snapshot: { name: 'new' } },
        { ...defaultLogOpts, username: 'recent-user', spaceId: 'default' }
      );

      const { results } = await client.getHistoryByFields(
        KIBANA_SPACE,
        'rule',
        'filtered-actors',
        ['user.name'],
        {
          additionalFilters: [{ term: { 'user.name': 'recent-user' } }],
        }
      );

      expect(results).toEqual([
        {
          field: 'user.name',
          buckets: [{ key: 'recent-user', docCount: 1 }],
          sumOtherDocCount: 0,
        },
      ]);
    });

    it('returns empty buckets for unmapped fields instead of failing the request', async () => {
      await client.log(
        { objectType: 'rule', objectId: 'bad-agg-rule', snapshot: { name: 'v1' } },
        { ...defaultLogOpts, spaceId: 'default', data: { event: { reason: 'because' } } }
      );

      // `event.reason` is unmapped (`dynamic: false`) and not in ChangeHistoryAggregateField.
      // Soft-parse degrades to empty buckets; the allowlist is the real API contract.
      const { results } = await client.getHistoryByFields(KIBANA_SPACE, 'rule', 'bad-agg-rule', [
        'event.reason' as 'user.name',
      ]);

      expect(results).toEqual([
        {
          field: 'event.reason',
          buckets: [],
          sumOtherDocCount: 0,
        },
      ]);
    });

    it('should bucket multiple fields in one search', async () => {
      await client.log(
        { objectType: 'rule', objectId: 'multi-facet-rule', snapshot: { name: 'v1' } },
        {
          ...defaultLogOpts,
          action: 'rule_create',
          username: 'alice',
          spaceId: 'default',
        }
      );
      await client.log(
        { objectType: 'rule', objectId: 'multi-facet-rule', snapshot: { name: 'v2' } },
        {
          ...defaultLogOpts,
          action: 'rule_update',
          username: 'bob',
          spaceId: 'default',
        }
      );
      await client.log(
        { objectType: 'rule', objectId: 'multi-facet-rule', snapshot: { name: 'v3' } },
        {
          ...defaultLogOpts,
          action: 'rule_update',
          username: 'alice',
          spaceId: 'default',
        }
      );

      const { results } = await client.getHistoryByFields(
        KIBANA_SPACE,
        'rule',
        'multi-facet-rule',
        ['user.name', 'event.action']
      );

      expect(results).toEqual([
        {
          field: 'user.name',
          buckets: [
            { key: 'alice', docCount: 2 },
            { key: 'bob', docCount: 1 },
          ],
          sumOtherDocCount: 0,
        },
        {
          field: 'event.action',
          buckets: [
            { key: 'rule_update', docCount: 2 },
            { key: 'rule_create', docCount: 1 },
          ],
          sumOtherDocCount: 0,
        },
      ]);
    });
  });
});
