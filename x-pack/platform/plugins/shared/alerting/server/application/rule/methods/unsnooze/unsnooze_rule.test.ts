/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConstructorOptions, RulesClientContext } from '../../../../rules_client';
import { RulesClient } from '../../../../rules_client/rules_client';
import { unsnoozeRule } from './unsnooze_rule';
import {
  savedObjectsClientMock,
  savedObjectsRepositoryMock,
  loggingSystemMock,
  uiSettingsServiceMock,
  coreFeatureFlagsMock,
} from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { ruleTypeRegistryMock } from '../../../../rule_type_registry.mock';
import { alertingAuthorizationMock } from '../../../../authorization/alerting_authorization.mock';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import type { AlertingAuthorization } from '../../../../authorization/alerting_authorization';
import type { ActionsAuthorization } from '@kbn/actions-plugin/server';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';
import { RecoveredActionGroup } from '../../../../../common';
import type { IScopedChangeTrackingService } from '../../../../rules_client/lib/change_tracking';

const loggerErrorMock = jest.fn();
const getBulkMock = jest.fn();

const savedObjectsMock = savedObjectsRepositoryMock.create();
savedObjectsMock.get = jest.fn().mockReturnValue({
  attributes: {
    actions: [],
    snoozeSchedule: [
      {
        duration: 600000,
        rRule: {
          interval: 1,
          freq: 3,
          dtstart: '2025-03-01T06:30:37.011Z',
          tzid: 'UTC',
        },
        id: 'snooze_schedule_1',
      },
    ],
  },
  version: '9.0.0',
});

const context = {
  logger: { error: loggerErrorMock, debug: jest.fn() },
  getActionsClient: () => {
    return {
      getBulk: getBulkMock,
    };
  },
  unsecuredSavedObjectsClient: savedObjectsMock,
  authorization: { ensureAuthorized: async () => {} },
  ruleTypeRegistry: {
    ensureRuleTypeEnabled: () => {},
    get: () => ({ solution: 'stack', trackChanges: false }),
  },
  getUserName: async () => {},
} as unknown as RulesClientContext;

