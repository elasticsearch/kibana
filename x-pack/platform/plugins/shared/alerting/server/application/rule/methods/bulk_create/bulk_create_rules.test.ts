/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  coreFeatureFlagsMock,
  loggingSystemMock,
  savedObjectsClientMock,
  savedObjectsRepositoryMock,
  uiSettingsServiceMock,
} from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import type { ActionsAuthorization, ActionsClient } from '@kbn/actions-plugin/server';
import { createMockConnector } from '@kbn/actions-plugin/server/application/connector/mocks';
import { ruleTypeRegistryMock } from '../../../../rule_type_registry.mock';
import { alertingAuthorizationMock } from '../../../../authorization/alerting_authorization.mock';
import type { AlertingAuthorization } from '../../../../authorization/alerting_authorization';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import type { ConstructorOptions } from '../../../../rules_client/rules_client';
import { RulesClient } from '../../../../rules_client/rules_client';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import { validateScheduleLimit } from '../get_schedule_frequency';
import { RuleAuditAction } from '../../../../rules_client/common/audit_events';
import {
  DEFAULT_BULK_CREATE_BATCH_SIZE,
  MIN_BULK_CREATE_BATCH_SIZE,
  MAX_BULK_CREATE_BATCH_SIZE,
  MAX_RULES_NUMBER_FOR_BULK_OPERATION,
} from '../../../../rules_client/common/constants';

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

jest.mock('../get_schedule_frequency', () => ({
  validateScheduleLimit: jest.fn(),
}));

jest.mock('@kbn/core-saved-objects-utils-server', () => {
  const actual = jest.requireActual('@kbn/core-saved-objects-utils-server');
  return {
    ...actual,
    SavedObjectsUtils: {
      generateId: jest.fn(),
    },
  };
});

import { SavedObjectsUtils } from '@kbn/core-saved-objects-utils-server';

const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();

const rulesClientParams: jest.Mocked<ConstructorOptions> = {
  taskManager,
  ruleTypeRegistry,
  unsecuredSavedObjectsClient,
  authorization: authorization as unknown as AlertingAuthorization,
  actionsAuthorization: actionsAuthorization as unknown as ActionsAuthorization,
  spaceId: 'default',
  namespace: 'default',
  getUserName: jest.fn(),
  createAPIKey: jest.fn(),
  cloneAPIKey: jest.fn(),
  logger: loggingSystemMock.create().get(),
  internalSavedObjectsRepository,
  encryptedSavedObjectsClient: encryptedSavedObjects,
  getActionsClient: jest.fn(),
  getEventLogClient: jest.fn(),
  kibanaVersion: 'v8.0.0',
  auditLogger,
  maxScheduledPerMinute: 10000,
  minimumScheduleInterval: { value: '1m', enforce: false },
  isAuthenticationTypeAPIKey: jest.fn(),
  getAuthenticationAPIKey: jest.fn(),
  getAlertIndicesAlias: jest.fn(),
  alertsService: null,
  backfillClient: backfillClientMock.create(),
  connectorAdapterRegistry: new ConnectorAdapterRegistry(),
  isSystemAction: jest.fn(),
  uiSettings: uiSettingsServiceMock.createStartContract(),
  featureFlags: coreFeatureFlagsMock.createStart(),
  isServerless: false,
};

setGlobalDate();

const baseRule = (overrides: Record<string, unknown> = {}) => ({
  enabled: false,
  name: 'r',
  tags: [],
  alertTypeId: '123',
  consumer: 'siem',
  schedule: { interval: '1m' },
  throttle: null,
  notifyWhen: null,
  params: { foo: true },
  actions: [],
  ...overrides,
});

const buildBulkResponse = (
  rules: Array<{ id: string; error?: { message: string; statusCode: number } }>
) => ({
  saved_objects: rules.map((r) => ({
    id: r.id,
    type: RULE_SAVED_OBJECT_TYPE,
    references: [],
    ...(r.error
      ? { error: { ...r.error, error: 'Conflict' } }
      : {
          attributes: {
            alertTypeId: '123',
            name: `name-${r.id}`,
            enabled: false,
            consumer: 'siem',
            schedule: { interval: '1m' },
            params: { foo: true },
            actions: [],
            createdBy: 'elastic',
            updatedBy: 'elastic',
            createdAt: '2019-02-12T21:01:22.479Z',
            updatedAt: '2019-02-12T21:01:22.479Z',
            snoozeSchedule: [],
            muteAll: false,
            mutedInstanceIds: [],
            executionStatus: { status: 'pending', lastExecutionDate: '2019-02-12T21:01:22.479Z' },
            revision: 0,
            running: false,
            apiKey: null,
            apiKeyOwner: null,
            apiKeyCreatedByUser: null,
          },
        }),
  })) as never,
});

