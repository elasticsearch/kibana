/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract, ISavedObjectsRepository } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { PartiallyUpdateableRuleAttributes } from './partially_update_rule';
import {
  atomicRemoveSnoozedInstancesWithEs,
  partiallyUpdateRule,
  partiallyUpdateRuleWithEs,
} from './partially_update_rule';
import { elasticsearchServiceMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { RULE_SAVED_OBJECT_TYPE } from '.';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import type { estypes } from '@elastic/elasticsearch';
import type { RuleExecutionStatuses } from '@kbn/alerting-types';
const MockSavedObjectsClientContract = savedObjectsClientMock.create();
const MockISavedObjectsRepository =
  MockSavedObjectsClientContract as unknown as jest.Mocked<ISavedObjectsRepository>;
const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

describe('partiallyUpdateRule', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  for (const [soClientName, soClient] of Object.entries(getMockSavedObjectClients()))
    describe(`using ${soClientName}`, () => {
      test('should work with no options', async () => {
        soClient.update.mockResolvedValueOnce(MockUpdateValue);

        await partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes);
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          DefaultAttributes,
          {}
        );
      });

      test('should work with extraneous attributes ', async () => {
        const attributes = ExtraneousAttributes as unknown as PartiallyUpdateableRuleAttributes;
        soClient.update.mockResolvedValueOnce(MockUpdateValue);

        await partiallyUpdateRule(soClient, MockRuleId, attributes);
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          ExtraneousAttributes,
          {}
        );
      });

      test('should handle SO errors', async () => {
        soClient.update.mockRejectedValueOnce(new Error('wops'));

        await expect(
          partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes)
        ).rejects.toThrowError('wops');
      });

      test('should handle the version option', async () => {
        soClient.update.mockResolvedValueOnce(MockUpdateValue);

        await partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes, { version: '1.2.3' });
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          DefaultAttributes,
          {
            version: '1.2.3',
          }
        );
      });

      test('should handle the ignore404 option', async () => {
        const err = SavedObjectsErrorHelpers.createGenericNotFoundError();
        soClient.update.mockRejectedValueOnce(err);

        await partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes, { ignore404: true });
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          DefaultAttributes,
          {}
        );
      });

      test('should handle the namespace option', async () => {
        soClient.update.mockResolvedValueOnce(MockUpdateValue);

        await partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes, {
          namespace: 'bat.cave',
        });
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          DefaultAttributes,
          {
            namespace: 'bat.cave',
          }
        );
      });
    });
});

describe('partiallyUpdateRuleWithEs', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  test('should work with no options', async () => {
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await partiallyUpdateRuleWithEs(esClient, MockRuleId, DefaultAttributesForEsUpdate);
    expect(esClient.update).toHaveBeenCalledTimes(1);
    expect(esClient.update).toHaveBeenCalledWith({
      id: `alert:${MockRuleId}`,
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      doc: {
        alert: DefaultAttributesForEsUpdate,
      },
    });
  });

  test('should strip unallowed attributes ', async () => {
    const attributes =
      AttributesForEsUpdateWithUnallowedFields as unknown as PartiallyUpdateableRuleAttributes;
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await partiallyUpdateRuleWithEs(esClient, MockRuleId, attributes);
    expect(esClient.update).toHaveBeenCalledWith({
      id: `alert:${MockRuleId}`,
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      doc: {
        alert: DefaultAttributesForEsUpdate,
      },
    });
  });

  test('should handle ES errors', async () => {
    esClient.update.mockRejectedValueOnce(new Error('wops'));

    await expect(
      partiallyUpdateRuleWithEs(esClient, MockRuleId, DefaultAttributes)
    ).rejects.toThrowError('wops');
  });

  test('should handle the version option', async () => {
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await partiallyUpdateRuleWithEs(esClient, MockRuleId, DefaultAttributesForEsUpdate, {
      version: 'WzQsMV0=',
    });
    expect(esClient.update).toHaveBeenCalledWith({
      id: `alert:${MockRuleId}`,
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      if_primary_term: 1,
      if_seq_no: 4,
      doc: {
        alert: DefaultAttributesForEsUpdate,
      },
    });
  });

  test('should handle the ignore404 option', async () => {
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await partiallyUpdateRuleWithEs(esClient, MockRuleId, DefaultAttributesForEsUpdate, {
      ignore404: true,
    });
    expect(esClient.update).toHaveBeenCalledWith(
      {
        id: `alert:${MockRuleId}`,
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        doc: {
          alert: DefaultAttributesForEsUpdate,
        },
      },
      { ignore: [404] }
    );
  });

  test('should handle the refresh option', async () => {
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await partiallyUpdateRuleWithEs(esClient, MockRuleId, DefaultAttributesForEsUpdate, {
      refresh: 'wait_for',
    });
    expect(esClient.update).toHaveBeenCalledWith({
      id: `alert:${MockRuleId}`,
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      doc: {
        alert: DefaultAttributesForEsUpdate,
      },
      refresh: 'wait_for',
    });
  });
});