describe('validate unsnooze params', () => {
  beforeEach(() => {
    savedObjectsMock.update = jest.fn().mockResolvedValue({
      id: '123',
      type: 'alert',
      attributes: { snoozeSchedule: [] },
      references: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should validate params correctly', async () => {
    await expect(
      unsnoozeRule(context, { id: '123', scheduleIds: ['snooze_schedule_1'] })
    ).resolves.toBeUndefined();
  });

  it('should validate params with empty schedule ids correctly', async () => {
    await expect(unsnoozeRule(context, { id: '123', scheduleIds: [] })).resolves.toBeUndefined();
  });

  it('should throw bad request for invalid params', async () => {
    // @ts-expect-error: testing invalid params
    await expect(unsnoozeRule(context, {})).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Error validating unsnooze params - [id]: expected value of type [string] but got [undefined]"`
    );
  });
});

setGlobalDate();

describe('unsnoozeRule change tracking', () => {
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
    maxScheduledPerMinute: 10000,
    minimumScheduleInterval: { value: '1m', enforce: false },
    getUserName: jest.fn(),
    createAPIKey: jest.fn(),
    cloneAPIKey: jest.fn(),
    logger: loggingSystemMock.create().get(),
    internalSavedObjectsRepository,
    encryptedSavedObjectsClient: encryptedSavedObjects,
    getActionsClient: jest.fn(),
    getEventLogClient: jest.fn(),
    kibanaVersion: 'v9.0.0',
    auditLogger,
    isAuthenticationTypeAPIKey: jest.fn(),
    getAuthenticationAPIKey: jest.fn(),
    connectorAdapterRegistry: new ConnectorAdapterRegistry(),
    getAlertIndicesAlias: jest.fn(),
    alertsService: null,
    backfillClient: backfillClientMock.create(),
    uiSettings: uiSettingsServiceMock.createStartContract(),
    isSystemAction: jest.fn(),
    featureFlags: coreFeatureFlagsMock.createStart(),
    isServerless: false,
  };

  const existingRuleSO = {
    id: 'rule-1',
    type: RULE_SAVED_OBJECT_TYPE,
    attributes: {
      enabled: true,
      tags: [],
      name: 'rule one',
      alertTypeId: 'myType',
      consumer: 'myApp',
      schedule: { interval: '1m' },
      actions: [],
      params: {},
      throttle: null,
      notifyWhen: null,
      muteAll: false,
      mutedInstanceIds: [],
      snoozeSchedule: [
        {
          id: 'snooze-1',
          duration: 28800000,
          rRule: { dtstart: '2030-01-01T00:00:00.000Z', count: 1, tzid: 'UTC' },
        },
      ],
      revision: 0,
      apiKey: null,
      apiKeyOwner: null,
      createdBy: 'elastic',
      updatedBy: 'elastic',
      createdAt: '2019-02-12T21:01:22.479Z',
      updatedAt: '2019-02-12T21:01:22.479Z',
      legacyId: null,
      executionStatus: { lastExecutionDate: '2019-02-12T21:01:22.479Z', status: 'pending' },
    },
    references: [],
    version: '123',
  };

  const updatedRuleSO = {
    ...existingRuleSO,
    attributes: {
      ...existingRuleSO.attributes,
      snoozeSchedule: [],
    },
  };

  const setRuleType = (overrides: { trackChanges?: boolean } = {}) => {
    ruleTypeRegistry.get.mockReturnValue({
      id: 'myType',
      name: 'Test',
      actionGroups: [{ id: 'default', name: 'Default' }],
      defaultActionGroupId: 'default',
      minimumLicenseRequired: 'basic',
      isExportable: true,
      recoveryActionGroup: RecoveredActionGroup,
      async executor() {
        return { state: {} };
      },
      category: 'test',
      producer: 'alerts',
      solution: 'stack' as const,
      validate: { params: { validate: (params) => params } },
      validLegacyConsumers: [],
      trackChanges: true,
      ...overrides,
    });
  };

  const createChangeTrackingService = (): jest.Mocked<IScopedChangeTrackingService> => ({
    log: jest.fn().mockResolvedValue(undefined),
    logBulk: jest.fn().mockResolvedValue(undefined),
    getHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  });

  beforeEach(() => {
    getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
    unsecuredSavedObjectsClient.get.mockResolvedValue(existingRuleSO);
    unsecuredSavedObjectsClient.update.mockResolvedValue({
      id: 'rule-1',
      type: 'alert',
      attributes: { snoozeSchedule: updatedRuleSO.attributes.snoozeSchedule },
      references: [],
    });
    setRuleType();
  });

  test('logs the change with action "rule_unsnooze" after the saved object update succeeds', async () => {
    const changeTrackingService = createChangeTrackingService();
    const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });

    await trackingClient.unsnooze({ id: 'rule-1', scheduleIds: ['snooze-1'] });

    expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
    // Single-rule callers fall back to ruleSOs.length for bulkCount.
    expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
      [expect.objectContaining({ objectId: 'rule-1', module: 'stack' })],
      {
        action: 'rule_unsnooze',
        spaceId: 'default',
      }
    );
  });

  test('captures the full post-unsnooze attributes of the rule', async () => {
    const changeTrackingService = createChangeTrackingService();
    const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });

    await trackingClient.unsnooze({ id: 'rule-1', scheduleIds: ['snooze-1'] });

    expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          snapshot: expect.objectContaining({
            id: 'rule-1',
            name: 'rule one',
            alertTypeId: 'myType',
            consumer: 'myApp',
            createdAt: '2019-02-12T21:01:22.479Z',
            updatedAt: '2019-02-12T21:01:22.479Z',
          }),
        }),
      ],
      expect.any(Object)
    );
  });

  test('captures the context of the rule', async () => {
    const changeTrackingService = createChangeTrackingService();
    const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });

    await trackingClient.unsnooze({ id: 'rule-1', scheduleIds: ['snooze-1'] });

    expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          objectId: 'rule-1',
          objectType: RULE_SAVED_OBJECT_TYPE,
          module: 'stack',
        }),
      ],
      expect.any(Object)
    );
  });

  test('stamps the change with the time captured immediately before the SO update', async () => {
    const changeTrackingService = createChangeTrackingService();
    const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });

    const startTimeMs = Date.parse('2030-06-01T08:00:00.000Z');
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(startTimeMs);

    try {
      await trackingClient.unsnooze({ id: 'rule-1', scheduleIds: ['snooze-1'] });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      const [changes] = changeTrackingService.logBulk.mock.calls[0];
      expect(changes[0].timestamp).toBe('2030-06-01T08:00:00.000Z');
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  test('logs the change only after the OCC retry succeeds', async () => {
    const { SavedObjectsErrorHelpers } = jest.requireActual('@kbn/core/server');
    const changeTrackingService = createChangeTrackingService();
    const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });

    unsecuredSavedObjectsClient.update
      .mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createConflictError(RULE_SAVED_OBJECT_TYPE, 'rule-1')
      )
      .mockResolvedValueOnce(updatedRuleSO);

    await trackingClient.unsnooze({ id: 'rule-1', scheduleIds: ['snooze-1'] });

    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledTimes(2);
    expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
    expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
      [expect.objectContaining({ objectId: 'rule-1' })],
      expect.objectContaining({ action: 'rule_unsnooze' })
    );
  });

  test('does not log when the saved object update fails with a non-retryable error', async () => {
    const changeTrackingService = createChangeTrackingService();
    const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });

    unsecuredSavedObjectsClient.update.mockRejectedValueOnce(new Error('boom'));

    await expect(
      trackingClient.unsnooze({ id: 'rule-1', scheduleIds: ['snooze-1'] })
    ).rejects.toThrow('boom');
    expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
  });

  test('does not log when the rule type opts out of tracking', async () => {
    const changeTrackingService = createChangeTrackingService();
    const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
    setRuleType({ trackChanges: false });

    await trackingClient.unsnooze({ id: 'rule-1', scheduleIds: ['snooze-1'] });

    expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
  });

  test('captures rule.revision in object.sequence', async () => {
    const changeTrackingService = createChangeTrackingService();
    const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });

    await trackingClient.unsnooze({ id: 'rule-1', scheduleIds: ['snooze-1'] });

    expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          sequence: 0,
        }),
      ],
      expect.any(Object)
    );
  });
});
