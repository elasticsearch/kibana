/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BulkResponse } from '@elastic/elasticsearch/lib/api/types';
import type { DeeplyMockedApi } from '@kbn/core-elasticsearch-client-server-mocks';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import moment from 'moment';
import {
  ALERT_ACTIONS_DATA_STREAM,
  type AlertAction,
} from '../../resources/datastreams/alert_actions';
import type {
  ActionPolicySavedObjectAttributes,
  RuleSavedObjectAttributes,
} from '../../saved_objects';
import { createRuleSoAttributes } from '../test_utils';
import { createLoggerService } from '../services/logger_service/logger_service.mock';
import type { ActionPolicySavedObjectServiceContract } from '../services/action_policy_saved_object_service/action_policy_saved_object_service';
import { createActionPolicySavedObjectService } from '../services/action_policy_saved_object_service/action_policy_saved_object_service.mock';
import type { QueryServiceContract } from '../services/query_service/query_service';
import { createQueryService } from '../services/query_service/query_service.mock';
import type { RulesSavedObjectServiceContract } from '../services/rules_saved_object_service/rules_saved_object_service';
import { createRulesSavedObjectService } from '../services/rules_saved_object_service/rules_saved_object_service.mock';
import type { StorageServiceContract } from '../services/storage_service/storage_service';
import { createStorageService } from '../services/storage_service/storage_service.mock';
import { createSettingsService } from '../services/settings_service/settings_service.mock';
import { LOOKBACK_WINDOW_MINUTES } from './constants';
import { DispatcherService } from './dispatcher';
import { DispatcherPipeline, type DispatcherPipelineContract } from './execution_pipeline';
import {
  createAlertEpisodeSuppressionsResponse,
  createDispatchableAlertEventsResponse,
  createLastNotifiedTimestampsResponse,
} from './fixtures/dispatcher';
import { getDispatchableAlertEventsQuery } from './queries';
import {
  CheckEngineEnabledStep,
  FetchEpisodesStep,
  FetchSuppressionsStep,
  ApplySuppressionStep,
  FetchRulesStep,
  FetchPoliciesStep,
  EvaluateMatchersStep,
  BuildGroupsStep,
  ApplyThrottlingStep,
  DispatchStep,
  StoreActionsStep,
} from './steps';
import type { AlertEpisode, AlertEpisodeSuppression } from './types';

function mockRulesFindByIds(
  spy: jest.SpyInstance,
  ruleIds: string[],
  overrides?: Partial<RuleSavedObjectAttributes>
) {
  spy.mockResolvedValue(
    ruleIds.map((id) => ({
      id,
      attributes: createRuleSoAttributes(overrides),
      namespaces: ['default'],
    }))
  );
}

function mockNpFindAllDecrypted(
  spy: jest.SpyInstance,
  policyIds: string[],
  overrides: Partial<ActionPolicySavedObjectAttributes> = {}
) {
  spy.mockResolvedValue(
    policyIds.map((id) => ({
      id,
      attributes: {
        name: `Policy ${id}`,
        description: `Description for ${id}`,
        enabled: true,
        destinations: [{ type: 'workflow', id: 'workflow-test-id' }],
        auth: { apiKey: 'test-api-key', owner: 'elastic', createdByUser: false },
        createdBy: null,
        updatedBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
      },
      namespaces: ['default'],
    }))
  );
}

const createMockWorkflowsManagement = (): jest.Mocked<WorkflowsServerPluginSetup['management']> =>
  ({
    getWorkflow: jest.fn().mockResolvedValue(null),
    runWorkflow: jest.fn().mockResolvedValue('exec-1'),
  } as unknown as jest.Mocked<WorkflowsServerPluginSetup['management']>);

function buildDispatcherService(deps: {
  queryService: QueryServiceContract;
  storageService: StorageServiceContract;
  rulesSoService: RulesSavedObjectServiceContract;
  npSoService: ActionPolicySavedObjectServiceContract;
  workflowsManagement: WorkflowsServerPluginSetup['management'];
}): DispatcherService {
  const { loggerService } = createLoggerService();
  const { settingsService, mockUiSettingsClient } = createSettingsService();
  mockUiSettingsClient.get.mockResolvedValue(true);

  const pipeline = new DispatcherPipeline(loggerService, [
    new CheckEngineEnabledStep(loggerService, settingsService),
    new FetchEpisodesStep(deps.queryService),
    new FetchSuppressionsStep(deps.queryService),
    new ApplySuppressionStep(),
    new FetchRulesStep(deps.rulesSoService),
    new FetchPoliciesStep(deps.npSoService),
    new EvaluateMatchersStep(loggerService),
    new BuildGroupsStep(),
    new ApplyThrottlingStep(deps.queryService, loggerService),
    new DispatchStep(loggerService, deps.workflowsManagement),
    new StoreActionsStep(deps.storageService),
  ]);
  return new DispatcherService(pipeline);
}