describe('atomicRemoveSnoozedInstancesWithEs', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  test('should call update with a Painless script (not a doc) and retry_on_conflict', async () => {
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    const expiredInstances = [
      { instanceId: 'alert-1', snoozedAt: '2024-01-01T00:00:00.000Z' },
      { instanceId: 'alert-2', snoozedAt: '2024-01-02T00:00:00.000Z' },
    ];

    await atomicRemoveSnoozedInstancesWithEs(esClient, MockRuleId, expiredInstances);

    expect(esClient.update).toHaveBeenCalledTimes(1);
    expect(esClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `alert:${MockRuleId}`,
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        retry_on_conflict: 3,
        script: expect.objectContaining({
          lang: 'painless',
          params: { expired: expiredInstances },
        }),
      })
    );
    // Must not send a `doc` field — otherwise it would replace the whole array
    expect(esClient.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ doc: expect.anything() }),
      expect.anything()
    );
  });

  test('should pass ignore: [404] when ignore404 option is set', async () => {
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await atomicRemoveSnoozedInstancesWithEs(
      esClient,
      MockRuleId,
      [{ instanceId: 'alert-1', snoozedAt: '2024-01-01T00:00:00.000Z' }],
      { ignore404: true }
    );

    expect(esClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ retry_on_conflict: 3 }),
      { ignore: [404] }
    );
  });

  test('should include the refresh option when set', async () => {
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await atomicRemoveSnoozedInstancesWithEs(
      esClient,
      MockRuleId,
      [{ instanceId: 'alert-1', snoozedAt: '2024-01-01T00:00:00.000Z' }],
      { refresh: 'wait_for' }
    );

    expect(esClient.update).toHaveBeenCalledWith(expect.objectContaining({ refresh: 'wait_for' }));
  });

  test('should not include refresh when the option is not set', async () => {
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await atomicRemoveSnoozedInstancesWithEs(esClient, MockRuleId, [
      { instanceId: 'alert-1', snoozedAt: '2024-01-01T00:00:00.000Z' },
    ]);

    const [callArgs] = esClient.update.mock.calls[0];
    expect(callArgs).not.toHaveProperty('refresh');
  });

  test('should work with an empty expired array (idempotent noop)', async () => {
    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await atomicRemoveSnoozedInstancesWithEs(esClient, MockRuleId, []);

    expect(esClient.update).toHaveBeenCalledTimes(1);
    expect(esClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          params: { expired: [] },
        }),
      })
    );
  });

  test('should propagate ES errors', async () => {
    esClient.update.mockRejectedValueOnce(new Error('es error'));

    await expect(
      atomicRemoveSnoozedInstancesWithEs(esClient, MockRuleId, [
        { instanceId: 'alert-1', snoozedAt: '2024-01-01T00:00:00.000Z' },
      ])
    ).rejects.toThrowError('es error');
  });

  test('script params only include the original snoozedAt — re-created snooze with a newer snoozedAt is not targeted', async () => {
    // Simulate the race: runner decided to expire alert-1 at OLD_SNOOZED_AT,
    // but between the SO read and this write the user re-snoozed alert-1
    // (NEW_SNOOZED_AT). The expired array must only reference the original entry.
    const OLD_SNOOZED_AT = '2024-01-01T00:00:00.000Z';
    const NEW_SNOOZED_AT = '2024-06-01T00:00:00.000Z';

    esClient.update.mockResolvedValueOnce(MockEsUpdateResponse(MockRuleId));

    await atomicRemoveSnoozedInstancesWithEs(esClient, MockRuleId, [
      { instanceId: 'alert-1', snoozedAt: OLD_SNOOZED_AT },
    ]);

    // The script receives only the original (instanceId, snoozedAt) pair.
    // A concurrent re-snooze entry with NEW_SNOOZED_AT will not match the
    // Painless anyMatch predicate and will survive the removeIf.
    expect(esClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          params: {
            expired: [{ instanceId: 'alert-1', snoozedAt: OLD_SNOOZED_AT }],
          },
        }),
      })
    );
    // Verify NEW_SNOOZED_AT is not present in the params that drive removal
    const [callArgs] = esClient.update.mock.calls[0];
    const expired = (
      callArgs as unknown as { script: { params: { expired: Array<{ snoozedAt: string }> } } }
    ).script.params.expired;
    expect(expired.some((e) => e.snoozedAt === NEW_SNOOZED_AT)).toBe(false);
  });
});

