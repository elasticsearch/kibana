/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { generateChangeHistoryDocument } from '@kbn/change-history/test_utils';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import type { ConstructorOptions } from '../rules_client';
import { RulesClient } from '../rules_client';
import { RuleChangeTrackingDisabledError } from '../methods/get_rule_history';
import {
  savedObjectsClientMock,
  loggingSystemMock,
  savedObjectsRepositoryMock,
  uiSettingsServiceMock,
  coreFeatureFlagsMock,
} from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { ruleTypeRegistryMock } from '../../rule_type_registry.mock';
import { alertingAuthorizationMock } from '../../authorization/alerting_authorization.mock';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import type { AlertingAuthorization } from '../../authorization/alerting_authorization';
import type { ActionsAuthorization } from '@kbn/actions-plugin/server';
import { eventLogClientMock } from '@kbn/event-log-plugin/server/mocks';
import type { SavedObject } from '@kbn/core/server';
import type { RawRule } from '../../types';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { getBeforeSetup, mockedDateString, setGlobalDate } from './lib';
import { ConnectorAdapterRegistry } from '../../connector_adapters/connector_adapter_registry';
import { RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import { backfillClientMock } from '../../backfill_client/backfill_client.mock';
import type { IScopedChangeTrackingService } from '../lib/change_tracking';

describe('getHistory()', () => {
  const taskManager = taskManagerMock.createStart();
  const ruleTypeRegistry = ruleTypeRegistryMock.create();
  const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
  const eventLogClient = eventLogClientMock.create();

  const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
  const authorization = alertingAuthorizationMock.create();
  const actionsAuthorization = actionsAuthorizationMock.create();
  const auditLogger = auditLoggerMock.create();
  const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();

  const changeTrackingService: jest.Mocked<IScopedChangeTrackingService> = {
    log: jest.fn(),
    logBulk: jest.fn(),
    getHistory: jest.fn(),
  };

  const kibanaVersion = 'v9.5.0';
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
    kibanaVersion,
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
    changeTrackingService,
  };

  beforeEach(() => {
    getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry, eventLogClient);
    (auditLogger.log as jest.Mock).mockClear();
    changeTrackingService.log.mockReset();
    changeTrackingService.logBulk.mockReset();
    changeTrackingService.getHistory.mockReset();
    changeTrackingService.getHistory.mockResolvedValue({ total: 0, items: [] });
  });

  setGlobalDate();

  const RuleIntervalSeconds = 1;

  const getRuleSavedObject = (): SavedObject<RawRule> => ({
    id: '1',
    type: RULE_SAVED_OBJECT_TYPE,
    attributes: {
      enabled: true,
      name: 'rule-name',
      tags: ['tag-1', 'tag-2'],
      alertTypeId: '123',
      consumer: 'rule-consumer',
      legacyId: null,
      schedule: { interval: `${RuleIntervalSeconds}s` },
      actions: [],
      params: {},
      createdBy: null,
      updatedBy: null,
      createdAt: mockedDateString,
      updatedAt: mockedDateString,
      apiKey: null,
      apiKeyOwner: null,
      throttle: null,
      notifyWhen: null,
      muteAll: false,
      mutedInstanceIds: [],
      executionStatus: {
        status: 'unknown',
        lastExecutionDate: '2020-08-20T19:23:38Z',
        error: null,
        warning: null,
      },
      revision: 0,
    },
    references: [],
  });

  let rulesClient: RulesClient;

  beforeEach(() => {
    rulesClient = new RulesClient(rulesClientParams);
  });

  test('throws RuleChangeTrackingDisabledError when changeTrackingService is not configured', async () => {
    const clientWithoutTracking = new RulesClient({
      ...rulesClientParams,
      changeTrackingService: undefined,
    });

    await expect(
      clientWithoutTracking.getHistory({ module: 'security', ruleId: '1' })
    ).rejects.toBeInstanceOf(RuleChangeTrackingDisabledError);

    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(authorization.ensureAuthorized).not.toHaveBeenCalled();
    expect(changeTrackingService.getHistory).not.toHaveBeenCalled();
  });

  test('returns result from the change tracking service', async () => {
    const ruleSO = getRuleSavedObject();
    const changeHistoryItem = generateChangeHistoryDocument({
      object: {
        id: ruleSO.id,
        type: '',
        hash: '',
        fields: {
          hashed: [],
          redacted: [],
        },
        snapshot: {
          id: ruleSO.id,
          enabled: ruleSO.attributes.enabled,
          name: ruleSO.attributes.name,
          tags: ruleSO.attributes.tags,
          alertTypeId: ruleSO.attributes.alertTypeId,
          consumer: ruleSO.attributes.consumer,
          legacyId: ruleSO.attributes.legacyId,
          schedule: ruleSO.attributes.schedule,
          actions: ruleSO.attributes.actions,
          params: ruleSO.attributes.params,
          createdBy: ruleSO.attributes.createdBy,
          updatedBy: ruleSO.attributes.updatedBy,
          createdAt: ruleSO.attributes.createdAt,
          updatedAt: ruleSO.attributes.updatedAt,
          apiKey: ruleSO.attributes.apiKey,
          apiKeyOwner: ruleSO.attributes.apiKeyOwner,
          throttle: ruleSO.attributes.throttle,
          notifyWhen: ruleSO.attributes.notifyWhen,
          muteAll: ruleSO.attributes.muteAll,
          revision: ruleSO.attributes.revision,
        },
      },
    });

    unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());
    changeTrackingService.getHistory.mockResolvedValueOnce({
      total: 1,
      items: [changeHistoryItem],
    });

    const result = await rulesClient.getHistory({ module: 'security', ruleId: '1' });

    expect(result).toEqual({
      total: 1,
      items: [
        {
          ...changeHistoryItem,
          rule: expect.any(Object),
        },
      ],
    });
  });

  test('forwards default pagination to the change tracking service', async () => {
    unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());

    await rulesClient.getHistory({ module: 'security', ruleId: '1' });

    expect(changeTrackingService.getHistory).toHaveBeenCalledTimes(1);
    expect(changeTrackingService.getHistory).toHaveBeenCalledWith('security', 'default', '1', {
      from: 0,
      size: 20,
    });
  });

  test('forwards custom from/size and sort to the change tracking service', async () => {
    unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());

    await rulesClient.getHistory({
      module: 'security',
      ruleId: '1',
      from: 100,
      size: 50,
      sort: [{ '@timestamp': { order: 'asc' } }],
    });

    expect(changeTrackingService.getHistory).toHaveBeenCalledWith('security', 'default', '1', {
      from: 100,
      size: 50,
      sort: [{ '@timestamp': { order: 'asc' } }],
    });
  });

  test('forwards module param to the change tracking service', async () => {
    unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());

    await rulesClient.getHistory({ module: 'observability', ruleId: '1' });

    expect(changeTrackingService.getHistory).toHaveBeenCalledWith(
      'observability',
      'default',
      '1',
      expect.any(Object)
    );
  });

  describe('authorization', () => {
    test('ensures the user is authorised to read the rule via the GetHistory operation', async () => {
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());

      await rulesClient.getHistory({ module: 'security', ruleId: '1' });

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'rule-consumer',
        operation: 'getHistory',
        ruleTypeId: '123',
      });
    });

    test('throws when the user is not authorised', async () => {
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());
      authorization.ensureAuthorized.mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(rulesClient.getHistory({ module: 'security', ruleId: '1' })).rejects.toThrow(
        'Unauthorized'
      );

      expect(changeTrackingService.getHistory).not.toHaveBeenCalled();
    });
  });

  describe('auditLogger', () => {
    test('logs a success audit event', async () => {
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());

      await rulesClient.getHistory({ module: 'security', ruleId: '1' });

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_get_history',
            outcome: 'success',
          }),
          kibana: { saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE, name: 'rule-name' } },
        })
      );
    });

    test('logs a failure audit event when authorization is denied', async () => {
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());
      authorization.ensureAuthorized.mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(rulesClient.getHistory({ module: 'security', ruleId: '1' })).rejects.toThrow(
        'Unauthorized'
      );

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_get_history',
            outcome: 'failure',
          }),
          kibana: {
            saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE, name: 'rule-name' },
          },
        })
      );
    });
  });

  describe('deleted rule', () => {
    const notFoundError = SavedObjectsErrorHelpers.createGenericNotFoundError(
      RULE_SAVED_OBJECT_TYPE,
      '1'
    );

    const makeSnapshotItem = (attrs: Partial<RawRule> = {}) => {
      const ruleSO = getRuleSavedObject();
      const mergedAttrs = { ...ruleSO.attributes, ...attrs };
      return generateChangeHistoryDocument({
        object: {
          id: ruleSO.id,
          type: RULE_SAVED_OBJECT_TYPE,
          hash: '',
          fields: { hashed: [], redacted: [] },
          snapshot: {
            id: ruleSO.id,
            alertTypeId: mergedAttrs.alertTypeId,
            consumer: mergedAttrs.consumer,
            name: mergedAttrs.name,
            enabled: mergedAttrs.enabled,
            tags: mergedAttrs.tags,
            schedule: mergedAttrs.schedule,
            actions: mergedAttrs.actions,
            params: mergedAttrs.params,
            createdBy: mergedAttrs.createdBy,
            updatedBy: mergedAttrs.updatedBy,
            createdAt: mergedAttrs.createdAt,
            updatedAt: mergedAttrs.updatedAt,
            revision: mergedAttrs.revision,
            muteAll: mergedAttrs.muteAll,
          },
        },
      });
    };

    test('returns history items when rule is deleted', async () => {
      unsecuredSavedObjectsClient.get.mockRejectedValueOnce(notFoundError);

      const historyItem = makeSnapshotItem();

      // first call: auth-info lookup (size: 1)
      changeTrackingService.getHistory.mockResolvedValueOnce({ total: 1, items: [historyItem] });
      // second call: actual history fetch
      changeTrackingService.getHistory.mockResolvedValueOnce({ total: 1, items: [historyItem] });

      const result = await rulesClient.getHistory({ module: 'security', ruleId: '1' });

      expect(changeTrackingService.getHistory).toHaveBeenCalledTimes(2);
      expect(result.items).toHaveLength(1);
    });

    test('uses snapshot alertTypeId and consumer for authorization when rule is deleted', async () => {
      unsecuredSavedObjectsClient.get.mockRejectedValueOnce(notFoundError);

      const historyItem = makeSnapshotItem({ alertTypeId: 'snap-type', consumer: 'snap-consumer' });

      changeTrackingService.getHistory.mockResolvedValueOnce({ total: 1, items: [historyItem] });
      changeTrackingService.getHistory.mockResolvedValueOnce({ total: 1, items: [historyItem] });

      await rulesClient.getHistory({ module: 'security', ruleId: '1' });

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith(
        expect.objectContaining({ ruleTypeId: 'snap-type', consumer: 'snap-consumer' })
      );
    });

    test('returns empty result when rule is deleted and no history records exist', async () => {
      unsecuredSavedObjectsClient.get.mockRejectedValueOnce(notFoundError);
      changeTrackingService.getHistory.mockResolvedValueOnce({ total: 0, items: [] });

      const result = await rulesClient.getHistory({ module: 'security', ruleId: '1' });

      expect(result).toEqual({ total: 0, items: [] });
      expect(authorization.ensureAuthorized).not.toHaveBeenCalled();
      // only the auth-info lookup; no second history call
      expect(changeTrackingService.getHistory).toHaveBeenCalledTimes(1);
    });

    test('rethrows non-404 errors from getRuleSo', async () => {
      const serverError = new Error('Internal server error');
      unsecuredSavedObjectsClient.get.mockRejectedValueOnce(serverError);

      await expect(rulesClient.getHistory({ module: 'security', ruleId: '1' })).rejects.toThrow(
        'Internal server error'
      );

      expect(changeTrackingService.getHistory).not.toHaveBeenCalled();
    });
  });

  describe('rule hydration', () => {
    test('hydrates `rule` from `object.snapshot` on each item', async () => {
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());
      ruleTypeRegistry.get.mockReturnValue({
        id: 'siem.queryRule',
        actionGroups: [],
        defaultActionGroupId: '',
        recoveryActionGroup: { id: '', name: '' },
        validate: { params: { validate: jest.fn() } },
        isExportable: true,
        minimumLicenseRequired: 'basic',
        executor: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      changeTrackingService.getHistory.mockResolvedValueOnce({
        total: 1,
        items: [
          {
            '@timestamp': '2026-05-01T10:00:00.000Z',
            object: {
              id: 'rule-1',
              type: 'alert',
              hash: 'h',
              fields: { hashed: [] },
              snapshot: {
                id: 'rule-1',
                alertTypeId: 'siem.queryRule',
                name: 'My rule',
                enabled: true,
                consumer: 'rule-consumer',
                schedule: { interval: '1m' },
                revision: 0,
                muteAll: false,
                actions: [],
                tags: [],
                params: {},
                createdBy: null,
                updatedBy: null,
                createdAt: '2026-05-01T10:00:00.000Z',
                updatedAt: '2026-05-01T10:00:00.000Z',
                apiKey: null,
                apiKeyOwner: null,
              },
            },
          } as never,
        ],
      });

      const result = await rulesClient.getHistory({ module: 'security', ruleId: '1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].rule).toBeDefined();
      expect(result.items[0].rule.id).toBe('rule-1');
      expect(result.items[0].rule.alertTypeId).toBe('siem.queryRule');
    });

    test('discards items without `rule` when the snapshot is malformed', async () => {
      const ruleSO = getRuleSavedObject();
      const changeHistoryItem = generateChangeHistoryDocument({
        object: {
          id: ruleSO.id,
          type: '',
          hash: '',
          fields: {
            hashed: [],
            redacted: [],
          },
          snapshot: {
            references: ruleSO.references,
          },
        },
      });

      unsecuredSavedObjectsClient.get.mockResolvedValueOnce(getRuleSavedObject());
      changeTrackingService.getHistory.mockResolvedValueOnce({
        total: 1,
        items: [changeHistoryItem],
      });

      const result = await rulesClient.getHistory({ module: 'security', ruleId: '1' });

      expect(result.items).toHaveLength(0);
    });
  });
});