describe('DispatcherService', () => {
  let dispatcherService: DispatcherService;
  let queryService: QueryServiceContract;
  let storageService: StorageServiceContract;
  let queryEsClient: DeeplyMockedApi<ElasticsearchClient>;
  let storageEsClient: jest.Mocked<ElasticsearchClient>;
  let rulesSoService: RulesSavedObjectServiceContract;
  let npSoService: ActionPolicySavedObjectServiceContract;
  let mockFindByIds: jest.SpyInstance;
  let mockFindAllDecrypted: jest.SpyInstance;
  let mockWfm: jest.Mocked<WorkflowsServerPluginSetup['management']>;

  beforeEach(() => {
    ({ queryService, mockEsClient: queryEsClient } = createQueryService());
    ({ storageService, mockEsClient: storageEsClient } = createStorageService());

    const rulesMock = createRulesSavedObjectService();
    rulesSoService = rulesMock.rulesSavedObjectService;
    mockFindByIds = rulesMock.mockFindByIds;
    mockRulesFindByIds(mockFindByIds, ['rule-1', 'rule-2']);

    const npMock = createActionPolicySavedObjectService();
    npSoService = npMock.actionPolicySavedObjectService;
    mockFindAllDecrypted = npMock.mockFindAllDecrypted;
    mockNpFindAllDecrypted(mockFindAllDecrypted, ['policy_456']);

    mockWfm = createMockWorkflowsManagement();

    dispatcherService = buildDispatcherService({
      queryService,
      storageService,
      rulesSoService,
      npSoService,
      workflowsManagement: mockWfm,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('run', () => {
    it('indexes fire actions for dispatchable alert episodes when no suppressions exist', async () => {
      const alertEpisodes: AlertEpisode[] = [
        {
          last_event_timestamp: '2026-01-22T07:10:00.000Z',
          rule_id: 'rule-1',
          group_hash: 'hash-1',
          episode_id: 'episode-1',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-22T07:15:00.000Z',
          rule_id: 'rule-2',
          group_hash: 'hash-2',
          episode_id: 'episode-2',
          episode_status: 'inactive',
        },
      ];

      const suppressions: AlertEpisodeSuppression[] = [
        {
          rule_id: 'rule-1',
          group_hash: 'hash-1',
          episode_id: 'episode-1',
          should_suppress: false,
        },
        {
          rule_id: 'rule-2',
          group_hash: 'hash-2',
          episode_id: 'episode-2',
          should_suppress: false,
        },
      ];

      queryEsClient.esql.query
        .mockResolvedValueOnce(createDispatchableAlertEventsResponse(alertEpisodes))
        .mockResolvedValueOnce(createAlertEpisodeSuppressionsResponse(suppressions))
        .mockResolvedValueOnce(createLastNotifiedTimestampsResponse());

      storageEsClient.bulk.mockResolvedValue({
        items: [{ create: { _id: '1', status: 201 } }, { create: { _id: '2', status: 201 } }],
        errors: false,
      } as BulkResponse);

      const previousStartedAt = new Date('2026-01-22T07:30:00.000Z');

      const result = await dispatcherService.run({
        previousStartedAt,
      });

      expect(result.startedAt).toBeInstanceOf(Date);

      const expectedLookback = moment(previousStartedAt)
        .subtract(LOOKBACK_WINDOW_MINUTES, 'minutes')
        .toISOString();

      expect(queryEsClient.esql.query).toHaveBeenCalledTimes(3);
      expect(queryEsClient.esql.query).toHaveBeenCalledWith(
        {
          query: getDispatchableAlertEventsQuery().query,
          drop_null_columns: false,
          filter: {
            range: {
              '@timestamp': {
                gte: expectedLookback,
              },
            },
          },
          params: undefined,
        },
        { signal: undefined }
      );

      expect(storageEsClient.bulk).toHaveBeenCalledWith({
        operations: expect.any(Array),
        refresh: false,
      });

      const [{ operations }] = storageEsClient.bulk.mock.calls[0];
      const safeOperations = operations ?? [];
      const createOperations = safeOperations.filter((_, index) => index % 2 === 0);
      const docs = safeOperations.filter((_, index) => index % 2 === 1);
      expect(createOperations).toEqual(
        expect.arrayContaining([{ create: { _index: ALERT_ACTIONS_DATA_STREAM } }])
      );

      const fireActions = docs.filter((d: any) => d.action_type === 'fire');
      const notifiedActions = docs.filter((d: any) => d.action_type === 'notified');
      expect(fireActions).toHaveLength(alertEpisodes.length);
      expect(notifiedActions).toHaveLength(alertEpisodes.length);

      expect(docs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            group_hash: 'hash-1',
            last_series_event_timestamp: '2026-01-22T07:10:00.000Z',
            actor: 'system',
            action_type: 'fire',
            rule_id: 'rule-1',
            source: 'internal',
          }),
          expect.objectContaining({
            group_hash: 'hash-2',
            last_series_event_timestamp: '2026-01-22T07:15:00.000Z',
            actor: 'system',
            action_type: 'fire',
            rule_id: 'rule-2',
            source: 'internal',
          }),
        ])
      );
    });

    it('indexes suppress actions for suppressed alert episodes', async () => {
      const alertEpisodes: AlertEpisode[] = [
        {
          last_event_timestamp: '2026-01-22T07:10:00.000Z',
          rule_id: 'rule-1',
          group_hash: 'hash-1',
          episode_id: 'episode-1',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-22T07:15:00.000Z',
          rule_id: 'rule-2',
          group_hash: 'hash-2',
          episode_id: 'episode-2',
          episode_status: 'active',
        },
      ];

      const suppressions: AlertEpisodeSuppression[] = [
        {
          rule_id: 'rule-1',
          group_hash: 'hash-1',
          episode_id: 'episode-1',
          should_suppress: true,
        },
        {
          rule_id: 'rule-2',
          group_hash: 'hash-2',
          episode_id: 'episode-2',
          should_suppress: false,
        },
      ];

      queryEsClient.esql.query
        .mockResolvedValueOnce(createDispatchableAlertEventsResponse(alertEpisodes))
        .mockResolvedValueOnce(createAlertEpisodeSuppressionsResponse(suppressions))
        .mockResolvedValueOnce(createLastNotifiedTimestampsResponse());

      storageEsClient.bulk.mockResolvedValue({
        items: [{ create: { _id: '1', status: 201 } }, { create: { _id: '2', status: 201 } }],
        errors: false,
      } as BulkResponse);

      const result = await dispatcherService.run({
        previousStartedAt: new Date('2026-01-22T07:30:00.000Z'),
      });

      expect(result.startedAt).toBeInstanceOf(Date);

      const [{ operations }] = storageEsClient.bulk.mock.calls[0];
      const safeOperations = operations ?? [];
      const docs = safeOperations.filter((_, index) => index % 2 === 1);

      const suppressDocs = docs.filter((d: any) => d.action_type === 'suppress');
      const fireDocs = docs.filter((d: any) => d.action_type === 'fire');
      expect(suppressDocs).toHaveLength(1);
      expect(fireDocs).toHaveLength(1);

      expect(docs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            group_hash: 'hash-1',
            last_series_event_timestamp: '2026-01-22T07:10:00.000Z',
            actor: 'system',
            action_type: 'suppress',
            rule_id: 'rule-1',
            source: 'internal',
          }),
          expect.objectContaining({
            group_hash: 'hash-2',
            last_series_event_timestamp: '2026-01-22T07:15:00.000Z',
            actor: 'system',
            action_type: 'fire',
            rule_id: 'rule-2',
            source: 'internal',
          }),
        ])
      );
    });

    it('handles empty alert episode responses', async () => {
      queryEsClient.esql.query.mockResolvedValue(createDispatchableAlertEventsResponse([]));

      const result = await dispatcherService.run({
        previousStartedAt: new Date('2026-01-22T07:30:00.000Z'),
      });

      expect(result.startedAt).toBeInstanceOf(Date);
      expect(queryEsClient.esql.query).toHaveBeenCalledTimes(1);
      expect(storageEsClient.bulk).not.toHaveBeenCalled();
    });

    it('dispatches correct fire/suppress actions across 5 rules with ack, unack, snooze, and deactivate suppressions', async () => {
      const rulesMock = createRulesSavedObjectService();
      rulesSoService = rulesMock.rulesSavedObjectService;
      mockFindByIds = rulesMock.mockFindByIds;
      mockRulesFindByIds(mockFindByIds, [
        'rule-001',
        'rule-002',
        'rule-003',
        'rule-004',
        'rule-005',
      ]);

      const npMock = createActionPolicySavedObjectService();
      npSoService = npMock.actionPolicySavedObjectService;
      mockFindAllDecrypted = npMock.mockFindAllDecrypted;
      mockNpFindAllDecrypted(mockFindAllDecrypted, ['policy_456'], {
        throttle: { interval: '1h' },
      });

      mockWfm = createMockWorkflowsManagement();

      dispatcherService = buildDispatcherService({
        queryService,
        storageService,
        rulesSoService,
        npSoService,
        workflowsManagement: mockWfm,
      });

      // Dataset: 5 rules, 9 episodes total
      // rule-001: single series, ack then unack → fire
      // rule-002: single series, ack with no unack → suppress
      // rule-003: two series (series-1 active, series-2 recovered + new episode) → all fire (no actions)
      // rule-004: two series, both snoozed (null episode_id) → both suppress
      // rule-005: two series, series-1 deactivated → suppress; series-2 no actions → fire
      const alertEpisodes: AlertEpisode[] = [
        {
          last_event_timestamp: '2026-01-27T16:15:00.000Z',
          rule_id: 'rule-001',
          group_hash: 'rule-001-series-1',
          episode_id: 'rule-001-series-1-episode-1',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-27T16:15:00.000Z',
          rule_id: 'rule-002',
          group_hash: 'rule-002-series-1',
          episode_id: 'rule-002-series-1-episode-1',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-27T16:15:00.000Z',
          rule_id: 'rule-003',
          group_hash: 'rule-003-series-1',
          episode_id: 'rule-003-series-1-episode-1',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-27T16:00:00.000Z',
          rule_id: 'rule-003',
          group_hash: 'rule-003-series-2',
          episode_id: 'rule-003-series-2-episode-1',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-27T16:05:00.000Z',
          rule_id: 'rule-003',
          group_hash: 'rule-003-series-2',
          episode_id: 'rule-003-series-2-episode-1',
          episode_status: 'inactive',
        },
        {
          last_event_timestamp: '2026-01-27T16:15:00.000Z',
          rule_id: 'rule-003',
          group_hash: 'rule-003-series-2',
          episode_id: 'rule-003-series-2-episode-2',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-27T16:15:00.000Z',
          rule_id: 'rule-004',
          group_hash: 'rule-004-series-1',
          episode_id: 'rule-004-series-1-episode-1',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-27T16:15:00.000Z',
          rule_id: 'rule-004',
          group_hash: 'rule-004-series-2',
          episode_id: 'rule-004-series-2-episode-1',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-27T16:15:00.000Z',
          rule_id: 'rule-005',
          group_hash: 'rule-005-series-1',
          episode_id: 'rule-005-series-1-episode-1',
          episode_status: 'active',
        },
        {
          last_event_timestamp: '2026-01-27T16:15:00.000Z',
          rule_id: 'rule-005',
          group_hash: 'rule-005-series-2',
          episode_id: 'rule-005-series-2-episode-1',
          episode_status: 'active',
        },
      ];

      // Suppression query results:
      // - rule-001: ack at 16:03, then unack at 16:08 → should_suppress: false
      // - rule-002: ack at 16:03, no unack → should_suppress: true
      // - rule-003: no actions → no suppression records
      // - rule-004: snoozed at 16:03 (null episode_id, applies to all) → should_suppress: true
      // - rule-005 series-1: deactivated at 16:08 → should_suppress: true
      // - rule-005 series-2: no actions → no suppression record
      const suppressions: AlertEpisodeSuppression[] = [
        {
          rule_id: 'rule-001',
          group_hash: 'rule-001-series-1',
          episode_id: 'rule-001-series-1-episode-1',
          should_suppress: false,
        },
        {
          rule_id: 'rule-002',
          group_hash: 'rule-002-series-1',
          episode_id: 'rule-002-series-1-episode-1',
          should_suppress: true,
        },
        {
          rule_id: 'rule-004',
          group_hash: 'rule-004-series-1',
          episode_id: null,
          should_suppress: true,
        },
        {
          rule_id: 'rule-004',
          group_hash: 'rule-004-series-2',
          episode_id: null,
          should_suppress: true,
        },
        {
          rule_id: 'rule-005',
          group_hash: 'rule-005-series-1',
          episode_id: 'rule-005-series-1-episode-1',
          should_suppress: true,
        },
      ];

      queryEsClient.esql.query
        .mockResolvedValueOnce(createDispatchableAlertEventsResponse(alertEpisodes))
        .mockResolvedValueOnce(createAlertEpisodeSuppressionsResponse(suppressions))
        .mockResolvedValueOnce(createLastNotifiedTimestampsResponse());

      storageEsClient.bulk.mockResolvedValue({
        items: Array.from({ length: 10 }, (_, i) => ({
          create: { _id: String(i + 1), status: 201 },
        })),
        errors: false,
      } as BulkResponse);

      const result = await dispatcherService.run({
        previousStartedAt: new Date('2026-01-25T00:00:00.000Z'),
      });

      expect(result.startedAt).toBeInstanceOf(Date);
      expect(queryEsClient.esql.query).toHaveBeenCalledTimes(3);

      const [{ operations }] = storageEsClient.bulk.mock.calls[0];

      const docs = (operations ?? []).filter((_, index) => index % 2 === 1) as AlertAction[];

      const fireActions = docs.filter((doc) => doc.action_type === 'fire');
      const suppressActions = docs.filter((doc) => doc.action_type === 'suppress');
      const notifiedActions = docs.filter((doc) => doc.action_type === 'notified');
      expect(fireActions).toHaveLength(6);
      expect(suppressActions).toHaveLength(4);
      expect(notifiedActions.length).toBeGreaterThan(0);

      // rule-001: fire (ack then unack cancels suppression)
      expect(docs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule_id: 'rule-001',
            group_hash: 'rule-001-series-1',
            last_series_event_timestamp: '2026-01-27T16:15:00.000Z',
            action_type: 'fire',
            actor: 'system',
            source: 'internal',
          }),
        ])
      );

      // rule-002: suppress (ack with no unack)
      expect(docs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule_id: 'rule-002',
            group_hash: 'rule-002-series-1',
            last_series_event_timestamp: '2026-01-27T16:15:00.000Z',
            action_type: 'suppress',
          }),
        ])
      );

      // rule-003: all fire (no actions exist)
      expect(docs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule_id: 'rule-003',
            group_hash: 'rule-003-series-1',
            last_series_event_timestamp: '2026-01-27T16:15:00.000Z',
            action_type: 'fire',
          }),
          expect.objectContaining({
            rule_id: 'rule-003',
            group_hash: 'rule-003-series-2',
            last_series_event_timestamp: '2026-01-27T16:00:00.000Z',
            action_type: 'fire',
          }),
          expect.objectContaining({
            rule_id: 'rule-003',
            group_hash: 'rule-003-series-2',
            last_series_event_timestamp: '2026-01-27T16:05:00.000Z',
            action_type: 'fire',
          }),
          expect.objectContaining({
            rule_id: 'rule-003',
            group_hash: 'rule-003-series-2',
            last_series_event_timestamp: '2026-01-27T16:15:00.000Z',
            action_type: 'fire',
          }),
        ])
      );

      // rule-004: both suppress (snoozed with null episode_id)
      expect(docs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule_id: 'rule-004',
            group_hash: 'rule-004-series-1',
            last_series_event_timestamp: '2026-01-27T16:15:00.000Z',
            action_type: 'suppress',
          }),
          expect.objectContaining({
            rule_id: 'rule-004',
            group_hash: 'rule-004-series-2',
            last_series_event_timestamp: '2026-01-27T16:15:00.000Z',
            action_type: 'suppress',
          }),
        ])
      );

      // rule-005: series-1 suppress (deactivated), series-2 fire (no actions)
      expect(docs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule_id: 'rule-005',
            group_hash: 'rule-005-series-1',
            last_series_event_timestamp: '2026-01-27T16:15:00.000Z',
            action_type: 'suppress',
          }),
          expect.objectContaining({
            rule_id: 'rule-005',
            group_hash: 'rule-005-series-2',
            last_series_event_timestamp: '2026-01-27T16:15:00.000Z',
            action_type: 'fire',
          }),
        ])
      );
    });
  });

  describe('executionUuid', () => {
    function buildMockPipeline(): jest.Mocked<DispatcherPipelineContract> {
      return {
        execute: jest.fn().mockResolvedValue({
          completed: true,
          finalState: {
            input: {
              startedAt: new Date(),
              previousStartedAt: new Date(),
              executionUuid: 'unused-in-result',
            },
          },
        }),
      };
    }

    it('passes a UUID v4 to the pipeline on each run', async () => {
      const mockPipeline = buildMockPipeline();
      const service = new DispatcherService(mockPipeline);

      await service.run({ previousStartedAt: new Date() });

      expect(mockPipeline.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          executionUuid: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        })
      );
    });

    it('generates a fresh UUID on every run', async () => {
      const mockPipeline = buildMockPipeline();
      const service = new DispatcherService(mockPipeline);

      await service.run({ previousStartedAt: new Date() });
      await service.run({ previousStartedAt: new Date() });

      const [firstCall] = mockPipeline.execute.mock.calls[0];
      const [secondCall] = mockPipeline.execute.mock.calls[1];
      expect(firstCall.executionUuid).not.toBe(secondCall.executionUuid);
    });
  });
});