function getMockSavedObjectClients(): Record<
  string,
  jest.Mocked<SavedObjectsClientContract | ISavedObjectsRepository>
> {
  return {
    SavedObjectsClientContract: MockSavedObjectsClientContract,
    // doesn't appear to be a mock for this, but it's basically the same as the above,
    // so just cast it to make sure we catch any type errors
    ISavedObjectsRepository: MockISavedObjectsRepository,
  };
}

const DefaultAttributes = {
  scheduledTaskId: 'scheduled-task-id',
  muteAll: true,
  mutedInstanceIds: ['muted-instance-id-1', 'muted-instance-id-2'],
  updatedBy: 'someone',
  updatedAt: '2019-02-12T21:01:22.479Z',
};

const ExtraneousAttributes = { ...DefaultAttributes, foo: 'bar' };

const DefaultAttributesForEsUpdate: PartiallyUpdateableRuleAttributes = {
  running: false,
  executionStatus: {
    status: 'active' as RuleExecutionStatuses,
    lastExecutionDate: '2023-01-01T08:44:40.000Z',
    lastDuration: 12,
    error: null,
    warning: null,
  },
  monitoring: {
    run: {
      calculated_metrics: {
        success_ratio: 20,
      },
      history: [
        {
          success: true,
          timestamp: 1640991880000,
          duration: 12,
          outcome: 'succeeded',
        },
      ],
      last_run: {
        timestamp: '2023-01-01T08:44:40.000Z',
        metrics: {
          duration: 12,
          gap_duration_s: null,
          total_alerts_created: null,
          total_alerts_detected: null,
          total_indexing_duration_ms: null,
          total_search_duration_ms: null,
        },
      },
    },
  },
  snoozeSchedule: [
    {
      duration: 1000,
      id: '1',
      rRule: {
        count: 1,
        dtstart: '2019-02-13T21:01:22.479Z',
        tzid: 'UTC',
      },
    },
  ],
};

const AttributesForEsUpdateWithUnallowedFields = {
  ...DefaultAttributesForEsUpdate,
  alertTypeId: 'foo',
  consumer: 'consumer',
  randomField: 'bar',
};

const MockRuleId = 'rule-id';

const MockUpdateValue = {
  id: MockRuleId,
  type: RULE_SAVED_OBJECT_TYPE,
  attributes: {
    actions: [],
    scheduledTaskId: 'scheduled-task-id',
  },
  references: [],
};

const MockEsUpdateResponse = (id: string) => ({
  _index: '.kibana_alerting_cases_9.0.0_001',
  _id: `alert:${id}`,
  _version: 3,
  result: 'updated' as estypes.Result,
  _shards: { total: 1, successful: 1, failed: 0 },
  _seq_no: 5,
  _primary_term: 1,
});