describe('bulkCreateRules', () => {
  let rulesClient: RulesClient;
  let actionsClient: jest.Mocked<ActionsClient>;
  let idCounter = 0;

  beforeEach(async () => {
    getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
    (auditLogger.log as jest.Mock).mockClear();
    (bulkMarkApiKeysForInvalidation as jest.Mock).mockReset();
    (validateScheduleLimit as jest.Mock).mockReset();
    idCounter = 0;
    (SavedObjectsUtils.generateId as jest.Mock).mockImplementation(() => `mock-id-${++idCounter}`);
    rulesClient = new RulesClient(rulesClientParams);
    actionsClient = (await rulesClientParams.getActionsClient()) as jest.Mocked<ActionsClient>;
    actionsClient.getBulk.mockResolvedValue([
      createMockConnector({ id: '1', actionTypeId: 'test', name: 'a' }),
    ]);
    actionsClient.listTypes.mockResolvedValue([]);
    actionsClient.isSystemAction.mockReturnValue(false);
    rulesClientParams.getActionsClient.mockResolvedValue(actionsClient);
    rulesClientParams.createAPIKey.mockResolvedValue({
      apiKeysEnabled: true,
      result: { id: 'key-id', name: 'key', api_key: 'key-value' } as never,
    });
    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValue(false);
    taskManager.bulkSchedule.mockImplementation(async (tasks) => tasks as never);
  });

  describe('happy paths', () => {
    test('returns empty result for empty input without touching SO/TM/key clients', async () => {
      const result = await rulesClient.bulkCreateRules({ rules: [] });
      expect(result).toEqual({ successfulIds: [], errors: [], total: 0 });
      expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
      expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
      expect(rulesClientParams.createAPIKey).not.toHaveBeenCalled();
    });

    test('all-disabled: single bulkCreate, no TM, no API keys', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([{ id: 'mock-id-1' }, { id: 'mock-id-2' }])
      );

      const result = await rulesClient.bulkCreateRules({
        rules: [{ data: baseRule({ name: 'a' }) }, { data: baseRule({ name: 'b' }) }],
      });

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
      expect(taskManager.bulkEnable).not.toHaveBeenCalled();
      expect(rulesClientParams.createAPIKey).not.toHaveBeenCalled();
      expect(result.errors).toEqual([]);
      expect(result.total).toBe(2);
      expect(result.successfulIds).toEqual(['mock-id-1', 'mock-id-2']);
    });

    test('all-enabled: API keys, bulkSchedule with enabled=true (no runAt/scheduledAt), bulkCreate, no bulkEnable', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([{ id: 'mock-id-1' }, { id: 'mock-id-2' }])
      );

      const result = await rulesClient.bulkCreateRules({
        rules: [
          { data: baseRule({ name: 'a', enabled: true }) },
          { data: baseRule({ name: 'b', enabled: true }) },
        ],
      });

      expect(rulesClientParams.createAPIKey).toHaveBeenCalledTimes(2);
      expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
      const scheduled = taskManager.bulkSchedule.mock.calls[0][0] as Array<{
        id: string;
        enabled: boolean;
      }>;
      expect(scheduled.map((t) => t.id)).toEqual(['mock-id-1', 'mock-id-2']);
      expect(scheduled.every((t) => t.enabled === true)).toBe(true);
      for (const task of scheduled) {
        expect(task).not.toHaveProperty('runAt');
        expect(task).not.toHaveProperty('scheduledAt');
      }
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkEnable).not.toHaveBeenCalled();
      expect(result.errors).toEqual([]);
      expect(result.total).toBe(2);
      expect(result.successfulIds).toEqual(['mock-id-1', 'mock-id-2']);
    });

    test('mixed enabled+disabled', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([{ id: 'mock-id-1' }, { id: 'mock-id-2' }])
      );

      const result = await rulesClient.bulkCreateRules({
        rules: [
          { data: baseRule({ name: 'a', enabled: true }) },
          { data: baseRule({ name: 'b' }) },
        ],
      });

      expect(rulesClientParams.createAPIKey).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkSchedule.mock.calls[0][0]).toHaveLength(1);
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkEnable).not.toHaveBeenCalled();
      expect(result.errors).toEqual([]);
      expect(result.total).toBe(2);
      expect(result.successfulIds).toEqual(['mock-id-1', 'mock-id-2']);
    });
  });

  describe('input validation and batching', () => {
    test(`rejects with 400 when rules.length exceeds MAX_RULES_NUMBER_FOR_BULK_OPERATION (${MAX_RULES_NUMBER_FOR_BULK_OPERATION})`, async () => {
      const over = MAX_RULES_NUMBER_FOR_BULK_OPERATION + 1;
      await expect(
        rulesClient.bulkCreateRules({
          rules: Array.from({ length: over }, (_, i) => ({ data: baseRule({ name: `r-${i}` }) })),
        })
      ).rejects.toThrow(
        `${over} rules exceeds the hard limit of ${MAX_RULES_NUMBER_FOR_BULK_OPERATION}`
      );
      expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
      expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
    });

    test('throws 400 when batchSize exceeds MAX_BULK_CREATE_BATCH_SIZE', async () => {
      await expect(
        rulesClient.bulkCreateRules({
          rules: [{ data: baseRule({ name: 'a' }) }],
          batchSize: MAX_BULK_CREATE_BATCH_SIZE + 1,
        })
      ).rejects.toThrow(`batchSize ${MAX_BULK_CREATE_BATCH_SIZE + 1} exceeds the maximum`);
      expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
    });

    test('throws 400 when batchSize is below MIN_BULK_CREATE_BATCH_SIZE', async () => {
      await expect(
        rulesClient.bulkCreateRules({
          rules: [{ data: baseRule({ name: 'a' }) }],
          batchSize: MIN_BULK_CREATE_BATCH_SIZE - 1,
        })
      ).rejects.toThrow(`is below the minimum of ${MIN_BULK_CREATE_BATCH_SIZE}`);
      expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
    });

    test('splits rules across batches and concatenates results', async () => {
      const ruleCount = DEFAULT_BULK_CREATE_BATCH_SIZE * 2 + 1; // forces 3 batches with default batch size
      unsecuredSavedObjectsClient.bulkCreate.mockImplementation(async (objects) =>
        buildBulkResponse((objects as Array<{ id: string }>).map((o) => ({ id: o.id })))
      );

      const result = await rulesClient.bulkCreateRules({
        rules: Array.from({ length: ruleCount }, (_, i) => ({
          data: baseRule({ name: `r-${i}` }),
        })),
      });

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(3);
      expect(result.total).toBe(ruleCount);
      expect(result.successfulIds).toHaveLength(ruleCount);
      expect(result.errors).toEqual([]);
    });

    test('honours caller-supplied batchSize', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockImplementation(async (objects) =>
        buildBulkResponse((objects as Array<{ id: string }>).map((o) => ({ id: o.id })))
      );

      await rulesClient.bulkCreateRules({
        rules: Array.from({ length: 25 }, (_, i) => ({ data: baseRule({ name: `r-${i}` }) })),
        batchSize: 10,
      });

      // 25 rules, batchSize 10 → 3 batches (10, 10, 5)
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(3);
      expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0]).toHaveLength(10);
      expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[1][0]).toHaveLength(10);
      expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[2][0]).toHaveLength(5);
    });

    test('caller-supplied id passed through', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([{ id: 'my-custom-id' }])
      );

      const result = await rulesClient.bulkCreateRules({
        rules: [{ data: baseRule({ name: 'custom' }), options: { id: 'my-custom-id' } }],
      });

      expect(result.successfulIds).toEqual(['my-custom-id']);
    });
  });

  describe('preValidate (Phase A)', () => {
    describe('per-rule validation (A1)', () => {
      test('per-rule isolation: one registry-throw, two valid → one error, two survive to runBatch', async () => {
        let calls = 0;
        ruleTypeRegistry.get.mockImplementation((typeId: string) => {
          calls += 1;
          if (calls === 1) throw new Error('unregistered type');
          return {
            id: typeId,
            name: 'Test',
            actionGroups: [{ id: 'default', name: 'Default' }],
            recoveryActionGroup: { id: 'recovered', name: 'Recovered' },
            defaultActionGroupId: 'default',
            minimumLicenseRequired: 'basic',
            isExportable: true,
            async executor() {
              return { state: {} };
            },
            category: 'test',
            producer: 'alerts',
            solution: 'stack',
            validate: { params: { validate: (p: unknown) => p } },
            validLegacyConsumers: [],
          } as never;
        });
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-2' }, { id: 'mock-id-3' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'invalid' }) },
            { data: baseRule({ name: 'ok-1' }) },
            { data: baseRule({ name: 'ok-2' }) },
          ],
        });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rule.name).toBe('invalid');
        expect(result.successfulIds).toEqual(['mock-id-2', 'mock-id-3']);
        expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0]).toHaveLength(2);
      });

      test('all inputs fail: zero calls to authorization, bulkSchedule, bulkCreate, createAPIKey', async () => {
        ruleTypeRegistry.get.mockImplementation(() => {
          throw new Error('unregistered');
        });

        const result = await rulesClient.bulkCreateRules({
          rules: [{ data: baseRule({ name: 'a' }) }, { data: baseRule({ name: 'b' }) }],
        });

        expect(result.errors).toHaveLength(2);
        expect(result.successfulIds).toEqual([]);
        expect(authorization.bulkEnsureAuthorized).not.toHaveBeenCalled();
        expect(rulesClientParams.createAPIKey).not.toHaveBeenCalled();
        expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
        expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
      });

      test('parseDuration throws on malformed interval: per-rule error, other rules unaffected', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-2' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'bad-interval', schedule: { interval: 'NOT_VALID' } }) },
            { data: baseRule({ name: 'ok' }) },
          ],
        });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rule.name).toBe('bad-interval');
        expect(result.successfulIds).toEqual(['mock-id-2']);
      });

      test('minimum-interval enforce=true: rule removed with 400 error', async () => {
        const enforceClient = new RulesClient({
          ...rulesClientParams,
          minimumScheduleInterval: { value: '1m', enforce: true },
        });
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-2' }])
        );

        const result = await enforceClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'too-fast', schedule: { interval: '30s' } }) },
            { data: baseRule({ name: 'ok' }) },
          ],
        });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rule.name).toBe('too-fast');
        expect(result.errors[0].message).toContain('less than the allowed minimum interval');
        expect(result.successfulIds).toEqual(['mock-id-2']);
      });

      test('minimum-interval enforce=false: logger.warn called, rule retained and forwarded to runBatch', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-1' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [{ data: baseRule({ name: 'fast', schedule: { interval: '30s' } }) }],
        });

        const warnCalls = (rulesClientParams.logger.warn as jest.Mock).mock.calls
          .map((c) => c[0])
          .filter((m: string) => m?.includes?.('less than the minimum value'));
        expect(warnCalls).toHaveLength(1);
        expect(result.errors).toEqual([]);
        expect(result.successfulIds).toEqual(['mock-id-1']);
        expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
      });
    });

    describe('authorization (A2)', () => {
      test('bulk authz: deduped pairs sent in a single call', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([
            { id: 'mock-id-1' },
            { id: 'mock-id-2' },
            { id: 'mock-id-3' },
            { id: 'mock-id-4' },
          ])
        );

        await rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'a', alertTypeId: '123', consumer: 'siem' }) },
            { data: baseRule({ name: 'b', alertTypeId: '123', consumer: 'siem' }) },
            { data: baseRule({ name: 'c', alertTypeId: '123', consumer: 'other' }) },
            { data: baseRule({ name: 'd', alertTypeId: '456', consumer: 'siem' }) },
          ],
        });

        expect(authorization.bulkEnsureAuthorized).toHaveBeenCalledTimes(1);
        const callArg = (authorization.bulkEnsureAuthorized as jest.Mock).mock.calls[0][0];
        expect(callArg.ruleTypeIdConsumersPairs).toEqual([
          { ruleTypeId: '123', consumers: ['siem', 'other'] },
          { ruleTypeId: '456', consumers: ['siem'] },
        ]);
      });

      test('bulk authz rejection: throws, single audit event, zero writes', async () => {
        (authorization.bulkEnsureAuthorized as jest.Mock).mockRejectedValueOnce(
          new Error('not authorized')
        );

        await expect(
          rulesClient.bulkCreateRules({
            rules: [
              { data: baseRule({ name: 'a', alertTypeId: '123', consumer: 'siem' }) },
              { data: baseRule({ name: 'b', alertTypeId: '123', consumer: 'other' }) },
            ],
          })
        ).rejects.toThrow('not authorized');

        expect(authorization.bulkEnsureAuthorized).toHaveBeenCalledTimes(1);
        expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
        expect(taskManager.bulkSchedule).not.toHaveBeenCalled();

        const failAudits = (auditLogger.log as jest.Mock).mock.calls
          .map(([event]) => event)
          .filter(
            (e: { event?: { action: string; outcome?: string } }) =>
              e?.event?.action === RuleAuditAction.BULK_CREATE && e?.event?.outcome === 'failure'
          );
        expect(failAudits).toHaveLength(1);
        expect(failAudits[0].kibana?.saved_object).toBeUndefined();
      });
    });

    describe('schedule limit (A3)', () => {
      test('schedule-limit overflow: throws 400, zero ES writes', async () => {
        (validateScheduleLimit as jest.Mock).mockResolvedValue({
          interval: 100,
          intervalAvailable: 50,
        });

        await expect(
          rulesClient.bulkCreateRules({
            rules: [
              { data: baseRule({ name: 'enabled', enabled: true }) },
              { data: baseRule({ name: 'disabled' }) },
            ],
          })
        ).rejects.toThrow(/circuit breaker/i);

        expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
        expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
      });

      test('validateScheduleLimit called once for all enabled rules (not per batch)', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockImplementation(async (objects) =>
          buildBulkResponse((objects as Array<{ id: string }>).map((o) => ({ id: o.id })))
        );

        await rulesClient.bulkCreateRules({
          rules: Array.from({ length: 20 }, (_, i) => ({
            data: baseRule({ name: `r-${i}`, enabled: true }),
          })),
          batchSize: 10,
        });

        expect(validateScheduleLimit).toHaveBeenCalledTimes(1);
        const callArg = (validateScheduleLimit as jest.Mock).mock.calls[0][0];
        expect(callArg.updatedInterval).toHaveLength(20);
      });
    });
  });

  describe('runBatch (Phase B)', () => {
    describe('prepareRule (B1)', () => {
      test('per-rule throw is isolated', async () => {
        let calls = 0;
        ruleTypeRegistry.get.mockImplementation((typeId: string) => {
          calls += 1;
          if (calls === 1) throw new Error('rule type not found');
          return {
            id: typeId,
            name: 'Test',
            actionGroups: [{ id: 'default', name: 'Default' }],
            recoveryActionGroup: { id: 'recovered', name: 'Recovered' },
            defaultActionGroupId: 'default',
            minimumLicenseRequired: 'basic',
            isExportable: true,
            async executor() {
              return { state: {} };
            },
            category: 'test',
            producer: 'alerts',
            solution: 'stack',
            validate: { params: { validate: (p: unknown) => p } },
            validLegacyConsumers: [],
          } as never;
        });
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-2' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [{ data: baseRule({ name: 'fails' }) }, { data: baseRule({ name: 'ok' }) }],
        });

        expect(result.total).toBe(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rule.name).toBe('fails');
        expect(result.successfulIds).toEqual(['mock-id-2']);
        expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0]).toHaveLength(1);
      });

      test('API key creation failure: enabled rule excluded from batch, surviving rule still persisted', async () => {
        rulesClientParams.createAPIKey.mockRejectedValueOnce(new Error('keys disabled'));
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-2' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'enabled-keyfail', enabled: true }) },
            { data: baseRule({ name: 'enabled-ok', enabled: true }) },
          ],
        });

        expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
        expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0]).toHaveLength(1);
        const persistedNames = (
          unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0] as Array<{
            attributes: { name: string };
          }>
        ).map((o) => o.attributes.name);
        expect(persistedNames).toEqual(['enabled-ok']);
        expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
        expect(taskManager.bulkSchedule.mock.calls[0][0]).toHaveLength(1);
        expect(taskManager.bulkEnable).not.toHaveBeenCalled();
        expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
        expect(result.successfulIds).toEqual(['mock-id-2']);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rule.name).toBe('enabled-keyfail');
        expect(result.errors[0].message).toContain('keys disabled');
      });

      test('prepareRule failure after API key creation invalidates the orphaned key', async () => {
        let getCalls = 0;
        ruleTypeRegistry.get.mockImplementation((typeId: string) => {
          getCalls += 1;
          // getCalls 1,2 = preValidate (both pass); getCalls 3 = prepareRule for first rule (throws)
          const throwOnExtract = getCalls === 3;
          return {
            id: typeId,
            name: 'Test',
            actionGroups: [{ id: 'default', name: 'Default' }],
            recoveryActionGroup: { id: 'recovered', name: 'Recovered' },
            defaultActionGroupId: 'default',
            minimumLicenseRequired: 'basic',
            isExportable: true,
            async executor() {
              return { state: {} };
            },
            category: 'test',
            producer: 'alerts',
            solution: 'stack',
            validate: { params: { validate: (p: unknown) => p } },
            validLegacyConsumers: [],
            ...(throwOnExtract
              ? {
                  useSavedObjectReferences: {
                    extractReferences: () => {
                      throw new Error('extractReferences boom');
                    },
                    injectReferences: () => {},
                  },
                }
              : {}),
          } as never;
        });
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-2' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'key-then-fail', enabled: true }) },
            { data: baseRule({ name: 'ok', enabled: true }) },
          ],
        });

        expect(rulesClientParams.createAPIKey).toHaveBeenCalledTimes(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rule.name).toBe('key-then-fail');
        expect(result.errors[0].message).toContain('extractReferences boom');
        expect(result.successfulIds).toEqual(['mock-id-2']);
        expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
        expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
          { apiKeys: expect.arrayContaining([expect.any(String)]) },
          expect.anything(),
          expect.anything()
        );
      });

      test('validateActions failure: rule with invalid actions excluded, other rules persist', async () => {
        actionsClient.getBulk.mockRejectedValueOnce(new Error('connector lookup failed'));
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-2' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [
            {
              data: baseRule({
                name: 'bad-actions',
                actions: [{ group: 'default', id: '1', params: {} }],
              }),
            },
            { data: baseRule({ name: 'ok' }) },
          ],
        });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rule.name).toBe('bad-actions');
        expect(result.errors[0].message).toContain('connector lookup failed');
        expect(result.successfulIds).toEqual(['mock-id-2']);
      });

      test('uiamApiKey flows through to SO attributes when createAPIKey returns uiamResult', async () => {
        rulesClientParams.createAPIKey.mockResolvedValueOnce({
          apiKeysEnabled: true,
          result: { id: 'key-id', name: 'key', api_key: 'key-value' },
          uiamResult: { id: 'uiam-id', name: 'uiam-key', api_key: 'uiam-value' },
        } as never);
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-1' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [{ data: baseRule({ name: 'with-uiam', enabled: true }) }],
        });

        expect(result.successfulIds).toEqual(['mock-id-1']);
        const soAttrs = (
          unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0] as Array<{
            attributes: { uiamApiKey?: string; apiKey?: string };
          }>
        )[0].attributes;
        expect(soAttrs.apiKey).toBe(Buffer.from('key-id:key-value').toString('base64'));
        expect(soAttrs.uiamApiKey).toBe(Buffer.from('uiam-id:uiam-value').toString('base64'));
      });
    });

    describe('task scheduling (B2)', () => {
      test('whole TM throw: enabled subset excluded from batch, disabled subset still persisted', async () => {
        taskManager.bulkSchedule.mockRejectedValueOnce(new Error('cluster unavailable'));
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-2' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'enabled', enabled: true }) },
            { data: baseRule({ name: 'disabled' }) },
          ],
        });

        expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalled();
        expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
        expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0]).toHaveLength(1);
        const persistedNames = (
          unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0] as Array<{
            attributes: { name: string };
          }>
        ).map((o) => o.attributes.name);
        expect(persistedNames).toEqual(['disabled']);
        expect(result.successfulIds).toEqual(['mock-id-2']);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rule.name).toBe('enabled');
        expect(result.errors[0].message).toContain('cluster unavailable');
      });

      test('silent per-task drop: dropped rule excluded from batch, kept rule still persisted', async () => {
        taskManager.bulkSchedule.mockImplementationOnce(async (tasks) => {
          return [tasks[0]] as never;
        });
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-1' }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'kept', enabled: true }) },
            { data: baseRule({ name: 'dropped', enabled: true }) },
          ],
        });

        expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0]).toHaveLength(1);
        const persistedNames = (
          unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0] as Array<{
            attributes: { name: string };
          }>
        ).map((o) => o.attributes.name);
        expect(persistedNames).toEqual(['kept']);
        expect(result.successfulIds).toEqual(['mock-id-1']);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rule.name).toBe('dropped');
      });

      test('task instances do not contain runAt or scheduledAt', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockImplementation(async (objects) =>
          buildBulkResponse((objects as Array<{ id: string }>).map((o) => ({ id: o.id })))
        );

        await rulesClient.bulkCreateRules({
          rules: Array.from({ length: 20 }, (_, i) => ({
            data: baseRule({ name: `r-${i}`, enabled: true }),
          })),
          batchSize: 10,
        });

        expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(2);
        for (const call of taskManager.bulkSchedule.mock.calls) {
          for (const t of call[0] as unknown as Array<Record<string, unknown>>) {
            expect(t).not.toHaveProperty('runAt');
            expect(t).not.toHaveProperty('scheduledAt');
          }
        }
      });
    });

    describe('SO persistence (B3)', () => {
      test('per-row error on scheduled id: per-rule key invalidated, bulkRemove called', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-1', error: { message: 'conflict', statusCode: 409 } }])
        );

        const result = await rulesClient.bulkCreateRules({
          rules: [{ data: baseRule({ name: 'enabled', enabled: true }) }],
        });

        expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
        expect(taskManager.bulkRemove).toHaveBeenCalledWith(['mock-id-1']);
        expect(taskManager.removeIfExists).not.toHaveBeenCalled();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].status).toBe(409);
        expect(result.successfulIds).toEqual([]);
      });

      test('per-row error on caller-supplied id NOT in newlyScheduledTaskIds: NO TM cleanup', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'caller-id', error: { message: 'conflict', statusCode: 409 } }])
        );

        await rulesClient.bulkCreateRules({
          rules: [{ data: baseRule({ name: 'disabled-collision' }), options: { id: 'caller-id' } }],
        });

        expect(taskManager.removeIfExists).not.toHaveBeenCalled();
        expect(taskManager.bulkRemove).not.toHaveBeenCalled();
      });

      test('whole-call throw: invalidates keys, bulkRemoves scheduled ids, emits one error per prepared rule (does NOT rethrow)', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockRejectedValueOnce(new Error('SO down'));

        const result = await rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'a', enabled: true }) },
            { data: baseRule({ name: 'b', enabled: true }) },
          ],
        });

        expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
        expect(taskManager.bulkRemove).toHaveBeenCalledWith(['mock-id-1', 'mock-id-2']);
        expect(result.successfulIds).toEqual([]);
        expect(result.errors).toHaveLength(2);
        expect(result.errors.map((e) => e.rule)).toEqual([
          { id: 'mock-id-1', name: 'a' },
          { id: 'mock-id-2', name: 'b' },
        ]);
        expect(result.errors.every((e) => e.message.includes('SO down'))).toBe(true);
      });

      test('TM cleanup failure: logs error when bulkRemove throws after SO bulkCreate failure, does not rethrow', async () => {
        taskManager.bulkRemove.mockRejectedValueOnce(new Error('TM cleanup error'));
        unsecuredSavedObjectsClient.bulkCreate.mockRejectedValueOnce(new Error('SO down'));

        const result = await rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'a', enabled: true }) },
            { data: baseRule({ name: 'b', enabled: true }) },
          ],
        });

        expect(taskManager.bulkRemove).toHaveBeenCalled();
        expect((rulesClientParams.logger.error as jest.Mock).mock.calls).toEqual(
          expect.arrayContaining([
            expect.arrayContaining([expect.stringContaining('TM cleanup error')]),
          ])
        );
        expect(result.successfulIds).toEqual([]);
        expect(result.errors).toHaveLength(2);
        expect(result.errors.every((e) => e.message.includes('SO down'))).toBe(true);
      });

      test('bulkMarkApiKeysForInvalidation failure: error propagates when key invalidation rejects', async () => {
        (bulkMarkApiKeysForInvalidation as jest.Mock).mockRejectedValueOnce(
          new Error('invalidation write failed')
        );
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
          buildBulkResponse([{ id: 'mock-id-1', error: { message: 'conflict', statusCode: 409 } }])
        );

        await expect(
          rulesClient.bulkCreateRules({
            rules: [{ data: baseRule({ name: 'enabled', enabled: true }) }],
          })
        ).rejects.toThrow('invalidation write failed');
      });
    });
  });

  describe('audit events', () => {
    test('emits per-rule CREATE audit event for surviving rules (no ENABLE event)', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([{ id: 'mock-id-1' }, { id: 'mock-id-2' }])
      );

      await rulesClient.bulkCreateRules({
        rules: [
          { data: baseRule({ name: 'enabled', enabled: true }) },
          { data: baseRule({ name: 'disabled' }) },
        ],
      });

      const actions = (auditLogger.log as jest.Mock).mock.calls
        .map(([event]) => event?.event?.action)
        .filter(Boolean);
      expect(actions.filter((a) => a === RuleAuditAction.BULK_CREATE)).toHaveLength(2);
      expect(actions.filter((a) => a === RuleAuditAction.ENABLE)).toHaveLength(0);
    });
  });

  describe('exitEarlyOnError', () => {
    test('preValidate error → returns immediately, zero ES writes', async () => {
      ruleTypeRegistry.get.mockImplementationOnce(() => {
        throw new Error('unregistered');
      });

      const result = await rulesClient.bulkCreateRules({
        rules: [{ data: baseRule({ name: 'bad' }) }, { data: baseRule({ name: 'good' }) }],
        exitEarlyOnError: true,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule.name).toBe('bad');
      expect(result.successfulIds).toEqual([]);
      expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
      expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
    });

    test('Phase A3 schedule-limit overflow: throws before any ES writes', async () => {
      (validateScheduleLimit as jest.Mock).mockResolvedValueOnce({
        interval: 100,
        intervalAvailable: 50,
      });

      await expect(
        rulesClient.bulkCreateRules({
          rules: [
            { data: baseRule({ name: 'a', enabled: true }) },
            { data: baseRule({ name: 'b' }) },
          ],
          exitEarlyOnError: true,
        })
      ).rejects.toThrow(/circuit breaker/i);

      expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
      expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
    });

    test('Phase B1 api-key-mint failure: aborts batch (no SO write, key cleanup runs)', async () => {
      rulesClientParams.createAPIKey.mockRejectedValueOnce(new Error('keys disabled'));

      const result = await rulesClient.bulkCreateRules({
        rules: [
          { data: baseRule({ name: 'a', enabled: true }) },
          { data: baseRule({ name: 'b' }) },
          { data: baseRule({ name: 'c' }) },
        ],
        exitEarlyOnError: true,
      });

      expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
      expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
      expect(result.successfulIds).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule.name).toBe('a');
      expect(result.errors[0].message).toContain('keys disabled');
    });

    test('Phase B2 whole-call TM throw: aborts batch (no SO write, key invalidation runs, no further batches)', async () => {
      taskManager.bulkSchedule.mockRejectedValueOnce(new Error('cluster unavailable'));

      const result = await rulesClient.bulkCreateRules({
        rules: [
          { data: baseRule({ name: 'a', enabled: true }) },
          { data: baseRule({ name: 'b' }) },
        ],
        exitEarlyOnError: true,
      });

      expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
      expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalled();
      expect(result.successfulIds).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule.name).toBe('a');
      expect(result.errors[0].message).toContain('cluster unavailable');
    });

    test('Phase B2 silent per-task drop: aborts batch and removes the partially scheduled tasks', async () => {
      taskManager.bulkSchedule.mockImplementationOnce(async (tasks) => [tasks[0]] as never);

      const result = await rulesClient.bulkCreateRules({
        rules: Array.from({ length: 10 }, (_, i) => ({
          data: baseRule({
            name: i === 0 ? 'kept' : i === 1 ? 'dropped' : `filler-${i}`,
            enabled: i < 2,
          }),
        })),
        exitEarlyOnError: true,
      });

      // Batch 1 schedules `kept` but loses `dropped` → strict aborts and cleans up the
      // task that did schedule. Batch 2 is skipped.
      expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
      expect(taskManager.bulkRemove).toHaveBeenCalledWith(['mock-id-1']);
      expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalled();
      expect(result.successfulIds).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule.name).toBe('dropped');
    });

    test('default (false): keeps processing subsequent batches even after an SO per-row error', async () => {
      const batch1Ids: Parameters<typeof buildBulkResponse>[0] = Array.from(
        { length: 10 },
        (_, i) => ({ id: `b1-${i}` })
      );
      batch1Ids[0] = { id: 'b1-0', error: { message: 'conflict', statusCode: 409 } };
      const batch2Ids = Array.from({ length: 10 }, (_, i) => ({ id: `b2-${i}` }));
      unsecuredSavedObjectsClient.bulkCreate
        .mockResolvedValueOnce(buildBulkResponse(batch1Ids))
        .mockResolvedValueOnce(buildBulkResponse(batch2Ids));

      const result = await rulesClient.bulkCreateRules({
        rules: Array.from({ length: 20 }, (_, i) => ({ data: baseRule({ name: `r-${i}` }) })),
        batchSize: 10,
      });

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(2);
      expect(result.successfulIds).toContain('b1-1');
      expect(result.successfulIds).toContain('b2-0');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule.id).toBe('b1-0');
    });

    test('true: stops at the first SO per-row failure, returns prior successes', async () => {
      const batch1Ids = Array.from({ length: 10 }, (_, i) => ({ id: `b1-${i}` }));
      const batch2Ids: Parameters<typeof buildBulkResponse>[0] = Array.from(
        { length: 10 },
        (_, i) => ({ id: `b2-${i}` })
      );
      batch2Ids[0] = { id: 'b2-0', error: { message: 'conflict', statusCode: 409 } };
      unsecuredSavedObjectsClient.bulkCreate
        .mockResolvedValueOnce(buildBulkResponse(batch1Ids))
        .mockResolvedValueOnce(buildBulkResponse(batch2Ids));

      const result = await rulesClient.bulkCreateRules({
        rules: Array.from({ length: 30 }, (_, i) => ({ data: baseRule({ name: `r-${i}` }) })),
        batchSize: 10,
        exitEarlyOnError: true,
      });

      // Only batches 1 and 2 should have executed; batch 3 is skipped.
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(2);
      expect(result.successfulIds).toContain('b1-0');
      expect(result.successfulIds).toContain('b2-1');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule.id).toBe('b2-0');
    });

    test('true: stops on whole-call SO throw and emits one error per failed-batch rule', async () => {
      const batch1Ids = Array.from({ length: 10 }, (_, i) => ({ id: `b1-${i}` }));
      unsecuredSavedObjectsClient.bulkCreate
        .mockResolvedValueOnce(buildBulkResponse(batch1Ids))
        .mockRejectedValueOnce(new Error('SO down'));

      const result = await rulesClient.bulkCreateRules({
        rules: Array.from({ length: 20 }, (_, i) => ({ data: baseRule({ name: `r-${i}` }) })),
        batchSize: 10,
        exitEarlyOnError: true,
      });

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(2);
      expect(result.successfulIds).toEqual(batch1Ids.map((b) => b.id));
      const soDownErrors = result.errors.filter((e) => e.message.includes('SO down'));
      expect(soDownErrors).toHaveLength(10);
    });
  });

  describe('change tracking', () => {
    const createChangeTrackingService = () => ({
      log: jest.fn().mockResolvedValue(undefined),
      logBulk: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    });

    const setRuleType = (overrides: { trackChanges?: boolean } = {}) => {
      ruleTypeRegistry.get.mockReturnValue({
        id: '123',
        name: 'Test',
        actionGroups: [{ id: 'default', name: 'Default' }],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        recoveryActionGroup: { id: 'recovered', name: 'Recovered' },
        executor: jest.fn(),
        category: 'test',
        validate: { params: { validate: (params: unknown) => params } },
        solution: 'security',
        validLegacyConsumers: [],
        trackChanges: true,
        ...overrides,
      } as never);
    };

    test('logs every successfully created rule in a single bulk call with the requested action', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([{ id: 'mock-id-1' }, { id: 'mock-id-2' }])
      );

      await trackingClient.bulkCreateRules({
        rules: [{ data: baseRule({ name: 'a' }) }, { data: baseRule({ name: 'b' }) }],
        changeTracking: { action: 'rule_install', metadata: { bulkCount: 2 } },
      });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({ objectId: 'mock-id-1' }),
          expect.objectContaining({ objectId: 'mock-id-2' }),
        ],
        expect.objectContaining({
          action: 'rule_install',
          data: { metadata: { bulkCount: 2 } },
        })
      );
    });

    test('defaults to ruleCreate when no action is provided', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([{ id: 'mock-id-1' }])
      );

      await trackingClient.bulkCreateRules({
        rules: [{ data: baseRule({ name: 'a' }) }],
      });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ action: 'rule_create' })
      );
    });

    test('only logs successfully persisted SOs when bulk create has partial failures', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([
          { id: 'mock-id-1' },
          { id: 'mock-id-2', error: { message: 'conflict', statusCode: 409 } },
          { id: 'mock-id-3' },
        ])
      );

      await trackingClient.bulkCreateRules({
        rules: [
          { data: baseRule({ name: 'a' }) },
          { data: baseRule({ name: 'b' }) },
          { data: baseRule({ name: 'c' }) },
        ],
      });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({ objectId: 'mock-id-1' }),
          expect.objectContaining({ objectId: 'mock-id-3' }),
        ],
        expect.any(Object)
      );
    });

    test('does not call logBulk when the rule type opts out of tracking', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType({ trackChanges: false });

      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([{ id: 'mock-id-1' }])
      );

      await trackingClient.bulkCreateRules({
        rules: [{ data: baseRule({ name: 'a' }) }],
      });

      expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    });

    test('does not throw when no change tracking service is configured', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue(
        buildBulkResponse([{ id: 'mock-id-1' }])
      );

      await rulesClient.bulkCreateRules({
        rules: [{ data: baseRule({ name: 'a' }) }],
      });

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalled();
    });
  });
});
