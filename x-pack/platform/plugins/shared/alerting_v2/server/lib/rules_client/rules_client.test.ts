/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { ByteSizeValue } from '@kbn/config-schema';
import { BULK_FILTER_MAX_RESOURCES, BULK_QUERY_SAMPLE_SIZE } from '@kbn/alerting-v2-schemas';
import type { KibanaRequest } from '@kbn/core-http-server';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { coreMock } from '@kbn/core/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { TaskAlreadyRunningError } from '@kbn/task-manager-plugin/server/lib/errors';

import type { PluginConfig } from '../../config';
import type { RuleSavedObjectAttributes } from '../../saved_objects';
import { RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import { createRulesSavedObjectServiceMock } from '../services/rules_saved_object_service/rules_saved_object_service.mock';
import type { RulesSavedObjectServiceMock } from '../services/rules_saved_object_service/rules_saved_object_service.mock';
import type { UserService } from '../services/user_service/user_service';
import { createUserService } from '../services/user_service/user_service.mock';
import { createRuleSoAttributes } from '../test_utils';
import type {
  EventRule,
  RuleEventPublisher,
} from '../events/rule_event_publisher/rule_event_publisher';
import { createRuleEventPublisher } from '../events/rule_event_publisher/rule_event_publisher.mock';
import { createLoggerService } from '../services/logger_service/logger_service.mock';
import { ArtifactTypeRegistry, registerBuiltinArtifactTypes } from '../artifact_types';
import { BuilderTypeRegistry } from '../builder_types';
import { RulesClient } from './rules_client';
import type { CreateRuleParams } from './types';
import { ALERTING_LOG_CODES } from '../errors/error_codes';

jest.mock('../rule_executor/schedule', () => ({
  ensureRuleExecutorTaskScheduled: jest.fn(),
  getRuleExecutorTaskId: jest.fn(),
}));

import { ensureRuleExecutorTaskScheduled, getRuleExecutorTaskId } from '../rule_executor/schedule';

const ensureRuleExecutorTaskScheduledMock = ensureRuleExecutorTaskScheduled as jest.MockedFunction<
  typeof ensureRuleExecutorTaskScheduled
>;
const getRuleExecutorTaskIdMock = getRuleExecutorTaskId as jest.MockedFunction<
  typeof getRuleExecutorTaskId
>;

const baseCreateData: CreateRuleParams['data'] = {
  kind: 'alert',
  metadata: { name: 'rule-1' },
  time_field: '@timestamp',
  schedule: { every: '1m', lookback: '1m' },
  query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
};

const baseSoAttrs = createRuleSoAttributes({
  metadata: { name: 'rule-1' },
  time_field: '@timestamp',
  schedule: { every: '1m', lookback: '1m' },
  query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
});

/** Wraps attributes in the shape the SO client's `find` returns per hit. */
const soFindResult = (id: string, attributes: RuleSavedObjectAttributes) => ({
  id,
  type: RULE_SAVED_OBJECT_TYPE,
  attributes,
  references: [],
  score: 0,
});

describe('RulesClient', () => {
  const request: KibanaRequest = httpServerMock.createKibanaRequest();
  const taskManager = taskManagerMock.createStart();
  let userService: UserService;
  let loggerService: ReturnType<typeof createLoggerService>['loggerService'];
  let mockLogger: ReturnType<typeof createLoggerService>['mockLogger'];
  let rulesSavedObjectService: RulesSavedObjectServiceMock;
  let ruleEventPublisher: RuleEventPublisher;
  let artifactTypeRegistry: ArtifactTypeRegistry;
  let builderTypeRegistry: BuilderTypeRegistry;

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  beforeEach(() => {
    jest.clearAllMocks();

    rulesSavedObjectService = createRulesSavedObjectServiceMock();
    artifactTypeRegistry = new ArtifactTypeRegistry();
    registerBuiltinArtifactTypes(artifactTypeRegistry);
    builderTypeRegistry = new BuilderTypeRegistry();
    ({ publisher: ruleEventPublisher } = createRuleEventPublisher());
    jest.spyOn(ruleEventPublisher, 'emitRuleCreated');
    jest.spyOn(ruleEventPublisher, 'emitRuleUpdated');
    jest.spyOn(ruleEventPublisher, 'emitRuleDeleted');
    jest.spyOn(ruleEventPublisher, 'emitRuleEnabled');
    jest.spyOn(ruleEventPublisher, 'emitRuleDisabled');

    ({ userService } = createUserService());
    ({ loggerService, mockLogger } = createLoggerService());

    ensureRuleExecutorTaskScheduledMock.mockResolvedValue({ id: 'task-123' });
    getRuleExecutorTaskIdMock.mockReturnValue('task:fallback');

    taskManager.bulkRemove.mockResolvedValue({ statuses: [] });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function createClient(rulesConfigOverrides?: Partial<PluginConfig['rules']>) {
    const config: PluginConfig = {
      enabled: true,
      invalidateApiKeysTask: { interval: '5m', removalDelay: '1h' },
      rules: {
        minimumScheduleInterval: '1m',
        maxScheduledPerMinute: 400,
        run: {
          alerts: { max: 10000 },
          query: { maxResponseSize: ByteSizeValue.parse('50mb') },
          maxGroupsPerExecution: 10000,
        },
        ...rulesConfigOverrides,
      },
      esql: { responseFormat: 'json' },
    };

    const pluginConfigAccessor =
      coreMock.createPluginInitializerContext<PluginConfig>(config).config;

    return new RulesClient(
      request,
      rulesSavedObjectService,
      taskManager,
      userService,
      'space-1',
      pluginConfigAccessor,
      rulesSavedObjectService,
      ruleEventPublisher,
      loggerService,
      artifactTypeRegistry,
      builderTypeRegistry
    );
  }

  describe('createRule', () => {
    it('creates a rule SO and schedules a task', async () => {
      const client = createClient();
      rulesSavedObjectService.create.mockResolvedValueOnce({ id: 'rule-id-1' });

      const res = await client.createRule({
        data: baseCreateData,
        options: { id: 'rule-id-1' },
      });

      expect(rulesSavedObjectService.create).toHaveBeenCalledWith({
        attrs: expect.objectContaining({
          metadata: expect.objectContaining({ name: 'rule-1' }),
          enabled: true,
          createdBy: 'elastic_profile_uid',
        }),
        id: 'rule-id-1',
        references: [],
      });

      expect(ensureRuleExecutorTaskScheduledMock).toHaveBeenCalledWith({
        services: { taskManager },
        input: expect.objectContaining({
          ruleId: 'rule-id-1',
          schedule: { interval: '1m' },
          spaceId: 'space-1',
        }),
      });

      expect(res).toEqual(
        expect.objectContaining({
          id: 'rule-id-1',
          metadata: expect.objectContaining({ name: 'rule-1' }),
          enabled: true,
          created_by: 'elastic_profile_uid',
          updated_by: 'elastic_profile_uid',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        })
      );
    });

    it('writes dashboard artifact references and rejects invalid registered artifact data', async () => {
      const client = createClient();
      rulesSavedObjectService.create.mockResolvedValueOnce({ id: 'rule-id-dash' });

      await client.createRule({
        data: {
          ...baseCreateData,
          artifacts: [
            { id: 'dash-1', type: 'dashboard', data: { dashboard_id: 'so-dashboard-1' } },
          ],
        },
        options: { id: 'rule-id-dash' },
      });

      expect(rulesSavedObjectService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          references: [
            {
              name: 'artifact:dashboard_id:dash-1',
              type: 'dashboard',
              id: 'so-dashboard-1',
            },
          ],
        })
      );

      await expect(
        client.createRule({
          data: {
            ...baseCreateData,
            artifacts: [{ id: 'run-1', type: 'runbook', data: { content: '' } }],
          },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        data: { code: 'INVALID_ARTIFACT_DATA' },
      });
    });

    it('injects remapped dashboard reference ids on get', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-1',
        attributes: {
          ...baseSoAttrs,
          artifacts: [{ id: 'dash-1', type: 'dashboard', data: { dashboard_id: 'old-id' } }],
        },
        references: [
          {
            name: 'artifact:dashboard_id:dash-1',
            type: 'dashboard',
            id: 'remapped-id',
          },
        ],
      });

      const res = await client.getRule({ id: 'rule-id-1' });
      expect(res.artifacts).toEqual([
        { id: 'dash-1', type: 'dashboard', data: { dashboard_id: 'remapped-id' } },
      ]);
    });

    it('cleans up the saved object if scheduling fails', async () => {
      const client = createClient();
      rulesSavedObjectService.create.mockResolvedValueOnce({ id: 'rule-id-3' });
      ensureRuleExecutorTaskScheduledMock.mockRejectedValueOnce(new Error('schedule failed'));

      await expect(
        client.createRule({
          data: baseCreateData,
          options: { id: 'rule-id-3' },
        })
      ).rejects.toThrow('schedule failed');

      expect(rulesSavedObjectService.delete).toHaveBeenCalledWith({ id: 'rule-id-3' });
    });

    it('logs RULE_CREATE_ROLLBACK_FAILED when the compensating delete also fails', async () => {
      const client = createClient();
      rulesSavedObjectService.create.mockResolvedValueOnce({ id: 'rule-id-orphan' });
      ensureRuleExecutorTaskScheduledMock.mockRejectedValueOnce(new Error('schedule failed'));
      rulesSavedObjectService.delete.mockRejectedValueOnce(new Error('delete failed'));

      await expect(
        client.createRule({
          data: baseCreateData,
          options: { id: 'rule-id-orphan' },
        })
      ).rejects.toThrow('schedule failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to roll back rule creation after task scheduling failed',
        expect.objectContaining({
          labels: {
            code: ALERTING_LOG_CODES.RULE_CREATE_ROLLBACK_FAILED,
            rule_id: 'rule-id-orphan',
            space_id: 'space-1',
          },
          error: expect.objectContaining({
            message: 'Failed to roll back rule creation after task scheduling failed',
            stack_trace: expect.stringContaining('delete failed'),
          }),
        })
      );
    });

    it('throws 409 conflict when id already exists', async () => {
      const client = createClient();
      rulesSavedObjectService.create.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createConflictError(RULE_SAVED_OBJECT_TYPE, 'rule-id-4')
      );

      await expect(
        client.createRule({
          data: baseCreateData,
          options: { id: 'rule-id-4' },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 409 },
      });
    });

    it('creates a rule with description and includes it in the response', async () => {
      const client = createClient();
      rulesSavedObjectService.create.mockResolvedValueOnce({ id: 'rule-id-desc' });

      const res = await client.createRule({
        data: {
          ...baseCreateData,
          metadata: { name: 'rule-with-desc', description: 'My description' },
        },
        options: { id: 'rule-id-desc' },
      });

      expect(rulesSavedObjectService.create).toHaveBeenCalledWith({
        attrs: expect.objectContaining({
          metadata: expect.objectContaining({
            name: 'rule-with-desc',
            description: 'My description',
          }),
        }),
        id: 'rule-id-desc',
        references: [],
      });

      expect(res.metadata.description).toBe('My description');
    });

    it('throws 400 when ES|QL is invalid', async () => {
      const client = createClient();

      await expect(
        client.createRule({
          data: {
            ...baseCreateData,
            query: { format: 'standalone', breach: { query: 'FROM |' } },
          },
          options: { id: 'rule-id-5' },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
      });
    });
  });

  describe('updateRule', () => {
    it('throws 404 when rule is not found', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError(RULE_SAVED_OBJECT_TYPE, 'rule-id-1')
      );

      await expect(client.updateRule({ id: 'rule-id-1', data: {} })).rejects.toMatchObject({
        output: { statusCode: 404 },
      });
    });

    it('updates a rule and re-schedules the task', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: baseSoAttrs,
        version: 'WzEsMV0=',
        id: 'rule-id-1',
      });

      await client.updateRule({
        id: 'rule-id-1',
        data: { schedule: { every: '5m' } },
      });

      expect(ensureRuleExecutorTaskScheduledMock).toHaveBeenCalledWith({
        services: { taskManager },
        input: expect.objectContaining({
          ruleId: 'rule-id-1',
          schedule: { interval: '5m' },
          spaceId: 'space-1',
        }),
      });
      expect(rulesSavedObjectService.update).toHaveBeenCalledWith({
        id: 'rule-id-1',
        attrs: expect.objectContaining({
          schedule: expect.objectContaining({ every: '5m' }),
        }),
        version: 'WzEsMV0=',
        references: [],
      });
    });

    it('does not schedule the executor task when updating a disabled rule', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: { ...baseSoAttrs, enabled: false },
        version: 'WzEsMV0=',
        id: 'rule-id-disabled',
      });

      await client.updateRule({
        id: 'rule-id-disabled',
        data: { schedule: { every: '5m' } },
      });

      // A disabled rule must never be re-armed by an unrelated property edit —
      // lifecycle transitions are owned exclusively by enableRule/disableRule.
      expect(ensureRuleExecutorTaskScheduledMock).not.toHaveBeenCalled();
      // The stored (disabled) state is still persisted.
      expect(rulesSavedObjectService.update).toHaveBeenCalledWith({
        id: 'rule-id-disabled',
        attrs: expect.objectContaining({ enabled: false }),
        version: 'WzEsMV0=',
        references: [],
      });
    });

    it('updates the description of a rule', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: baseSoAttrs,
        version: 'WzEsMV0=',
        id: 'rule-id-desc-update',
      });
      rulesSavedObjectService.update.mockResolvedValueOnce({ id: 'rule-id-desc-update' });

      const res = await client.updateRule({
        id: 'rule-id-desc-update',
        data: { metadata: { description: 'New description' } },
      });

      expect(rulesSavedObjectService.update).toHaveBeenCalledWith({
        id: 'rule-id-desc-update',
        attrs: expect.objectContaining({
          metadata: expect.objectContaining({ description: 'New description' }),
        }),
        version: 'WzEsMV0=',
        references: [],
      });

      expect(res.metadata.description).toBe('New description');
    });

    it('keeps an imported artifact reference on an update that does not touch artifacts', async () => {
      const client = createClient();

      // Import rewrites references[].id but leaves the stored data on the old id.
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-imported',
        attributes: {
          ...baseSoAttrs,
          artifacts: [{ id: 'dash-1', type: 'dashboard', data: { dashboard_id: 'pre-import-id' } }],
        },
        version: 'WzEsMV0=',
        references: [
          { name: 'artifact:dashboard_id:dash-1', type: 'dashboard', id: 'remapped-id' },
        ],
      });
      rulesSavedObjectService.update.mockResolvedValueOnce({ id: 'rule-id-imported' });

      const res = await client.updateRule({
        id: 'rule-id-imported',
        data: { metadata: { description: 'Unrelated change' } },
      });

      expect(rulesSavedObjectService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          references: [
            { name: 'artifact:dashboard_id:dash-1', type: 'dashboard', id: 'remapped-id' },
          ],
        })
      );
      expect(res.artifacts).toEqual([
        { id: 'dash-1', type: 'dashboard', data: { dashboard_id: 'remapped-id' } },
      ]);
    });

    it('carries an unregistered artifact reference through an unrelated update', async () => {
      const client = createClient();

      // The type was registered when the reference was written (e.g. before a
      // plugin rollback); the framework can no longer regenerate it, so it must
      // survive by carry-over instead of being dropped.
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-unregistered',
        attributes: {
          ...baseSoAttrs,
          artifacts: [{ id: 'slo-1', type: 'obs.slo', data: { sloId: 'so-slo-1' } }],
        },
        version: 'WzEsMV0=',
        references: [{ name: 'artifact:sloId:slo-1', type: 'slo', id: 'so-slo-1' }],
      });
      rulesSavedObjectService.update.mockResolvedValueOnce({ id: 'rule-id-unregistered' });

      await client.updateRule({
        id: 'rule-id-unregistered',
        data: { metadata: { description: 'Unrelated change' } },
      });

      expect(rulesSavedObjectService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          references: [{ name: 'artifact:sloId:slo-1', type: 'slo', id: 'so-slo-1' }],
        })
      );
    });

    it('throws 409 conflict when version is stale', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-4',
        attributes: baseSoAttrs,
        version: 'WzEsMV0=',
      });

      rulesSavedObjectService.update.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createConflictError(RULE_SAVED_OBJECT_TYPE, 'rule-id-4')
      );

      await expect(client.updateRule({ id: 'rule-id-4', data: {} })).rejects.toMatchObject({
        output: { statusCode: 409 },
      });
    });

    it('throws 400 when setting stateTransition on a signal rule', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'signal',
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-signal',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-signal',
          data: { state_transition: { pending_count: 3 } },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        message: 'stateTransition is only allowed for rules of kind "alert".',
      });

      expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
    });

    it('allows setting stateTransition on an alert rule', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'alert',
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-alert',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-alert',
          data: {
            state_transition: { pending_count: 3, recovering_count: 5 },
          },
        })
      ).resolves.not.toThrow();
    });

    it('throws 400 when updating a signal rule query to composed format', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'signal',
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-signal-composed',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-signal-composed',
          data: {
            query: {
              format: 'composed',
              base: 'FROM logs-*',
              breach: { segment: 'WHERE error' },
            },
          },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        message: 'kind "signal" requires query.format "standalone".',
      });

      expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
    });

    it('throws 400 when setting recovery_strategy or no_data_strategy on a signal rule', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'signal',
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-signal-recovery',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-signal-recovery',
          data: { recovery_strategy: 'no_breach' },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        message: 'Signal rules cannot set recovery_strategy or no_data_strategy.',
      });

      expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
    });

    it('allows updating an alert rule query to composed format', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'alert',
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-alert-composed',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-alert-composed',
          data: {
            query: {
              format: 'composed',
              base: 'FROM logs-*',
              breach: { segment: 'WHERE error' },
            },
          },
        })
      ).resolves.not.toThrow();
    });

    it('allows a metadata-only update on a signal rule (query omitted stays standalone)', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'signal',
        recovery_strategy: undefined,
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-signal-metadata',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-signal-metadata',
          data: { metadata: { name: 'renamed signal' } },
        })
      ).resolves.not.toThrow();

      expect(rulesSavedObjectService.update).toHaveBeenCalled();
    });

    it('throws 400 when clearing recovery_strategy leaves a stale query.recovery block', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'alert',
        recovery_strategy: 'query',
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-* | LIMIT 1' },
          recovery: { query: 'FROM logs-* | LIMIT 2' },
        },
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-stale-recovery',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-stale-recovery',
          data: { recovery_strategy: null },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        message: 'query.recovery is only allowed when recovery_strategy is "query".',
      });

      expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
    });

    it('throws 400 when setting recovery_strategy "query" without a query.recovery block', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'alert',
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-missing-recovery',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-missing-recovery',
          data: { recovery_strategy: 'query' },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        message: 'query.recovery is required when recovery_strategy is "query".',
      });

      expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
    });

    it('throws 400 when clearing no_data_strategy leaves a stale query.no_data block', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'alert',
        no_data_strategy: 'last_known_status',
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-* | LIMIT 1' },
          no_data: { query: 'FROM logs-* | STATS c = COUNT(*) | WHERE c == 0' },
        },
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-stale-no-data',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-stale-no-data',
          data: { no_data_strategy: null },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        message:
          'query.no_data is only allowed when no_data_strategy is set to a non-"none" value.',
      });

      expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
    });

    it('throws 400 when setting a no_data_strategy without a query.no_data block (standalone)', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'alert',
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-missing-no-data',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-missing-no-data',
          data: { no_data_strategy: 'last_known_status' },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        message:
          'query.no_data is required when no_data_strategy is not "none" for standalone-format rules.',
      });

      expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
    });

    it('allows setting state_transition to null on a signal rule (removing it)', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'signal',
        recovery_strategy: undefined,
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-signal-null',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await client.updateRule({
        id: 'rule-id-signal-null',
        data: { state_transition: null },
      });
    });

    it('replaces state_transition entirely without preserving stale sub-fields', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        kind: 'alert',
        state_transition: { pending_count: 2, recovering_count: 3 },
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-partial-st',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await client.updateRule({
        id: 'rule-partial-st',
        data: { state_transition: { recovering_count: 3 } },
      });

      expect(rulesSavedObjectService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'rule-partial-st',
          attrs: expect.objectContaining({
            state_transition: { recovering_count: 3 },
          }),
        })
      );
      const { attrs } = rulesSavedObjectService.update.mock.calls[0][0];
      expect(attrs.state_transition).toEqual({ recovering_count: 3 });
      expect(attrs.state_transition?.pending_count).toBeUndefined();
    });

    it('clears artifacts when update payload sets artifacts to null', async () => {
      const client = createClient();

      const existingAttributes: RuleSavedObjectAttributes = {
        ...baseSoAttrs,
        artifacts: [{ id: 'runbook-id', type: 'runbook', data: { content: 'Persisted runbook' } }],
      };

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-clear-artifacts',
        attributes: existingAttributes,
        version: 'WzEsMV0=',
      });

      await client.updateRule({
        id: 'rule-id-clear-artifacts',
        data: { artifacts: null },
      });

      expect(rulesSavedObjectService.update).toHaveBeenCalledWith({
        id: 'rule-id-clear-artifacts',
        attrs: expect.objectContaining({ artifacts: [] }),
        version: 'WzEsMV0=',
        references: [],
      });
    });

    it('uses the client-provided version when supplied', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-occ',
        attributes: baseSoAttrs,
        version: 'WzSERVER=',
      });

      await client.updateRule({
        id: 'rule-id-occ',
        data: { metadata: { name: 'occ name' } },
        options: { version: 'WzCLIENT=' },
      });

      expect(rulesSavedObjectService.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rule-id-occ', version: 'WzCLIENT=' })
      );
    });

    it('falls back to the server-read version when client omits version', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-fallback',
        attributes: baseSoAttrs,
        version: 'WzSERVER=',
      });

      await client.updateRule({
        id: 'rule-id-fallback',
        data: { metadata: { name: 'fallback name' } },
      });

      expect(rulesSavedObjectService.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rule-id-fallback', version: 'WzSERVER=' })
      );
    });

    it('returns the new version from the SO update in the response', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-new-ver',
        attributes: baseSoAttrs,
        version: 'WzOLD=',
      });
      rulesSavedObjectService.update.mockResolvedValueOnce({
        id: 'rule-id-new-ver',
        version: 'WzNEW=',
      });

      const res = await client.updateRule({
        id: 'rule-id-new-ver',
        data: { metadata: { name: 'whatever' } },
      });

      expect(res.version).toBe('WzNEW=');
    });
  });

  describe('upsertRule', () => {
    describe('create rule (id does not exist)', () => {
      beforeEach(() => {
        rulesSavedObjectService.get.mockRejectedValueOnce(
          SavedObjectsErrorHelpers.createGenericNotFoundError(RULE_SAVED_OBJECT_TYPE, 'rule-id-1')
        );
      });

      it('creates the rule SO with enabled=true and schedules the task', async () => {
        const client = createClient();
        rulesSavedObjectService.create.mockResolvedValueOnce({ id: 'rule-id-1' });

        const res = await client.upsertRule({ id: 'rule-id-1', data: baseCreateData });

        expect(rulesSavedObjectService.create).toHaveBeenCalledWith({
          attrs: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'rule-1' }),
            enabled: true,
            createdBy: 'elastic_profile_uid',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedBy: 'elastic_profile_uid',
            updatedAt: '2025-01-01T00:00:00.000Z',
          }),
          id: 'rule-id-1',
          references: [],
        });
        expect(ensureRuleExecutorTaskScheduledMock).toHaveBeenCalledWith({
          services: { taskManager },
          input: expect.objectContaining({
            ruleId: 'rule-id-1',
            schedule: { interval: '1m' },
            spaceId: 'space-1',
          }),
        });
        expect(res).toEqual({
          created: true,
          rule: expect.objectContaining({ id: 'rule-id-1', enabled: true }),
        });
      });

      it('cleans up the saved object if scheduling fails', async () => {
        const client = createClient();
        rulesSavedObjectService.create.mockResolvedValueOnce({ id: 'rule-id-1' });
        ensureRuleExecutorTaskScheduledMock.mockRejectedValueOnce(new Error('schedule failed'));

        await expect(client.upsertRule({ id: 'rule-id-1', data: baseCreateData })).rejects.toThrow(
          'schedule failed'
        );

        expect(rulesSavedObjectService.delete).toHaveBeenCalledWith({ id: 'rule-id-1' });
      });

      it('throws 409 when another caller created the rule between get and create', async () => {
        const client = createClient();
        rulesSavedObjectService.create.mockRejectedValueOnce(
          SavedObjectsErrorHelpers.createConflictError(RULE_SAVED_OBJECT_TYPE, 'rule-id-1')
        );

        await expect(
          client.upsertRule({ id: 'rule-id-1', data: baseCreateData })
        ).rejects.toMatchObject({
          output: { statusCode: 409 },
        });

        expect(ensureRuleExecutorTaskScheduledMock).not.toHaveBeenCalled();
      });
    });

    describe('replace rule (id exists)', () => {
      it('replaces fields from the body and preserves audit + enabled', async () => {
        const client = createClient();
        const existing: RuleSavedObjectAttributes = {
          ...baseSoAttrs,
          enabled: false,
          createdBy: 'previous-creator',
          createdAt: '2024-06-01T00:00:00.000Z',
          metadata: { name: 'before' },
        };
        const existingDoc = {
          id: 'rule-id-1',
          attributes: existing,
          version: 'WzEsMV0=',
        };
        rulesSavedObjectService.get
          .mockResolvedValueOnce(existingDoc)
          .mockResolvedValueOnce(existingDoc);
        rulesSavedObjectService.update.mockResolvedValueOnce({ id: 'rule-id-1' });

        const res = await client.upsertRule({
          id: 'rule-id-1',
          data: { ...baseCreateData, metadata: { name: 'after' } },
        });

        expect(rulesSavedObjectService.update).toHaveBeenCalledWith({
          id: 'rule-id-1',
          attrs: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'after' }),
            enabled: false,
            createdBy: 'previous-creator',
            createdAt: '2024-06-01T00:00:00.000Z',
            updatedBy: 'elastic_profile_uid',
            updatedAt: '2025-01-01T00:00:00.000Z',
          }),
          version: 'WzEsMV0=',
          references: [],
        });
        expect(res.created).toBe(false);
      });

      it('reschedules the task with the new interval', async () => {
        const client = createClient();
        const existingDoc = {
          id: 'rule-id-1',
          attributes: baseSoAttrs,
          version: 'WzEsMV0=',
        };
        rulesSavedObjectService.get
          .mockResolvedValueOnce(existingDoc)
          .mockResolvedValueOnce(existingDoc);

        await client.upsertRule({
          id: 'rule-id-1',
          data: { ...baseCreateData, schedule: { every: '15m' } },
        });

        expect(ensureRuleExecutorTaskScheduledMock).toHaveBeenCalledWith({
          services: { taskManager },
          input: expect.objectContaining({
            ruleId: 'rule-id-1',
            schedule: { interval: '15m' },
            spaceId: 'space-1',
          }),
        });
      });

      it('throws 409 when the version is stale', async () => {
        const client = createClient();
        const existingDoc = {
          id: 'rule-id-1',
          attributes: baseSoAttrs,
          version: 'WzEsMV0=',
        };
        rulesSavedObjectService.get
          .mockResolvedValueOnce(existingDoc)
          .mockResolvedValueOnce(existingDoc);
        rulesSavedObjectService.update.mockRejectedValueOnce(
          SavedObjectsErrorHelpers.createConflictError(RULE_SAVED_OBJECT_TYPE, 'rule-id-1')
        );

        await expect(
          client.upsertRule({ id: 'rule-id-1', data: baseCreateData })
        ).rejects.toMatchObject({
          output: { statusCode: 409 },
        });
      });

      it('throws 409 when the request body changes the rule kind', async () => {
        const client = createClient();
        const existingDoc = {
          id: 'rule-id-1',
          attributes: baseSoAttrs,
          version: 'WzEsMV0=',
        };
        rulesSavedObjectService.get
          .mockResolvedValueOnce(existingDoc)
          .mockResolvedValueOnce(existingDoc);

        await expect(
          client.upsertRule({
            id: 'rule-id-1',
            data: { ...baseCreateData, kind: 'signal' },
          })
        ).rejects.toMatchObject({
          output: { statusCode: 409 },
          message: 'Some fields cannot be changed after creation: kind.',
        });

        expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
      });

      it('clears optional fields that are omitted from the request body', async () => {
        const client = createClient();
        const existing: RuleSavedObjectAttributes = {
          ...baseSoAttrs,
          metadata: { name: 'rule-1', tags: ['tag-a', 'tag-b'] },
          grouping: { fields: ['host.name'] },
        };
        const existingDoc = {
          id: 'rule-id-1',
          attributes: existing,
          version: 'WzEsMV0=',
        };
        rulesSavedObjectService.get
          .mockResolvedValueOnce(existingDoc)
          .mockResolvedValueOnce(existingDoc);
        rulesSavedObjectService.update.mockResolvedValueOnce({ id: 'rule-id-1' });

        await client.upsertRule({ id: 'rule-id-1', data: baseCreateData });

        expect(rulesSavedObjectService.update).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'rule-id-1',
            attrs: expect.objectContaining({
              metadata: { name: 'rule-1', version: 1 },
              grouping: undefined,
            }),
          })
        );
      });
    });

    it('rethrows non-not-found errors from the existing-rule lookup', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockRejectedValueOnce(new Error('elasticsearch unavailable'));

      await expect(client.upsertRule({ id: 'rule-id-1', data: baseCreateData })).rejects.toThrow(
        'elasticsearch unavailable'
      );

      expect(rulesSavedObjectService.create).not.toHaveBeenCalled();
      expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
    });

    it('throws 400 when the body is invalid', async () => {
      const client = createClient();

      await expect(
        client.upsertRule({
          id: 'rule-id-1',
          data: { ...baseCreateData, schedule: { every: 'not-a-duration' } },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
      });

      expect(rulesSavedObjectService.get).not.toHaveBeenCalled();
    });
  });

  describe('getRule', () => {
    it('returns a rule by id', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: baseSoAttrs,
        version: 'WzEsMV0=',
        id: 'rule-id-get-1',
      });

      const res = await client.getRule({ id: 'rule-id-get-1' });

      expect(rulesSavedObjectService.get).toHaveBeenCalledWith('rule-id-get-1');
      expect(res).toEqual(
        expect.objectContaining({
          id: 'rule-id-get-1',
          kind: 'alert',
          metadata: expect.objectContaining({ name: 'rule-1' }),
          schedule: expect.objectContaining({ every: '1m' }),
        })
      );
    });

    it('returns description in the rule response when present', async () => {
      const client = createClient();
      const soAttrsWithDesc = createRuleSoAttributes({
        metadata: { name: 'rule-with-desc', description: 'Fetched description' },
      });

      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: soAttrsWithDesc,
        version: 'WzEsMV0=',
        id: 'rule-id-get-desc',
      });

      const res = await client.getRule({ id: 'rule-id-get-desc' });

      expect(res.metadata.description).toBe('Fetched description');
    });

    it('throws 404 when rule is not found', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError(
          RULE_SAVED_OBJECT_TYPE,
          'rule-id-get-404'
        )
      );

      await expect(client.getRule({ id: 'rule-id-get-404' })).rejects.toMatchObject({
        output: { statusCode: 404 },
      });
    });
  });

  describe('getRules', () => {
    it('returns rules for the provided ids', async () => {
      const client = createClient();
      const so1Attrs = createRuleSoAttributes({ metadata: { name: 'rule-get-many-1' } });
      const so2Attrs = createRuleSoAttributes({ metadata: { name: 'rule-get-many-2' } });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-id-get-many-1', attributes: so1Attrs },
        { id: 'rule-id-get-many-2', attributes: so2Attrs },
      ]);

      const res = await client.getRules(['rule-id-get-many-1', 'rule-id-get-many-2']);

      expect(rulesSavedObjectService.bulkGetByIds).toHaveBeenCalledWith([
        'rule-id-get-many-1',
        'rule-id-get-many-2',
      ]);
      expect(res).toHaveLength(2);
      expect(res[0]).toEqual(
        expect.objectContaining({
          id: 'rule-id-get-many-1',
          metadata: expect.objectContaining({ name: 'rule-get-many-1' }),
        })
      );
      expect(res[1]).toEqual(
        expect.objectContaining({
          id: 'rule-id-get-many-2',
          metadata: expect.objectContaining({ name: 'rule-get-many-2' }),
        })
      );
    });

    it('returns rules in the same order as the requested ids, regardless of bulkGet response order', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-a', attributes: createRuleSoAttributes({ metadata: { name: 'A' } }) },
        { id: 'rule-m', attributes: createRuleSoAttributes({ metadata: { name: 'M' } }) },
        { id: 'rule-z', attributes: createRuleSoAttributes({ metadata: { name: 'Z' } }) },
      ]);

      const res = await client.getRules(['rule-z', 'rule-a', 'rule-m']);

      expect(res.map((r) => r.id)).toEqual(['rule-z', 'rule-a', 'rule-m']);
    });

    it('skips missing rules when their ids are omitted from the request', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        {
          id: 'rule-id-present',
          attributes: createRuleSoAttributes({ metadata: { name: 'present' } }),
        },
      ]);

      const res = await client.getRules(['rule-id-present', 'rule-id-absent']);

      expect(res).toHaveLength(1);
      expect(res[0]).toEqual(
        expect.objectContaining({
          id: 'rule-id-present',
          metadata: expect.objectContaining({ name: 'present' }),
        })
      );
    });

    it('throws with the SO error status when a requested id is missing', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        {
          id: 'rule-id-present',
          attributes: createRuleSoAttributes({ metadata: { name: 'present' } }),
        },
        {
          id: 'rule-id-missing',
          error: {
            statusCode: 404,
            error: 'Not Found',
            message: 'Saved object [alerting-rule/rule-id-missing] not found',
          },
        },
      ]);

      await expect(client.getRules(['rule-id-present', 'rule-id-missing'])).rejects.toMatchObject({
        output: { statusCode: 404 },
      });
    });

    it('throws with the SO error status when bulkGet reports a non-404 error', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        {
          id: 'rule-id-valid',
          attributes: createRuleSoAttributes({ metadata: { name: 'valid' } }),
        },
        {
          id: 'rule-id-failure',
          error: {
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'bulk get failed',
          },
        },
      ]);

      await expect(client.getRules(['rule-id-valid', 'rule-id-failure'])).rejects.toMatchObject({
        output: { statusCode: 500 },
      });
    });

    it('throws on the first encountered error', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        {
          id: 'rule-id-first-missing',
          error: {
            statusCode: 404,
            error: 'Not Found',
            message: 'Saved object [alerting-rule/rule-id-first-missing] not found',
          },
        },
        {
          id: 'rule-id-second-failure',
          error: {
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'bulk get failed',
          },
        },
      ]);

      // 'first error wins': the 404 surfaces, not the later 500.
      await expect(
        client.getRules(['rule-id-first-missing', 'rule-id-second-failure'])
      ).rejects.toMatchObject({
        output: { statusCode: 404 },
      });
    });
  });

  describe('deleteRule', () => {
    it('removes the scheduled task and deletes the rule', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: baseSoAttrs,
        version: 'WzEsMV0=',
        id: 'rule-id-del-1',
      });
      getRuleExecutorTaskIdMock.mockReturnValueOnce('task:delete');

      await client.deleteRule({ id: 'rule-id-del-1' });

      expect(getRuleExecutorTaskIdMock).toHaveBeenCalledWith({
        ruleId: 'rule-id-del-1',
        spaceId: 'space-1',
      });
      expect(taskManager.removeIfExists).toHaveBeenCalledWith('task:delete');
      expect(rulesSavedObjectService.delete).toHaveBeenCalledWith({ id: 'rule-id-del-1' });
    });

    it('throws 404 when rule is not found', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError(
          RULE_SAVED_OBJECT_TYPE,
          'rule-id-del-404'
        )
      );

      await expect(client.deleteRule({ id: 'rule-id-del-404' })).rejects.toMatchObject({
        output: { statusCode: 404 },
      });
    });
  });

  describe('runRuleNow', () => {
    it('runs the executor task for an enabled rule', async () => {
      const client = createClient();

      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: { ...baseSoAttrs, enabled: true },
        version: 'WzEsMV0=',
        id: 'rule-id-run-1',
      });
      getRuleExecutorTaskIdMock.mockReturnValueOnce('task:run');
      taskManager.runSoon.mockResolvedValueOnce({ id: 'task:run', forced: false });

      await client.runRuleNow({ id: 'rule-id-run-1' });

      expect(getRuleExecutorTaskIdMock).toHaveBeenCalledWith({
        ruleId: 'rule-id-run-1',
        spaceId: 'space-1',
      });
      expect(taskManager.runSoon).toHaveBeenCalledWith('task:run');
    });

    it('throws 404 when rule is not found', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError(
          RULE_SAVED_OBJECT_TYPE,
          'rule-id-run-404'
        )
      );

      await expect(client.runRuleNow({ id: 'rule-id-run-404' })).rejects.toMatchObject({
        output: { statusCode: 404 },
      });
    });

    it('throws 400 RULE_DISABLED when the rule is disabled', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: { ...baseSoAttrs, enabled: false },
        version: 'WzEsMV0=',
        id: 'rule-id-run-disabled',
      });

      await expect(client.runRuleNow({ id: 'rule-id-run-disabled' })).rejects.toMatchObject({
        output: { statusCode: 400 },
        data: { code: 'RULE_DISABLED', details: { rule_id: 'rule-id-run-disabled' } },
      });

      expect(taskManager.runSoon).not.toHaveBeenCalled();
    });

    it('throws 409 RULE_ALREADY_RUNNING when the task is already running', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: { ...baseSoAttrs, enabled: true },
        version: 'WzEsMV0=',
        id: 'rule-id-run-active',
      });
      taskManager.runSoon.mockRejectedValueOnce(new TaskAlreadyRunningError('task:run'));

      await expect(client.runRuleNow({ id: 'rule-id-run-active' })).rejects.toMatchObject({
        output: { statusCode: 409 },
        data: { code: 'RULE_ALREADY_RUNNING', details: { rule_id: 'rule-id-run-active' } },
      });
    });

    it('throws 409 RULE_RUN_CONFLICT when runSoon reports a task-store conflict', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: { ...baseSoAttrs, enabled: true },
        version: 'WzEsMV0=',
        id: 'rule-id-run-conflict',
      });
      taskManager.runSoon.mockResolvedValueOnce({
        id: 'task:run',
        forced: false,
        conflict: true,
      });

      await expect(client.runRuleNow({ id: 'rule-id-run-conflict' })).rejects.toMatchObject({
        output: { statusCode: 409 },
        data: { code: 'RULE_RUN_CONFLICT', details: { rule_id: 'rule-id-run-conflict' } },
      });
    });

    it('throws 500 RULE_RUN_ERROR when runSoon fails with a saved-object not-found', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: { ...baseSoAttrs, enabled: true },
        version: 'WzEsMV0=',
        id: 'rule-id-run-missing-task',
      });
      taskManager.runSoon.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError('task', 'task:run')
      );

      await expect(client.runRuleNow({ id: 'rule-id-run-missing-task' })).rejects.toMatchObject({
        output: { statusCode: 500 },
        data: { code: 'RULE_RUN_ERROR', details: { rule_id: 'rule-id-run-missing-task' } },
      });
    });

    it('throws 500 RULE_RUN_ERROR when runSoon fails with a non-Boom error', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: { ...baseSoAttrs, enabled: true },
        version: 'WzEsMV0=',
        id: 'rule-id-run-generic',
      });
      taskManager.runSoon.mockRejectedValueOnce(new Error('task store unavailable'));

      await expect(client.runRuleNow({ id: 'rule-id-run-generic' })).rejects.toMatchObject({
        output: { statusCode: 500 },
        data: { code: 'RULE_RUN_ERROR', details: { rule_id: 'rule-id-run-generic' } },
      });
    });

    it('preserves an existing Boom error code when wrapping runSoon failures', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        attributes: { ...baseSoAttrs, enabled: true },
        version: 'WzEsMV0=',
        id: 'rule-id-run-coded',
      });
      taskManager.runSoon.mockRejectedValueOnce(
        Boom.badGateway('downstream offline', { code: 'DOWNSTREAM_UNAVAILABLE' })
      );

      await expect(client.runRuleNow({ id: 'rule-id-run-coded' })).rejects.toMatchObject({
        output: { statusCode: 500 },
        data: { code: 'DOWNSTREAM_UNAVAILABLE', details: { rule_id: 'rule-id-run-coded' } },
      });
    });
  });

  describe('findRules', () => {
    it('returns a paginated list of rules', async () => {
      const client = createClient();

      rulesSavedObjectService.find.mockResolvedValueOnce({
        saved_objects: [
          soFindResult('rule-1', createRuleSoAttributes({ metadata: { name: 'rule-1' } })),
          soFindResult('rule-2', createRuleSoAttributes({ metadata: { name: 'rule-2' } })),
        ],
        total: 2,
        page: 2,
        per_page: 50,
      });

      const res = await client.findRules({ page: 2, perPage: 50 });

      expect(rulesSavedObjectService.find).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, perPage: 50 })
      );

      expect(res.items).toHaveLength(2);
      expect(res.items[0]).toEqual(
        expect.objectContaining({
          id: 'rule-1',
          metadata: expect.objectContaining({ name: 'rule-1' }),
        })
      );
      expect(res.items[1]).toEqual(
        expect.objectContaining({
          id: 'rule-2',
          metadata: expect.objectContaining({ name: 'rule-2' }),
        })
      );
      expect(res.total).toBe(2);
      expect(res.page).toBe(2);
      expect(res.per_page).toBe(50);
    });

    it('uses default pagination when no page params are provided', async () => {
      const client = createClient();

      rulesSavedObjectService.find.mockResolvedValueOnce({
        saved_objects: [
          soFindResult(
            'rule-pagination-1',
            createRuleSoAttributes({ metadata: { name: 'rule-pagination-1' } })
          ),
        ],
        total: 100,
        page: 1,
        per_page: 20,
      });

      const res = await client.findRules();

      expect(rulesSavedObjectService.find).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, perPage: 20 })
      );
      expect(rulesSavedObjectService.bulkGetByIds).not.toHaveBeenCalled();

      expect(res.total).toBe(100);
      expect(res.page).toBe(1);
      expect(res.per_page).toBe(20);
    });

    it('translates clean API filter to SO filter before passing to saved objects client', async () => {
      const client = createClient();

      await client.findRules({ filter: 'enabled: true' });

      expect(rulesSavedObjectService.find).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          perPage: 20,
          filter: `${RULE_SAVED_OBJECT_TYPE}.attributes.enabled: true`,
        })
      );
    });

    it('passes search and searchFields to the saved objects client', async () => {
      const client = createClient();

      await client.findRules({ page: 2, perPage: 10, search: 'prod alerts' });

      expect(rulesSavedObjectService.find).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          perPage: 10,
          search: 'prod* alerts*',
          searchFields: ['metadata.name', 'metadata.description'],
        })
      );
    });

    it('trims search before passing it to the saved objects client', async () => {
      const client = createClient();

      await client.findRules({ search: '  prod alerts  ' });

      expect(rulesSavedObjectService.find).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'prod* alerts*' })
      );
    });

    it('passes filter and search as separate params', async () => {
      const client = createClient();

      await client.findRules({ filter: 'enabled: true', search: 'prod' });

      expect(rulesSavedObjectService.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: `${RULE_SAVED_OBJECT_TYPE}.attributes.enabled: true`,
          search: 'prod*',
          searchFields: ['metadata.name', 'metadata.description'],
        })
      );
    });

    it('does not pass filter when it is undefined', async () => {
      const client = createClient();

      await client.findRules({});

      expect(rulesSavedObjectService.find).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, perPage: 20 })
      );
      const [args] = rulesSavedObjectService.find.mock.calls[0];
      expect(args.filter).toBeUndefined();
    });

    it('maps kind sorting without transformation', async () => {
      const client = createClient();

      await client.findRules({ sortField: 'kind', sortOrder: 'desc' });

      expect(rulesSavedObjectService.find).toHaveBeenCalledWith(
        expect.objectContaining({ sortField: 'kind', sortOrder: 'desc' })
      );
    });

    it('maps enabled sorting without transformation', async () => {
      const client = createClient();

      await client.findRules({ sortField: 'enabled', sortOrder: 'desc' });

      expect(rulesSavedObjectService.find).toHaveBeenCalledWith(
        expect.objectContaining({ sortField: 'enabled', sortOrder: 'desc' })
      );
    });
  });

  describe('getTags', () => {
    it('returns the aggregated tags without a filter or search', async () => {
      const client = createClient();

      rulesSavedObjectService.findTags.mockResolvedValueOnce(['cpu', 'memory']);

      const tags = await client.getTags();

      expect(tags).toEqual(['cpu', 'memory']);
      expect(rulesSavedObjectService.findTags).toHaveBeenCalledWith({
        search: undefined,
        filter: undefined,
        size: undefined,
      });
    });

    it('translates kind: alert to an SO filter', async () => {
      const client = createClient();

      rulesSavedObjectService.findTags.mockResolvedValueOnce(['cpu']);

      await client.getTags({ kind: 'alert' });

      expect(rulesSavedObjectService.findTags).toHaveBeenCalledWith({
        search: undefined,
        filter: `${RULE_SAVED_OBJECT_TYPE}.attributes.kind: alert`,
        size: undefined,
      });
    });

    it('translates kind: signal to an SO filter', async () => {
      const client = createClient();

      rulesSavedObjectService.findTags.mockResolvedValueOnce(['sig']);

      await client.getTags({ kind: 'signal' });

      expect(rulesSavedObjectService.findTags).toHaveBeenCalledWith({
        search: undefined,
        filter: `${RULE_SAVED_OBJECT_TYPE}.attributes.kind: signal`,
        size: undefined,
      });
    });

    it('forwards search to the saved-object service', async () => {
      const client = createClient();

      rulesSavedObjectService.findTags.mockResolvedValueOnce(['production']);

      await client.getTags({ search: 'pro' });

      expect(rulesSavedObjectService.findTags).toHaveBeenCalledWith({
        search: 'pro',
        filter: undefined,
        size: undefined,
      });
    });

    it('forwards size to the saved-object service', async () => {
      const client = createClient();

      rulesSavedObjectService.findTags.mockResolvedValueOnce(['a']);

      await client.getTags({ search: 'sigevents:stream:', size: 10000 });

      expect(rulesSavedObjectService.findTags).toHaveBeenCalledWith({
        search: 'sigevents:stream:',
        filter: undefined,
        size: 10000,
      });
    });
  });

  describe('bulkDeleteRules', () => {
    it('removes tasks and deletes saved objects for all ids', async () => {
      const client = createClient();

      getRuleExecutorTaskIdMock
        .mockReturnValueOnce('task:rule-1')
        .mockReturnValueOnce('task:rule-2');

      rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([
        { id: 'rule-1', success: true },
        { id: 'rule-2', success: true },
      ]);

      const res = await client.bulkDeleteRules({ ids: ['rule-1', 'rule-2'] });

      expect(taskManager.bulkRemove).toHaveBeenCalledWith(['task:rule-1', 'task:rule-2']);
      expect(rulesSavedObjectService.bulkDelete).toHaveBeenCalledWith(['rule-1', 'rule-2']);
      expect(res).toEqual({ affected_count: 2, errors: [] });
    });

    it('returns errors with RULE_NOT_FOUND code for rules that failed to delete', async () => {
      const client = createClient();

      getRuleExecutorTaskIdMock
        .mockReturnValueOnce('task:rule-1')
        .mockReturnValueOnce('task:rule-2');

      rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([
        { id: 'rule-1', success: true },
        {
          id: 'rule-2',
          success: false,
          error: { error: 'Not Found', message: 'Rule not found', statusCode: 404 },
        },
      ]);

      const res = await client.bulkDeleteRules({ ids: ['rule-1', 'rule-2'] });

      expect(res.affected_count).toBe(1);
      expect(res.errors).toEqual([
        { id: 'rule-2', error: { code: 'RULE_NOT_FOUND', message: 'Rule not found' } },
      ]);
    });

    it('deletes the saved objects before removing the tasks', async () => {
      const client = createClient();

      const callOrder: string[] = [];
      rulesSavedObjectService.bulkDelete.mockImplementationOnce(async () => {
        callOrder.push('bulkDelete');
        return [{ id: 'rule-1', success: true }];
      });
      taskManager.bulkRemove.mockImplementationOnce(async () => {
        callOrder.push('bulkRemove');
        return { statuses: [] };
      });

      await client.bulkDeleteRules({ ids: ['rule-1'] });

      expect(callOrder).toEqual(['bulkDelete', 'bulkRemove']);
    });

    it('only removes tasks for rules whose saved object was deleted', async () => {
      const client = createClient();

      getRuleExecutorTaskIdMock.mockReturnValueOnce('task:rule-1');

      rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([
        { id: 'rule-1', success: true },
        {
          id: 'rule-2',
          success: false,
          error: { error: 'Not Found', message: 'Rule not found', statusCode: 404 },
        },
      ]);

      await client.bulkDeleteRules({ ids: ['rule-1', 'rule-2'] });

      expect(taskManager.bulkRemove).toHaveBeenCalledWith(['task:rule-1']);
    });

    it('surfaces TASK_MANAGER_DRIFT errors when task removal fails', async () => {
      const client = createClient();

      getRuleExecutorTaskIdMock
        .mockReturnValueOnce('task:rule-1')
        .mockReturnValueOnce('task:rule-2');

      taskManager.bulkRemove.mockRejectedValueOnce(new Error('task removal failed'));

      rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([
        { id: 'rule-1', success: true },
        { id: 'rule-2', success: true },
      ]);

      const res = await client.bulkDeleteRules({ ids: ['rule-1', 'rule-2'] });

      // The saved objects are gone (affected), but the orphan tasks are flagged.
      expect(res.affected_count).toBe(2);
      expect(res.errors).toEqual([
        { id: 'rule-1', error: expect.objectContaining({ code: 'TASK_MANAGER_DRIFT' }) },
        { id: 'rule-2', error: expect.objectContaining({ code: 'TASK_MANAGER_DRIFT' }) },
      ]);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('surfaces TASK_MANAGER_DRIFT for per-task failures in the bulkRemove statuses (no throw)', async () => {
      const client = createClient();

      getRuleExecutorTaskIdMock
        .mockReturnValueOnce('task:rule-1')
        .mockReturnValueOnce('task:rule-2');

      rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([
        { id: 'rule-1', success: true },
        { id: 'rule-2', success: true },
      ]);

      taskManager.bulkRemove.mockResolvedValueOnce({
        statuses: [
          {
            id: 'task:rule-1',
            type: 'task',
            success: false,
            error: { error: 'Internal', message: 'boom', statusCode: 500 },
          },
          { id: 'task:rule-2', type: 'task', success: true },
        ],
      });

      const res = await client.bulkDeleteRules({ ids: ['rule-1', 'rule-2'] });

      expect(res.affected_count).toBe(2);
      expect(res.errors).toEqual([
        { id: 'rule-1', error: expect.objectContaining({ code: 'TASK_MANAGER_DRIFT' }) },
      ]);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('ignores missing tasks (404) in the bulkRemove statuses — the task is already gone', async () => {
      const client = createClient();

      getRuleExecutorTaskIdMock.mockReturnValueOnce('task:rule-1');

      rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

      taskManager.bulkRemove.mockResolvedValueOnce({
        statuses: [
          {
            id: 'task:rule-1',
            type: 'task',
            success: false,
            error: { error: 'Not Found', message: 'not found', statusCode: 404 },
          },
        ],
      });

      const res = await client.bulkDeleteRules({ ids: ['rule-1'] });

      expect(res).toEqual({ affected_count: 1, errors: [] });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('returns a zero-affected empty response when ids is an empty array', async () => {
      const client = createClient();

      const res = await client.bulkDeleteRules({ ids: [] });

      expect(rulesSavedObjectService.bulkDelete).not.toHaveBeenCalled();
      expect(taskManager.bulkRemove).not.toHaveBeenCalled();
      expect(res).toEqual({ affected_count: 0, errors: [] });
    });
  });

  describe('bulkEnableRules', () => {
    it('enables disabled rules and reports them as affected', async () => {
      const client = createClient();

      const disabledAttrs = createRuleSoAttributes({
        metadata: { name: 'disabled-rule' },
        enabled: false,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: disabledAttrs, version: 'v1' },
      ]);

      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

      const res = await client.bulkEnableRules({ ids: ['rule-1'] });

      expect(rulesSavedObjectService.bulkUpdate).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'rule-1',
          attrs: expect.objectContaining({
            enabled: true,
            updatedBy: 'elastic_profile_uid',
            updatedAt: '2025-01-01T00:00:00.000Z',
          }),
        }),
      ]);

      expect(taskManager.bulkSchedule).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 'task:fallback',
            params: expect.objectContaining({ ruleId: 'rule-1' }),
            enabled: true,
          }),
        ],
        expect.objectContaining({ request, cloneApiKey: true })
      );

      expect(res).toEqual({ affected_count: 1, errors: [] });
    });

    it('schedules the tasks before persisting enabled=true', async () => {
      const client = createClient();

      const disabledAttrs = createRuleSoAttributes({
        metadata: { name: 'disabled-rule' },
        enabled: false,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: disabledAttrs, version: 'v1' },
      ]);

      const callOrder: string[] = [];
      taskManager.bulkSchedule.mockImplementationOnce(async () => {
        callOrder.push('bulkSchedule');
        return [];
      });
      rulesSavedObjectService.bulkUpdate.mockImplementationOnce(async () => {
        callOrder.push('bulkUpdate');
        return [{ id: 'rule-1', success: true }];
      });

      await client.bulkEnableRules({ ids: ['rule-1'] });

      expect(callOrder).toEqual(['bulkSchedule', 'bulkUpdate']);
    });

    it('leaves rules disabled and surfaces TASK_MANAGER_DRIFT when scheduling fails', async () => {
      const client = createClient();

      const disabledAttrs = createRuleSoAttributes({
        metadata: { name: 'disabled-rule' },
        enabled: false,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: disabledAttrs, version: 'v1' },
      ]);

      getRuleExecutorTaskIdMock.mockReturnValue('task:rule-1');
      taskManager.bulkSchedule.mockRejectedValueOnce(new Error('Failed to grant UIAM API key'));

      const res = await client.bulkEnableRules({ ids: ['rule-1'] });

      // Scheduling failed first, so the saved object is never flipped to enabled.
      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(taskManager.bulkRemove).toHaveBeenCalledWith(['task:rule-1']);
      expect(res.affected_count).toBe(0);
      expect(res.errors).toEqual([
        { id: 'rule-1', error: expect.objectContaining({ code: 'TASK_MANAGER_DRIFT' }) },
      ]);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(ruleEventPublisher.emitRuleEnabled).not.toHaveBeenCalled();
    });

    it('rolls back partially scheduled tasks when bulkSchedule throws', async () => {
      const client = createClient();

      const disabledAttrs = createRuleSoAttributes({
        metadata: { name: 'disabled-rule' },
        enabled: false,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: disabledAttrs, version: 'v1' },
        { id: 'rule-2', attributes: disabledAttrs, version: 'v1' },
      ]);

      getRuleExecutorTaskIdMock.mockImplementation(
        ({ ruleId }: { ruleId: string }) => `task:${ruleId}`
      );
      taskManager.bulkSchedule.mockRejectedValueOnce(new Error('partial schedule failure'));

      const res = await client.bulkEnableRules({ ids: ['rule-1', 'rule-2'] });

      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(taskManager.bulkRemove).toHaveBeenCalledWith(['task:rule-1', 'task:rule-2']);
      expect(res.affected_count).toBe(0);
      expect(res.errors).toEqual([
        { id: 'rule-1', error: expect.objectContaining({ code: 'TASK_MANAGER_DRIFT' }) },
        { id: 'rule-2', error: expect.objectContaining({ code: 'TASK_MANAGER_DRIFT' }) },
      ]);
    });

    it('cancels the just-scheduled task when the saved object update fails', async () => {
      const client = createClient();

      const disabledAttrs = createRuleSoAttributes({
        metadata: { name: 'disabled-rule' },
        enabled: false,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: disabledAttrs, version: 'v1' },
      ]);

      getRuleExecutorTaskIdMock.mockReturnValue('task:rule-1');

      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([
        {
          id: 'rule-1',
          success: false,
          error: { statusCode: 409, error: 'Conflict', message: 'Version conflict' },
        },
      ]);

      const res = await client.bulkEnableRules({ ids: ['rule-1'] });

      expect(taskManager.bulkRemove).toHaveBeenCalledWith(['task:rule-1']);
      expect(res.affected_count).toBe(0);
      expect(res.errors).toEqual([
        { id: 'rule-1', error: { code: 'RULE_VERSION_CONFLICT', message: 'Version conflict' } },
      ]);
    });

    it('counts already-enabled rules as affected without updating them (idempotent)', async () => {
      const client = createClient();

      const enabledAttrs = createRuleSoAttributes({
        metadata: { name: 'enabled-rule' },
        enabled: true,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: enabledAttrs, version: 'v1' },
      ]);

      const res = await client.bulkEnableRules({ ids: ['rule-1'] });

      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(res).toEqual({ affected_count: 1, errors: [] });
    });

    it('returns RULE_NOT_FOUND errors for rules that fail to fetch', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        {
          id: 'rule-missing',
          error: { statusCode: 404, error: 'Not Found', message: 'Saved object not found' },
        },
      ]);

      const res = await client.bulkEnableRules({ ids: ['rule-missing'] });

      expect(res.affected_count).toBe(0);
      expect(res.errors).toEqual([
        {
          id: 'rule-missing',
          error: { code: 'RULE_NOT_FOUND', message: 'Saved object not found' },
        },
      ]);
    });

    it('returns RULE_VERSION_CONFLICT errors for rules that fail to update', async () => {
      const client = createClient();

      const disabledAttrs = createRuleSoAttributes({
        metadata: { name: 'disabled-rule' },
        enabled: false,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: disabledAttrs, version: 'v1' },
      ]);

      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([
        {
          id: 'rule-1',
          success: false,
          error: { statusCode: 409, error: 'Conflict', message: 'Version conflict' },
        },
      ]);

      const res = await client.bulkEnableRules({ ids: ['rule-1'] });

      expect(res.affected_count).toBe(0);
      expect(res.errors).toEqual([
        { id: 'rule-1', error: { code: 'RULE_VERSION_CONFLICT', message: 'Version conflict' } },
      ]);
    });

    it('returns a zero-affected empty response when ids is an empty array', async () => {
      const client = createClient();

      const res = await client.bulkEnableRules({ ids: [] });

      expect(rulesSavedObjectService.bulkGetByIds).not.toHaveBeenCalled();
      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(res).toEqual({ affected_count: 0, errors: [] });
    });
  });

  describe('bulkDisableRules', () => {
    it('disables enabled rules and removes their executor tasks', async () => {
      const client = createClient();

      const enabledAttrs = createRuleSoAttributes({
        metadata: { name: 'enabled-rule' },
        enabled: true,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: enabledAttrs, version: 'v1' },
      ]);

      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

      getRuleExecutorTaskIdMock.mockReturnValueOnce('task:rule-1');

      const res = await client.bulkDisableRules({ ids: ['rule-1'] });

      expect(rulesSavedObjectService.bulkUpdate).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'rule-1',
          attrs: expect.objectContaining({
            enabled: false,
            updatedBy: 'elastic_profile_uid',
            updatedAt: '2025-01-01T00:00:00.000Z',
          }),
        }),
      ]);

      // Executor tasks are removed (not flagged disabled) to match single disable
      // and keep re-enable's `bulkSchedule` from conflicting on an existing task id.
      expect(taskManager.bulkRemove).toHaveBeenCalledWith(['task:rule-1']);
      expect(taskManager.bulkDisable).not.toHaveBeenCalled();

      expect(res).toEqual({ affected_count: 1, errors: [] });
    });

    it('counts already-disabled rules as affected without updating them (idempotent)', async () => {
      const client = createClient();

      const disabledAttrs = createRuleSoAttributes({
        metadata: { name: 'disabled-rule' },
        enabled: false,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: disabledAttrs, version: 'v1' },
      ]);

      const res = await client.bulkDisableRules({ ids: ['rule-1'] });

      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(taskManager.bulkRemove).not.toHaveBeenCalled();
      expect(res).toEqual({ affected_count: 1, errors: [] });
    });

    it('returns RULE_NOT_FOUND errors for rules that fail to fetch', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        {
          id: 'rule-missing',
          error: { statusCode: 404, error: 'Not Found', message: 'Saved object not found' },
        },
      ]);

      const res = await client.bulkDisableRules({ ids: ['rule-missing'] });

      expect(res.affected_count).toBe(0);
      expect(res.errors).toEqual([
        {
          id: 'rule-missing',
          error: { code: 'RULE_NOT_FOUND', message: 'Saved object not found' },
        },
      ]);
    });

    it('surfaces TASK_MANAGER_DRIFT errors when the task removal fails', async () => {
      const client = createClient();

      const enabledAttrs = createRuleSoAttributes({
        metadata: { name: 'enabled-rule' },
        enabled: true,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: enabledAttrs, version: 'v1' },
      ]);

      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

      getRuleExecutorTaskIdMock.mockReturnValueOnce('task:rule-1');
      taskManager.bulkRemove.mockRejectedValueOnce(new Error('task removal failed'));

      const res = await client.bulkDisableRules({ ids: ['rule-1'] });

      // The saved object is disabled (affected), but the task drift is flagged.
      expect(res.affected_count).toBe(1);
      expect(res.errors).toEqual([
        { id: 'rule-1', error: expect.objectContaining({ code: 'TASK_MANAGER_DRIFT' }) },
      ]);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('returns a zero-affected empty response when ids is an empty array', async () => {
      const client = createClient();

      const res = await client.bulkDisableRules({ ids: [] });

      expect(rulesSavedObjectService.bulkGetByIds).not.toHaveBeenCalled();
      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(res).toEqual({ affected_count: 0, errors: [] });
    });
  });

  describe('bulkUpdateApiKey', () => {
    // Minimal BulkUpdateTaskResult builder for the task-manager mock: `tasks`
    // are the rotated task ids, `errors` the per-task failures.
    const rotationResult = (rotatedTaskIds: string[]) =>
      ({ tasks: rotatedTaskIds.map((id) => ({ id })), errors: [] } as unknown as Awaited<
        ReturnType<typeof taskManager.bulkUpdateSchedules>
      >);

    it('rotates the executor task API key and stamps audit metadata', async () => {
      const client = createClient();

      const enabledAttrs = createRuleSoAttributes({
        metadata: { name: 'enabled-rule', tags: ['critical', 'foo'] },
        schedule: { every: '5m', lookback: '1m' },
        enabled: true,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: enabledAttrs, version: 'v1' },
      ]);
      taskManager.bulkUpdateSchedules.mockResolvedValueOnce(rotationResult(['task:fallback']));
      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1'] });

      // Rotation updates the existing task in place (preserving its schedule
      // interval) and regenerates the key while invalidating the old one.
      expect(taskManager.bulkUpdateSchedules).toHaveBeenCalledWith(
        ['task:fallback'],
        { interval: '5m' },
        expect.objectContaining({ request, regenerateApiKey: true, cloneApiKey: true })
      );

      // Only audit metadata is stamped — no rule state is changed.
      expect(rulesSavedObjectService.bulkUpdate).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'rule-1',
          attrs: expect.objectContaining({
            enabled: true,
            updatedBy: 'elastic_profile_uid',
            updatedAt: '2025-01-01T00:00:00.000Z',
          }),
        }),
      ]);

      expect(ruleEventPublisher.emitRuleUpdated).toHaveBeenCalledWith(request, [
        expect.objectContaining({
          ruleId: 'rule-1',
          spaceId: 'space-1',
          rule: expect.objectContaining({
            id: 'rule-1',
            metadata: expect.objectContaining({
              name: 'enabled-rule',
              tags: ['critical', 'foo'],
            }),
          }),
        }),
      ]);

      expect(res).toEqual({ affected_count: 1, errors: [] });
    });

    it('rotates the key before touching the saved objects', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: baseSoAttrs, version: 'v1' },
      ]);
      taskManager.bulkUpdateSchedules.mockResolvedValueOnce(rotationResult(['task:fallback']));
      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

      await client.bulkUpdateApiKey({ ids: ['rule-1'] });

      const rotateOrder = taskManager.bulkUpdateSchedules.mock.invocationCallOrder[0];
      const updateOrder = rulesSavedObjectService.bulkUpdate.mock.invocationCallOrder[0];
      expect(rotateOrder).toBeLessThan(updateOrder);
    });

    it('rejects a disabled rule with RULE_DISABLED without rotating', async () => {
      const client = createClient();

      const disabledAttrs = createRuleSoAttributes({
        metadata: { name: 'disabled-rule' },
        enabled: false,
      });

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: disabledAttrs, version: 'v1' },
      ]);

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1'] });

      expect(taskManager.bulkUpdateSchedules).not.toHaveBeenCalled();
      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(res).toEqual({
        affected_count: 0,
        errors: [
          {
            id: 'rule-1',
            error: {
              code: 'RULE_DISABLED',
              message: expect.stringContaining('disabled'),
              details: { name: 'disabled-rule' },
            },
          },
        ],
      });
    });

    // Builds a `bulkGet` result for the skipped-task status lookup.
    const taskStatusResult = (tasks: Array<{ id: string; status: string }>) =>
      tasks.map((task) => ({ tag: 'ok', value: task })) as unknown as Awaited<
        ReturnType<typeof taskManager.bulkGet>
      >;

    it('reports a skipped running task as RULE_ALREADY_RUNNING', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: baseSoAttrs, version: 'v1' },
      ]);
      // A running task is skipped by bulkUpdateSchedules — absent from both
      // `tasks` and `errors`. Its real status is then observed via bulkGet.
      taskManager.bulkUpdateSchedules.mockResolvedValueOnce(rotationResult([]));
      taskManager.bulkGet.mockResolvedValueOnce(
        taskStatusResult([{ id: 'task:fallback', status: 'running' }])
      );

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1'] });

      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(res).toEqual({
        affected_count: 0,
        errors: [
          {
            id: 'rule-1',
            error: {
              code: 'RULE_ALREADY_RUNNING',
              message: expect.stringContaining('running'),
              details: { name: 'rule-1' },
            },
          },
        ],
      });
    });

    it('reports a skipped non-running task (e.g. failed) as a generic failure, not RULE_ALREADY_RUNNING', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: baseSoAttrs, version: 'v1' },
      ]);
      // Skipped by bulkUpdateSchedules, but its task is `failed` (not mid-run),
      // so a retry would not help — it must not be reported as running.
      taskManager.bulkUpdateSchedules.mockResolvedValueOnce(rotationResult([]));
      taskManager.bulkGet.mockResolvedValueOnce(
        taskStatusResult([{ id: 'task:fallback', status: 'failed' }])
      );

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1'] });

      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(res).toEqual({
        affected_count: 0,
        errors: [
          {
            id: 'rule-1',
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: expect.stringContaining('rule-1'),
              details: { name: 'rule-1' },
            },
          },
        ],
      });
    });

    it('falls back to RULE_ALREADY_RUNNING when the skipped-task status lookup fails', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: baseSoAttrs, version: 'v1' },
      ]);
      taskManager.bulkUpdateSchedules.mockResolvedValueOnce(rotationResult([]));
      taskManager.bulkGet.mockRejectedValueOnce(new Error('ES unavailable'));

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1'] });

      expect(res).toEqual({
        affected_count: 0,
        errors: [
          {
            id: 'rule-1',
            error: {
              code: 'RULE_ALREADY_RUNNING',
              message: expect.stringContaining('running'),
              details: { name: 'rule-1' },
            },
          },
        ],
      });
    });

    it('rotates enabled rules and reports disabled ones as RULE_DISABLED in a mixed batch', async () => {
      const client = createClient();
      getRuleExecutorTaskIdMock.mockImplementation(({ ruleId }) => `task:${ruleId}`);

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-enabled', attributes: baseSoAttrs, version: 'v1' },
        {
          id: 'rule-disabled',
          attributes: createRuleSoAttributes({ enabled: false }),
          version: 'v1',
        },
      ]);
      taskManager.bulkUpdateSchedules.mockResolvedValueOnce(rotationResult(['task:rule-enabled']));
      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([
        { id: 'rule-enabled', success: true },
      ]);

      const res = await client.bulkUpdateApiKey({ ids: ['rule-enabled', 'rule-disabled'] });

      // Only the enabled rule is rotated.
      expect(taskManager.bulkUpdateSchedules).toHaveBeenCalledWith(
        ['task:rule-enabled'],
        { interval: '1m' },
        expect.objectContaining({ request, regenerateApiKey: true, cloneApiKey: true })
      );
      expect(res).toEqual({
        affected_count: 1,
        errors: [
          {
            id: 'rule-disabled',
            error: {
              code: 'RULE_DISABLED',
              message: expect.stringContaining('disabled'),
              details: { name: 'test-rule' },
            },
          },
        ],
      });
    });

    it('reports a failed rotation group as per-rule errors without aborting or stamping', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: baseSoAttrs, version: 'v1' },
      ]);

      taskManager.bulkUpdateSchedules.mockRejectedValueOnce(new Error('Failed to grant API key'));

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1'] });

      // The group failure is captured per-rule; nothing rotated, so no metadata
      // is stamped and no event is emitted.
      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(ruleEventPublisher.emitRuleUpdated).not.toHaveBeenCalled();
      expect(res).toEqual({
        affected_count: 0,
        errors: [
          {
            id: 'rule-1',
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: expect.stringContaining('rule-1'),
              details: { name: 'rule-1' },
            },
          },
        ],
      });
    });

    it('rotates and stamps a healthy interval group even when another group fails', async () => {
      const client = createClient();
      getRuleExecutorTaskIdMock.mockImplementation(({ ruleId }) => `task:${ruleId}`);

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        {
          id: 'rule-1m',
          attributes: createRuleSoAttributes({ schedule: { every: '1m', lookback: '1m' } }),
          version: 'v1',
        },
        {
          id: 'rule-5m',
          attributes: createRuleSoAttributes({ schedule: { every: '5m', lookback: '1m' } }),
          version: 'v1',
        },
      ]);
      // The '1m' group rotates; the '5m' group's grant is rejected.
      taskManager.bulkUpdateSchedules.mockImplementation(async (taskIds: string[]) => {
        if (taskIds.includes('task:rule-1m')) {
          return { tasks: [{ id: 'task:rule-1m' }], errors: [] } as unknown as Awaited<
            ReturnType<typeof taskManager.bulkUpdateSchedules>
          >;
        }
        throw new Error('Failed to grant API key');
      });
      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1m', success: true }]);

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1m', 'rule-5m'] });

      // The healthy group is still stamped even though the other group failed.
      expect(rulesSavedObjectService.bulkUpdate).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'rule-1m' }),
      ]);
      expect(res.affected_count).toBe(1);
      expect(res.errors).toEqual([
        {
          id: 'rule-5m',
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: expect.stringContaining('rule-5m'),
            details: { name: 'test-rule' },
          },
        },
      ]);
    });

    it('reports a per-task rotation failure as a per-rule error', async () => {
      const client = createClient();
      getRuleExecutorTaskIdMock.mockImplementation(({ ruleId }) => `task:${ruleId}`);

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: baseSoAttrs, version: 'v1' },
      ]);
      taskManager.bulkUpdateSchedules.mockResolvedValueOnce({
        tasks: [],
        errors: [
          {
            type: 'task',
            id: 'task:rule-1',
            error: { error: 'Conflict', statusCode: 409, message: 'version conflict' },
          },
        ],
      } as unknown as Awaited<ReturnType<typeof taskManager.bulkUpdateSchedules>>);

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1'] });

      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(res).toEqual({
        affected_count: 0,
        errors: [
          {
            id: 'rule-1',
            error: {
              code: 'RULE_VERSION_CONFLICT',
              message: expect.stringContaining('rule-1'),
              details: { name: 'rule-1' },
            },
          },
        ],
      });
    });

    it('returns RULE_NOT_FOUND errors for rules that fail to fetch without rotating', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        {
          id: 'rule-missing',
          error: { statusCode: 404, error: 'Not Found', message: 'Saved object not found' },
        },
      ]);

      const res = await client.bulkUpdateApiKey({ ids: ['rule-missing'] });

      expect(taskManager.bulkUpdateSchedules).not.toHaveBeenCalled();
      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(res).toEqual({
        affected_count: 0,
        errors: [
          {
            id: 'rule-missing',
            error: { code: 'RULE_NOT_FOUND', message: 'Saved object not found' },
          },
        ],
      });
    });

    it('rotates the valid rules and reports the fetch errors for the rest', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: baseSoAttrs, version: 'v1' },
        {
          id: 'rule-missing',
          error: { statusCode: 404, error: 'Not Found', message: 'Saved object not found' },
        },
      ]);
      taskManager.bulkUpdateSchedules.mockResolvedValueOnce(rotationResult(['task:fallback']));
      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1', 'rule-missing'] });

      expect(taskManager.bulkUpdateSchedules).toHaveBeenCalledWith(
        ['task:fallback'],
        { interval: '1m' },
        expect.objectContaining({ request, regenerateApiKey: true, cloneApiKey: true })
      );
      expect(res).toEqual({
        affected_count: 1,
        errors: [
          {
            id: 'rule-missing',
            error: { code: 'RULE_NOT_FOUND', message: 'Saved object not found' },
          },
        ],
      });
    });

    it('returns RULE_VERSION_CONFLICT errors when the audit-metadata update fails', async () => {
      const client = createClient();

      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'rule-1', attributes: baseSoAttrs, version: 'v1' },
      ]);
      taskManager.bulkUpdateSchedules.mockResolvedValueOnce(rotationResult(['task:fallback']));
      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([
        {
          id: 'rule-1',
          success: false,
          error: { statusCode: 409, error: 'Conflict', message: 'Version conflict' },
        },
      ]);

      const res = await client.bulkUpdateApiKey({ ids: ['rule-1'] });

      // The key was rotated, but the metadata write conflicted.
      expect(taskManager.bulkUpdateSchedules).toHaveBeenCalledTimes(1);
      expect(res).toEqual({
        affected_count: 0,
        errors: [
          {
            id: 'rule-1',
            error: {
              code: 'RULE_VERSION_CONFLICT',
              message: 'Version conflict',
              details: { name: 'rule-1' },
            },
          },
        ],
      });
    });

    it('returns a zero-affected empty response when ids is an empty array', async () => {
      const client = createClient();

      const res = await client.bulkUpdateApiKey({ ids: [] });

      expect(rulesSavedObjectService.bulkGetByIds).not.toHaveBeenCalled();
      expect(taskManager.bulkUpdateSchedules).not.toHaveBeenCalled();
      expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
      expect(res).toEqual({ affected_count: 0, errors: [] });
    });
  });

  describe('by-query bulk operations', () => {
    describe('deleteRulesByQuery', () => {
      it('returns a dry-run preview (match_count + capped sample) when force is false', async () => {
        const client = createClient();
        const totalMatches = BULK_QUERY_SAMPLE_SIZE + 10;
        const cappedIds = Array.from({ length: BULK_QUERY_SAMPLE_SIZE }, (_, i) => `dry-${i}`);
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(totalMatches);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(cappedIds);

        const res = await client.deleteRulesByQuery({ match_all: true });

        expect(rulesSavedObjectService.getRuleIdsByQuery).toHaveBeenCalledWith(
          expect.objectContaining({ maxItems: BULK_QUERY_SAMPLE_SIZE })
        );
        expect(rulesSavedObjectService.bulkDelete).not.toHaveBeenCalled();
        expect(taskManager.bulkRemove).not.toHaveBeenCalled();
        expect(res).toEqual({ match_count: totalMatches, sample: cappedIds });
      });

      it('skips the id stream on a dry-run when nothing matches', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(0);

        const res = await client.deleteRulesByQuery({ match_all: true });

        expect(rulesSavedObjectService.getRuleIdsByQuery).not.toHaveBeenCalled();
        expect(res).toEqual({ match_count: 0, sample: [] });
      });

      it('threads the filter and search selectors through to both count and stream calls', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(1);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(['probe']);

        await client.deleteRulesByQuery({ filter: 'enabled: true', search: 'prod' });

        const expectedQuery = expect.objectContaining({
          filter: `${RULE_SAVED_OBJECT_TYPE}.attributes.enabled: true`,
          search: 'prod*',
          searchFields: ['metadata.name', 'metadata.description'],
        });
        expect(rulesSavedObjectService.countByQuery).toHaveBeenCalledWith(expectedQuery);
        expect(rulesSavedObjectService.getRuleIdsByQuery).toHaveBeenCalledWith(expectedQuery);
      });

      it('executes the delete for all resolved ids when force is true', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(2);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(['rule-a', 'rule-b']);

        getRuleExecutorTaskIdMock
          .mockReturnValueOnce('task:rule-a')
          .mockReturnValueOnce('task:rule-b');

        rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([
          { id: 'rule-a', success: true },
          { id: 'rule-b', success: true },
        ]);

        const res = await client.deleteRulesByQuery({ match_all: true, force: true });

        expect(rulesSavedObjectService.getRuleIdsByQuery).toHaveBeenCalledWith(
          expect.objectContaining({ maxItems: BULK_FILTER_MAX_RESOURCES })
        );
        expect(rulesSavedObjectService.bulkDelete).toHaveBeenCalledWith(['rule-a', 'rule-b']);
        expect(taskManager.bulkRemove).toHaveBeenCalledWith(['task:rule-a', 'task:rule-b']);
        expect(res).toEqual({ affected_count: 2, errors: [] });
      });

      it('returns a zero-affected response and skips the id stream when nothing matches (force=true)', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(0);

        const res = await client.deleteRulesByQuery({ match_all: true, force: true });

        expect(rulesSavedObjectService.getRuleIdsByQuery).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.bulkDelete).not.toHaveBeenCalled();
        expect(res).toEqual({ affected_count: 0, errors: [] });
      });
    });

    describe('enableRulesByQuery', () => {
      it('returns a dry-run preview when force is false', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(2);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(['rule-1', 'rule-2']);

        const res = await client.enableRulesByQuery({ filter: 'enabled: false' });

        expect(rulesSavedObjectService.bulkGetByIds).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
        expect(res).toEqual({ match_count: 2, sample: ['rule-1', 'rule-2'] });
      });

      it('executes the enable for all resolved ids when force is true', async () => {
        const client = createClient();
        const disabledAttrs = createRuleSoAttributes({
          metadata: { name: 'disabled-rule' },
          enabled: false,
        });

        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(1);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(['rule-1']);

        rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
          { id: 'rule-1', attributes: disabledAttrs, version: 'v1' },
        ]);

        rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

        const res = await client.enableRulesByQuery({ filter: 'enabled: false', force: true });

        expect(rulesSavedObjectService.bulkUpdate).toHaveBeenCalled();
        expect(res).toEqual({ affected_count: 1, errors: [] });
      });
    });

    describe('disableRulesByQuery', () => {
      it('returns a dry-run preview when force is false', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(1);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(['rule-1']);

        const res = await client.disableRulesByQuery({ filter: 'enabled: true' });

        expect(rulesSavedObjectService.bulkGetByIds).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
        expect(res).toEqual({ match_count: 1, sample: ['rule-1'] });
      });

      it('executes the disable for all resolved ids when force is true', async () => {
        const client = createClient();
        const enabledAttrs = createRuleSoAttributes({
          metadata: { name: 'enabled-rule' },
          enabled: true,
        });

        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(1);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(['rule-1']);

        rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
          { id: 'rule-1', attributes: enabledAttrs, version: 'v1' },
        ]);

        rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

        getRuleExecutorTaskIdMock.mockReturnValueOnce('task:rule-1');

        const res = await client.disableRulesByQuery({ filter: 'enabled: true', force: true });

        expect(rulesSavedObjectService.bulkUpdate).toHaveBeenCalled();
        expect(taskManager.bulkRemove).toHaveBeenCalledWith(['task:rule-1']);
        expect(res).toEqual({ affected_count: 1, errors: [] });
      });
    });

    describe('updateApiKeyByQuery', () => {
      it('returns a dry-run preview when force is false without rotating keys', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(2);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(['rule-1', 'rule-2']);

        const res = await client.updateApiKeyByQuery({ match_all: true });

        expect(rulesSavedObjectService.bulkGetByIds).not.toHaveBeenCalled();
        expect(taskManager.bulkUpdateSchedules).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
        expect(res).toEqual({ match_count: 2, sample: ['rule-1', 'rule-2'] });
      });

      it('rotates the keys for all resolved ids when force is true', async () => {
        const client = createClient();

        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(1);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(['rule-1']);

        rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
          { id: 'rule-1', attributes: baseSoAttrs, version: 'v1' },
        ]);
        taskManager.bulkUpdateSchedules.mockResolvedValueOnce({
          tasks: [{ id: 'task:fallback' }],
          errors: [],
        } as unknown as Awaited<ReturnType<typeof taskManager.bulkUpdateSchedules>>);
        rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([{ id: 'rule-1', success: true }]);

        const res = await client.updateApiKeyByQuery({ match_all: true, force: true });

        expect(taskManager.bulkUpdateSchedules).toHaveBeenCalledWith(
          ['task:fallback'],
          { interval: '1m' },
          expect.objectContaining({ request, regenerateApiKey: true, cloneApiKey: true })
        );
        expect(rulesSavedObjectService.bulkUpdate).toHaveBeenCalled();
        expect(res).toEqual({ affected_count: 1, errors: [] });
      });
    });

    describe('over-cap requests (atomicity guarantee)', () => {
      const overCapTotal = BULK_FILTER_MAX_RESOURCES + 42;

      it('rejects deleteRulesByQuery with 400 without opening the id stream or mutating rules', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(overCapTotal);

        await expect(
          client.deleteRulesByQuery({ match_all: true, force: true })
        ).rejects.toMatchObject({
          output: { statusCode: 400 },
          data: {
            code: 'BULK_QUERY_MATCH_LIMIT_EXCEEDED',
            details: { match_count: overCapTotal, limit: BULK_FILTER_MAX_RESOURCES },
          },
        });

        expect(rulesSavedObjectService.getRuleIdsByQuery).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.bulkDelete).not.toHaveBeenCalled();
        expect(taskManager.bulkRemove).not.toHaveBeenCalled();
      });

      it('rejects enableRulesByQuery with 400 without opening the id stream or mutating rules', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(overCapTotal);

        await expect(
          client.enableRulesByQuery({ filter: 'enabled: false', force: true })
        ).rejects.toMatchObject({
          output: { statusCode: 400 },
          data: {
            code: 'BULK_QUERY_MATCH_LIMIT_EXCEEDED',
            details: { match_count: overCapTotal, limit: BULK_FILTER_MAX_RESOURCES },
          },
        });

        expect(rulesSavedObjectService.getRuleIdsByQuery).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.bulkGetByIds).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
        expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
      });

      it('rejects disableRulesByQuery with 400 without opening the id stream or mutating rules', async () => {
        const client = createClient();
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(overCapTotal);

        await expect(
          client.disableRulesByQuery({ filter: 'enabled: true', force: true })
        ).rejects.toMatchObject({
          output: { statusCode: 400 },
          data: {
            code: 'BULK_QUERY_MATCH_LIMIT_EXCEEDED',
            details: { match_count: overCapTotal, limit: BULK_FILTER_MAX_RESOURCES },
          },
        });

        expect(rulesSavedObjectService.getRuleIdsByQuery).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.bulkGetByIds).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.bulkUpdate).not.toHaveBeenCalled();
        expect(taskManager.bulkRemove).not.toHaveBeenCalled();
      });

      it('executes when total equals the cap exactly (boundary is inclusive)', async () => {
        const client = createClient();
        const exactCapIds = Array.from(
          { length: BULK_FILTER_MAX_RESOURCES },
          (_, i) => `cap-rule-${i}`
        );
        rulesSavedObjectService.countByQuery.mockResolvedValueOnce(BULK_FILTER_MAX_RESOURCES);
        rulesSavedObjectService.getRuleIdsByQuery.mockResolvedValueOnce(exactCapIds);

        rulesSavedObjectService.bulkDelete.mockResolvedValueOnce(
          exactCapIds.map((id) => ({ id, success: true as const }))
        );

        const res = await client.deleteRulesByQuery({ match_all: true, force: true });

        expect(rulesSavedObjectService.getRuleIdsByQuery).toHaveBeenCalledWith(
          expect.objectContaining({ maxItems: BULK_FILTER_MAX_RESOURCES })
        );
        expect(rulesSavedObjectService.bulkDelete).toHaveBeenCalledTimes(1);
        expect(rulesSavedObjectService.bulkDelete.mock.calls[0][0]).toHaveLength(
          BULK_FILTER_MAX_RESOURCES
        );
        expect(res).toEqual({ affected_count: BULK_FILTER_MAX_RESOURCES, errors: [] });
      });
    });
  });

  describe('error codes and details', () => {
    it('attaches RULE_NOT_FOUND code and rule_id details when reading a missing rule', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError(RULE_SAVED_OBJECT_TYPE, 'rule-x')
      );

      await expect(client.getRule({ id: 'rule-x' })).rejects.toMatchObject({
        output: { statusCode: 404 },
        data: {
          code: 'RULE_NOT_FOUND',
          details: { rule_id: 'rule-x' },
        },
      });
    });

    it('attaches RULE_NOT_FOUND code and rule_id details when deleting a missing rule', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError(
          RULE_SAVED_OBJECT_TYPE,
          'rule-del-missing'
        )
      );

      await expect(client.deleteRule({ id: 'rule-del-missing' })).rejects.toMatchObject({
        output: { statusCode: 404 },
        data: {
          code: 'RULE_NOT_FOUND',
          details: { rule_id: 'rule-del-missing' },
        },
      });

      expect(taskManager.removeIfExists).not.toHaveBeenCalled();
      expect(rulesSavedObjectService.delete).not.toHaveBeenCalled();
    });

    it('attaches RULE_ALREADY_EXISTS code and rule_id details when create conflicts', async () => {
      const client = createClient();
      rulesSavedObjectService.create.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createConflictError(RULE_SAVED_OBJECT_TYPE, 'rule-dup')
      );

      await expect(
        client.createRule({ data: baseCreateData, options: { id: 'rule-dup' } })
      ).rejects.toMatchObject({
        output: { statusCode: 409 },
        data: {
          code: 'RULE_ALREADY_EXISTS',
          details: { rule_id: 'rule-dup' },
        },
      });
    });

    it('attaches INVALID_RULE_DATA code and structured Zod errors when create body is invalid', async () => {
      const client = createClient();

      await expect(
        client.createRule({
          data: {
            ...baseCreateData,
            schedule: { every: '1ms', lookback: '1m' },
          },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        data: {
          code: 'INVALID_RULE_DATA',
          details: {
            context: 'create',
            errors: {
              errors: [],
              properties: {
                schedule: {
                  errors: [],
                  properties: {
                    every: {
                      errors: ['Duration "1ms" is below the minimum allowed value of "5s"'],
                    },
                  },
                },
              },
            },
          },
        },
      });
    });

    it('attaches RULE_VERSION_CONFLICT code on optimistic concurrency failure', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-x',
        attributes: baseSoAttrs,
        version: 'v1',
      });
      rulesSavedObjectService.update.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createConflictError(RULE_SAVED_OBJECT_TYPE, 'rule-id-x')
      );

      await expect(
        client.updateRule({ id: 'rule-id-x', data: { metadata: { name: 'rename' } } })
      ).rejects.toMatchObject({
        output: { statusCode: 409 },
        data: {
          code: 'RULE_VERSION_CONFLICT',
          details: { rule_id: 'rule-id-x' },
        },
      });
    });

    it('attaches INVALID_STATE_TRANSITION code when state_transition is set on a non-alert rule', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-y',
        attributes: { ...baseSoAttrs, kind: 'signal' },
        version: 'v1',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-y',
          data: { state_transition: { pending_count: 2 } },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        data: {
          code: 'INVALID_STATE_TRANSITION',
          details: { rule_id: 'rule-id-y', rule_kind: 'signal' },
        },
      });
    });

    it('attaches INVALID_SIGNAL_RULE code when a signal rule is updated to a composed query', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-signal-z',
        attributes: { ...baseSoAttrs, kind: 'signal' },
        version: 'v1',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-signal-z',
          data: {
            query: {
              format: 'composed',
              base: 'FROM logs-*',
              breach: { segment: 'WHERE error' },
            },
          },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        data: {
          code: 'INVALID_SIGNAL_RULE',
          details: { rule_id: 'rule-id-signal-z', rule_kind: 'signal' },
        },
      });
    });

    it('attaches INVALID_RULE_QUERY_CONFIG code when an update desynchronizes a strategy and its query block', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-id-query-config',
        attributes: { ...baseSoAttrs, kind: 'alert' },
        version: 'v1',
      });

      await expect(
        client.updateRule({
          id: 'rule-id-query-config',
          data: { recovery_strategy: 'query' },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        data: {
          code: 'INVALID_RULE_QUERY_CONFIG',
          details: { rule_id: 'rule-id-query-config' },
        },
      });
    });

    it('attaches INVALID_FILTER_FIELD code with allowed_fields when filter uses unknown field', async () => {
      const client = createClient();

      await expect(client.findRules({ filter: 'nonsense_field: value' })).rejects.toMatchObject({
        output: { statusCode: 400 },
        data: {
          code: 'INVALID_FILTER_FIELD',
          details: expect.objectContaining({
            field: 'nonsense_field',
          }),
        },
      });
    });

    it('attaches BULK_QUERY_MATCH_LIMIT_EXCEEDED code and match/limit details on an over-cap force request', async () => {
      const client = createClient();
      const overCapTotal = BULK_FILTER_MAX_RESOURCES + 1;
      rulesSavedObjectService.countByQuery.mockResolvedValueOnce(overCapTotal);

      await expect(
        client.deleteRulesByQuery({ match_all: true, force: true })
      ).rejects.toMatchObject({
        output: { statusCode: 400 },
        data: {
          code: 'BULK_QUERY_MATCH_LIMIT_EXCEEDED',
          details: { match_count: overCapTotal, limit: BULK_FILTER_MAX_RESOURCES },
        },
      });
    });
  });

  describe('workflow trigger events', () => {
    const workflowRuleTags = ['production'];
    const workflowSoAttrs = createRuleSoAttributes({
      metadata: { name: 'rule-1', tags: workflowRuleTags },
      time_field: '@timestamp',
      schedule: { every: '1m', lookback: '1m' },
      query: {
        format: 'standalone',
        breach: { query: 'FROM logs-* | LIMIT 1' },
      },
    });
    const workflowCreateData: CreateRuleParams['data'] = {
      ...baseCreateData,
      metadata: { name: 'rule-1', tags: workflowRuleTags },
    };

    const mockGetExistingRule = (
      id: string,
      attributes: RuleSavedObjectAttributes = workflowSoAttrs,
      version = 'v1'
    ) => {
      rulesSavedObjectService.get.mockResolvedValueOnce({ id, attributes, version });
    };

    const expectNoRuleEventEmits = () => {
      expect(ruleEventPublisher.emitRuleCreated).not.toHaveBeenCalled();
      expect(ruleEventPublisher.emitRuleUpdated).not.toHaveBeenCalled();
      expect(ruleEventPublisher.emitRuleDeleted).not.toHaveBeenCalled();
      expect(ruleEventPublisher.emitRuleEnabled).not.toHaveBeenCalled();
      expect(ruleEventPublisher.emitRuleDisabled).not.toHaveBeenCalled();
    };

    describe('createRule', () => {
      it('emits ruleCreated after createRule', async () => {
        const client = createClient();
        rulesSavedObjectService.create.mockResolvedValueOnce({ id: 'rule-id-wf-1' });

        await client.createRule({ data: workflowCreateData, options: { id: 'rule-id-wf-1' } });

        expect(ruleEventPublisher.emitRuleCreated).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-1', spaceId: 'space-1' }),
        ]);
      });
    });

    describe('updateRule', () => {
      it('emits ruleUpdated after a content update', async () => {
        const client = createClient();
        mockGetExistingRule('rule-id-wf-2');

        await client.updateRule({
          id: 'rule-id-wf-2',
          data: { metadata: { name: 'renamed' } },
        });

        expect(ruleEventPublisher.emitRuleUpdated).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-2', spaceId: 'space-1' }),
        ]);
        expect(ruleEventPublisher.emitRuleEnabled).not.toHaveBeenCalled();
        expect(ruleEventPublisher.emitRuleDisabled).not.toHaveBeenCalled();
      });

      it('emits ruleUpdated for an empty PATCH so version and change history stay aligned', async () => {
        const client = createClient();
        mockGetExistingRule('rule-id-wf-empty', {
          ...workflowSoAttrs,
          metadata: { ...workflowSoAttrs.metadata, version: 4 },
        });

        await client.updateRule({ id: 'rule-id-wf-empty', data: {} });

        expect(ruleEventPublisher.emitRuleUpdated).toHaveBeenCalledWith(request, [
          expect.objectContaining({
            ruleId: 'rule-id-wf-empty',
            spaceId: 'space-1',
            rule: expect.objectContaining({
              metadata: expect.objectContaining({ version: 5 }),
            }),
          }),
        ]);
        const { attrs: savedAttrs } = rulesSavedObjectService.update.mock.calls[0][0];
        expect(savedAttrs.metadata.version).toBe(5);
      });

      it('emits only ruleUpdated for a content update on a disabled rule (no lifecycle event via the update path)', async () => {
        const client = createClient();
        mockGetExistingRule('rule-id-wf-3', { ...workflowSoAttrs, enabled: false });

        await client.updateRule({
          id: 'rule-id-wf-3',
          data: { metadata: { name: 'renamed' } },
        });

        expect(ruleEventPublisher.emitRuleUpdated).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-3', spaceId: 'space-1' }),
        ]);
        expect(ruleEventPublisher.emitRuleEnabled).not.toHaveBeenCalled();
        expect(ruleEventPublisher.emitRuleDisabled).not.toHaveBeenCalled();
      });
    });

    describe('upsertRule', () => {
      it('emits ruleCreated when the rule is created', async () => {
        const client = createClient();
        rulesSavedObjectService.get.mockRejectedValueOnce(
          SavedObjectsErrorHelpers.createGenericNotFoundError(
            RULE_SAVED_OBJECT_TYPE,
            'rule-id-wf-upsert-create'
          )
        );
        rulesSavedObjectService.create.mockResolvedValueOnce({
          id: 'rule-id-wf-upsert-create',
        });

        await client.upsertRule({ id: 'rule-id-wf-upsert-create', data: workflowCreateData });

        expect(ruleEventPublisher.emitRuleCreated).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-upsert-create', spaceId: 'space-1' }),
        ]);
      });

      it('publishes rule updated when an existing rule is replaced', async () => {
        const client = createClient();
        const existingDoc = {
          id: 'rule-id-wf-upsert-replace',
          attributes: { ...workflowSoAttrs, enabled: false },
          version: 'v1',
        };
        rulesSavedObjectService.get
          .mockResolvedValueOnce(existingDoc)
          .mockResolvedValueOnce(existingDoc);
        rulesSavedObjectService.update.mockResolvedValueOnce({
          id: 'rule-id-wf-upsert-replace',
        });

        await client.upsertRule({
          id: 'rule-id-wf-upsert-replace',
          data: { ...workflowCreateData, metadata: { name: 'replaced', tags: workflowRuleTags } },
        });

        expect(ruleEventPublisher.emitRuleUpdated).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-upsert-replace', spaceId: 'space-1' }),
        ]);
      });
    });

    describe('deleteRule', () => {
      it('emits ruleDeleted with the deleted rule id', async () => {
        const client = createClient();
        mockGetExistingRule('rule-id-wf-4');

        await client.deleteRule({ id: 'rule-id-wf-4' });

        expect(ruleEventPublisher.emitRuleDeleted).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-4', spaceId: 'space-1' }),
        ]);
      });
    });

    describe('enableRule', () => {
      it('publishes rule enabled when the rule transitions to enabled', async () => {
        const client = createClient();
        mockGetExistingRule('rule-id-wf-enable', { ...workflowSoAttrs, enabled: false });

        await client.enableRule({ id: 'rule-id-wf-enable' });

        expect(ruleEventPublisher.emitRuleEnabled).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-enable', spaceId: 'space-1' }),
        ]);
      });

      it('re-writes the SO, re-ensures the task, and still emits ruleEnabled when already enabled (self-heal)', async () => {
        const client = createClient();
        mockGetExistingRule('rule-id-wf-enable-noop');

        await client.enableRule({ id: 'rule-id-wf-enable-noop' });

        expect(rulesSavedObjectService.update).toHaveBeenCalled();
        expect(ensureRuleExecutorTaskScheduledMock).toHaveBeenCalled();
        expect(ruleEventPublisher.emitRuleEnabled).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-enable-noop', spaceId: 'space-1' }),
        ]);
      });
    });

    describe('disableRule', () => {
      it('publishes rule disabled when the rule transitions to disabled', async () => {
        const client = createClient();
        mockGetExistingRule('rule-id-wf-disable');

        await client.disableRule({ id: 'rule-id-wf-disable' });

        expect(ruleEventPublisher.emitRuleDisabled).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-disable', spaceId: 'space-1' }),
        ]);
      });

      it('re-writes the SO, removes the task, and still emits ruleDisabled when already disabled (self-heal)', async () => {
        const client = createClient();
        mockGetExistingRule('rule-id-wf-5', { ...workflowSoAttrs, enabled: false });

        await client.disableRule({ id: 'rule-id-wf-5' });

        expect(rulesSavedObjectService.update).toHaveBeenCalled();
        expect(taskManager.removeIfExists).toHaveBeenCalled();
        expect(ruleEventPublisher.emitRuleDisabled).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-id-wf-5', spaceId: 'space-1' }),
        ]);
      });
    });

    describe('bulkEnableRules', () => {
      it('emits ruleEnabled for only successfully enabled rules', async () => {
        const client = createClient();
        rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
          { id: 'rule-ok', attributes: { ...workflowSoAttrs, enabled: false }, version: 'v1' },
          {
            id: 'rule-missing',
            error: { statusCode: 404, message: 'Not found', error: 'Not found' },
          },
        ]);
        rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([
          { id: 'rule-ok', success: true },
        ]);

        await client.bulkEnableRules({ ids: ['rule-ok', 'rule-missing'] });

        expect(ruleEventPublisher.emitRuleEnabled).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-ok', spaceId: 'space-1' }),
        ]);
        const enabledIds = (ruleEventPublisher.emitRuleEnabled as jest.Mock).mock.calls[0][1];
        expect(enabledIds).toEqual([
          expect.objectContaining({ ruleId: 'rule-ok', spaceId: 'space-1' }),
        ]);
      });

      it('does not publish when all requested rules are already enabled', async () => {
        const client = createClient();
        rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
          { id: 'rule-already-enabled', attributes: workflowSoAttrs, version: 'v1' },
        ]);

        await client.bulkEnableRules({ ids: ['rule-already-enabled'] });

        expectNoRuleEventEmits();
      });
    });

    describe('bulkDisableRules', () => {
      it('emits ruleDisabled for only successfully disabled rules', async () => {
        const client = createClient();
        rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
          { id: 'rule-ok', attributes: workflowSoAttrs, version: 'v1' },
          {
            id: 'rule-missing',
            error: { statusCode: 404, message: 'Not found', error: 'Not found' },
          },
        ]);
        rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([
          { id: 'rule-ok', success: true },
        ]);

        await client.bulkDisableRules({ ids: ['rule-ok', 'rule-missing'] });

        expect(ruleEventPublisher.emitRuleDisabled).toHaveBeenCalledWith(request, [
          expect.objectContaining({ ruleId: 'rule-ok', spaceId: 'space-1' }),
        ]);
        const disabledIds = (ruleEventPublisher.emitRuleDisabled as jest.Mock).mock.calls[0][1];
        expect(disabledIds).toEqual([
          expect.objectContaining({ ruleId: 'rule-ok', spaceId: 'space-1' }),
        ]);
      });

      it('publishes no event (empty array) when all requested rules are already disabled', async () => {
        const client = createClient();
        rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
          {
            id: 'rule-already-disabled',
            attributes: { ...workflowSoAttrs, enabled: false },
            version: 'v1',
          },
        ]);

        await client.bulkDisableRules({ ids: ['rule-already-disabled'] });

        // The length guard was removed; emitRuleDisabled is invoked
        // unconditionally and no-ops on the empty array (no event published).
        expect(ruleEventPublisher.emitRuleDisabled).toHaveBeenCalledWith(request, []);
        expect(ruleEventPublisher.emitRuleEnabled).not.toHaveBeenCalled();
      });
    });

    describe('bulkDeleteRules', () => {
      it('emits ruleDeleted with the ids of successfully deleted rules', async () => {
        const client = createClient();
        rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([
          { id: 'rule-1', success: true },
          { id: 'rule-2', success: true },
        ]);

        await client.bulkDeleteRules({ ids: ['rule-1', 'rule-2'] });

        expect(ruleEventPublisher.emitRuleDeleted).toHaveBeenCalledWith(request, [
          { ruleId: 'rule-1', spaceId: 'space-1' },
          { ruleId: 'rule-2', spaceId: 'space-1' },
        ]);
      });

      it('publishes rule deleted only for rules that were successfully deleted', async () => {
        const client = createClient();
        rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([
          { id: 'rule-1', success: true },
          {
            id: 'rule-2',
            success: false,
            error: { error: 'Not Found', message: 'Rule not found', statusCode: 404 },
          },
        ]);

        await client.bulkDeleteRules({ ids: ['rule-1', 'rule-2'] });

        expect(ruleEventPublisher.emitRuleDeleted).toHaveBeenCalledWith(request, [
          { ruleId: 'rule-1', spaceId: 'space-1' },
        ]);
      });
    });
  });

  describe('change history data on emitted events', () => {
    const firstEmit = (spy: jest.Mock): EventRule[] => spy.mock.calls[0][1] as EventRule[];

    it('emits ruleCreated carrying the created rule with sequence 1', async () => {
      const client = createClient();
      rulesSavedObjectService.create.mockResolvedValueOnce({ id: 'rule-ch-create' });

      await client.createRule({ data: baseCreateData, options: { id: 'rule-ch-create' } });

      expect(firstEmit(ruleEventPublisher.emitRuleCreated as jest.Mock)).toEqual([
        expect.objectContaining({
          ruleId: 'rule-ch-create',
          spaceId: 'space-1',
          rule: expect.objectContaining({
            id: 'rule-ch-create',
            metadata: expect.objectContaining({ name: 'rule-1', version: 1 }),
          }),
        }),
      ]);
    });

    it('increments the sequence from the existing rule on update', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-ch-update',
        attributes: { ...baseSoAttrs, metadata: { ...baseSoAttrs.metadata, version: 4 } },
        version: 'v1',
      });

      await client.updateRule({ id: 'rule-ch-update', data: { metadata: { name: 'renamed' } } });

      const [event] = firstEmit(ruleEventPublisher.emitRuleUpdated as jest.Mock);
      expect(event.rule?.metadata.version).toBe(5);
    });

    it('carries the deleted rule with a bumped sequence for deletions', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-ch-delete',
        attributes: { ...baseSoAttrs, metadata: { ...baseSoAttrs.metadata, version: 7 } },
        version: 'v1',
      });

      await client.deleteRule({ id: 'rule-ch-delete' });

      const [event] = firstEmit(ruleEventPublisher.emitRuleDeleted as jest.Mock);
      expect(event.ruleId).toBe('rule-ch-delete');
      // Nothing is persisted on delete, so the emitted rule carries the bumped
      // counter so the deletion orders after the last change.
      expect(event.rule?.metadata.version).toBe(8);
      expect(event.rule?.id).toBe('rule-ch-delete');
    });

    it('emits one event per rule for a bulk delete, each with a bumped sequence', async () => {
      const client = createClient();
      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        {
          id: 'bulk-del-1',
          attributes: { ...baseSoAttrs, metadata: { ...baseSoAttrs.metadata, version: 1 } },
        },
        {
          id: 'bulk-del-2',
          attributes: { ...baseSoAttrs, metadata: { ...baseSoAttrs.metadata, version: 2 } },
        },
      ]);
      rulesSavedObjectService.bulkDelete.mockResolvedValueOnce([
        { id: 'bulk-del-1', success: true },
        { id: 'bulk-del-2', success: true },
      ]);

      await client.bulkDeleteRules({ ids: ['bulk-del-1', 'bulk-del-2'] });

      const events = firstEmit(ruleEventPublisher.emitRuleDeleted as jest.Mock);
      expect(events).toHaveLength(2);
      expect(events[0].rule?.metadata.version).toBe(2);
      expect(events[1].rule?.metadata.version).toBe(3);
    });

    it('emits enabled rules carrying the full domain rule for a bulk enable', async () => {
      const client = createClient();
      const disabledAttrs = createRuleSoAttributes({
        metadata: { name: 'disabled-rule' },
        enabled: false,
      });
      rulesSavedObjectService.bulkGetByIds.mockResolvedValueOnce([
        { id: 'bulk-en-1', attributes: disabledAttrs, version: 'v1' },
        { id: 'bulk-en-2', attributes: disabledAttrs, version: 'v1' },
      ]);
      rulesSavedObjectService.bulkUpdate.mockResolvedValueOnce([
        { id: 'bulk-en-1', success: true },
        { id: 'bulk-en-2', success: true },
      ]);

      await client.bulkEnableRules({ ids: ['bulk-en-1', 'bulk-en-2'] });

      const events = firstEmit(ruleEventPublisher.emitRuleEnabled as jest.Mock);
      expect(events).toHaveLength(2);
      expect(events[0].rule).toEqual(
        expect.objectContaining({
          enabled: true,
          metadata: expect.objectContaining({ version: 1 }),
        })
      );
    });

    it('persists the incremented version on the saved object', async () => {
      const client = createClient();
      rulesSavedObjectService.get.mockResolvedValueOnce({
        id: 'rule-ch-seq',
        attributes: { ...baseSoAttrs, metadata: { ...baseSoAttrs.metadata, version: 2 } },
        version: 'v1',
      });

      await client.updateRule({ id: 'rule-ch-seq', data: { metadata: { name: 'renamed' } } });

      const { attrs: savedAttrs } = rulesSavedObjectService.update.mock.calls[0][0];
      expect(savedAttrs.metadata.version).toBe(3);
    });
  });

  describe('schedule guardrails', () => {
    describe('minimumScheduleInterval', () => {
      it('rejects creating a rule whose interval is below the configured minimum', async () => {
        const client = createClient({ minimumScheduleInterval: '1m' });

        await expect(
          client.createRule({
            data: { ...baseCreateData, schedule: { every: '30s', lookback: '1m' } },
          })
        ).rejects.toMatchObject({
          output: { statusCode: 400 },
          data: {
            code: 'SCHEDULE_INTERVAL_TOO_SHORT',
            details: { interval: '30s', minimumScheduleInterval: '1m' },
          },
        });

        expect(rulesSavedObjectService.create).not.toHaveBeenCalled();
      });

      it('allows creating a rule whose interval equals the configured minimum', async () => {
        const client = createClient({ minimumScheduleInterval: '1m' });

        await expect(client.createRule({ data: baseCreateData })).resolves.toBeDefined();
        expect(rulesSavedObjectService.create).toHaveBeenCalled();
      });

      it('rejects updating a rule to an interval below the configured minimum', async () => {
        const client = createClient({ minimumScheduleInterval: '5m' });

        rulesSavedObjectService.get.mockResolvedValueOnce({
          attributes: baseSoAttrs,
          version: 'WzEsMV0=',
          id: 'rule-id-1',
        });

        await expect(
          client.updateRule({ id: 'rule-id-1', data: { schedule: { every: '1m' } } })
        ).rejects.toMatchObject({
          output: { statusCode: 400 },
          data: { code: 'SCHEDULE_INTERVAL_TOO_SHORT' },
        });

        expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
      });
    });

    describe('maxScheduledPerMinute', () => {
      it('rejects creating a rule when the limit is already reached', async () => {
        const client = createClient({ maxScheduledPerMinute: 1 });
        rulesSavedObjectService.getTotalScheduledPerMinute.mockResolvedValueOnce(1);

        await expect(client.createRule({ data: baseCreateData })).rejects.toMatchObject({
          output: { statusCode: 400 },
          data: {
            code: 'MAX_SCHEDULES_PER_MINUTE_EXCEEDED',
            details: { interval: '1m', maxScheduledPerMinute: 1 },
          },
        });

        expect(rulesSavedObjectService.create).not.toHaveBeenCalled();
      });

      it('allows creating a rule when there is remaining capacity', async () => {
        const client = createClient({ maxScheduledPerMinute: 400 });
        rulesSavedObjectService.getTotalScheduledPerMinute.mockResolvedValueOnce(10);

        await expect(client.createRule({ data: baseCreateData })).resolves.toBeDefined();
        expect(rulesSavedObjectService.create).toHaveBeenCalled();
      });

      it('adds the previous schedule back when updating an already-enabled rule', async () => {
        const client = createClient({ maxScheduledPerMinute: 1 });
        // The single available slot is consumed by this rule's existing 1m schedule.
        rulesSavedObjectService.getTotalScheduledPerMinute.mockResolvedValueOnce(1);

        rulesSavedObjectService.get.mockResolvedValueOnce({
          attributes: baseSoAttrs,
          version: 'WzEsMV0=',
          id: 'rule-id-1',
        });

        // Re-saving with the same 1m schedule must not be rejected.
        await expect(
          client.updateRule({ id: 'rule-id-1', data: { schedule: { every: '1m' } } })
        ).resolves.toBeDefined();
        expect(rulesSavedObjectService.update).toHaveBeenCalled();
      });

      it('allows reducing the schedule frequency of an enabled rule without scanning, even past the limit', async () => {
        const client = createClient({ maxScheduledPerMinute: 1 });
        rulesSavedObjectService.getTotalScheduledPerMinute.mockResolvedValue(1000);

        // Existing enabled rule runs every 1m; moving to a less frequent 5m adds no load.
        rulesSavedObjectService.get.mockResolvedValueOnce({
          attributes: baseSoAttrs,
          version: 'WzEsMV0=',
          id: 'rule-id-1',
        });

        await expect(
          client.updateRule({ id: 'rule-id-1', data: { schedule: { every: '5m' } } })
        ).resolves.toBeDefined();

        // The cluster-wide scan is skipped because the schedule adds no load.
        expect(rulesSavedObjectService.getTotalScheduledPerMinute).not.toHaveBeenCalled();
        expect(rulesSavedObjectService.update).toHaveBeenCalled();
      });

      it('rejects enabling a disabled rule when the limit is already reached', async () => {
        const client = createClient({ maxScheduledPerMinute: 1 });
        rulesSavedObjectService.getTotalScheduledPerMinute.mockResolvedValueOnce(1);

        rulesSavedObjectService.get.mockResolvedValueOnce({
          attributes: { ...baseSoAttrs, enabled: false },
          version: 'WzEsMV0=',
          id: 'rule-id-1',
        });

        await expect(client.enableRule({ id: 'rule-id-1' })).rejects.toMatchObject({
          output: { statusCode: 400 },
          data: { code: 'MAX_SCHEDULES_PER_MINUTE_EXCEEDED' },
        });

        expect(rulesSavedObjectService.update).not.toHaveBeenCalled();
      });
    });
  });
});
