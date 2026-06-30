/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConstructorOptions } from '../../../../rules_client/rules_client';
import { RulesClient } from '../../../../rules_client/rules_client';
import {
  savedObjectsClientMock,
  loggingSystemMock,
  savedObjectsRepositoryMock,
  uiSettingsServiceMock,
  coreFeatureFlagsMock,
} from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { ruleTypeRegistryMock } from '../../../../rule_type_registry.mock';
import { alertingAuthorizationMock } from '../../../../authorization/alerting_authorization.mock';
import { fromKueryExpression, toKqlExpression } from '@kbn/es-query';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import type { AlertingAuthorization } from '../../../../authorization/alerting_authorization';
import type { ActionsAuthorization } from '@kbn/actions-plugin/server';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';

const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();

const kibanaVersion = 'v7.10.0';
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

beforeEach(() => {
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
  (auditLogger.log as jest.Mock).mockClear();
});

setGlobalDate();

const mockSavedObjectsFindResponse = (
  savedObjects: Array<{
    id: string;
    attributes: {
      alertTypeId: string;
      consumer: string;
      name?: string;
      mutedInstanceIds?: string[];
      snoozedInstances?: Array<Record<string, unknown>>;
    };
  }>
) => {
  unsecuredSavedObjectsClient.find.mockReset();
  unsecuredSavedObjectsClient.find.mockResolvedValue({
    total: savedObjects.length,
    per_page: 10,
    page: 1,
    saved_objects: savedObjects.map((so) => ({
      ...so,
      type: RULE_SAVED_OBJECT_TYPE,
      score: 1,
      references: [],
    })),
  });
};

describe('findMutedAlerts()', () => {
  beforeEach(() => {
    authorization.getAuthorizationFilter.mockResolvedValue({
      filter: undefined,
      ensureRuleTypeIsAuthorized() {},
    });

    mockSavedObjectsFindResponse([
      {
        id: '1',
        attributes: {
          alertTypeId: 'myType',
          consumer: 'myApp',
          name: 'fakeRuleName',
          mutedInstanceIds: ['instance-1', 'instance-2'],
          snoozedInstances: [
            {
              instanceId: 'instance-3',
              expiresAt: '2099-01-01T00:00:00.000Z',
              snoozedAt: '2026-01-01T00:00:00.000Z',
              snoozedBy: 'elastic',
            },
          ],
        },
      },
    ]);
  });

  test('returns rule id, muted instance ids and snoozed instances, plus pagination metadata', async () => {
    const rulesClient = new RulesClient(rulesClientParams);
    const result = await rulesClient.findMutedAlerts({ options: {} });

    expect(result).toEqual({
      page: 1,
      perPage: 10,
      total: 1,
      data: [
        {
          id: '1',
          mutedInstanceIds: ['instance-1', 'instance-2'],
          snoozedInstances: [
            {
              instanceId: 'instance-3',
              expiresAt: '2099-01-01T00:00:00.000Z',
              snoozedAt: '2026-01-01T00:00:00.000Z',
              snoozedBy: 'elastic',
            },
          ],
        },
      ],
    });
  });

  test('only requests the fields needed to authorize and report muted/snoozed state', async () => {
    const rulesClient = new RulesClient(rulesClientParams);
    await rulesClient.findMutedAlerts({ options: {} });

    expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledWith(
      expect.objectContaining({
        type: RULE_SAVED_OBJECT_TYPE,
        fields: ['alertTypeId', 'consumer', 'name', 'mutedInstanceIds', 'snoozedInstances'],
      })
    );
  });

  test('defaults muted instance ids and snoozed instances to empty arrays when the attributes are missing', async () => {
    mockSavedObjectsFindResponse([
      { id: '1', attributes: { alertTypeId: 'myType', consumer: 'myApp', name: 'noMutes' } },
    ]);

    const rulesClient = new RulesClient(rulesClientParams);
    const result = await rulesClient.findMutedAlerts({ options: {} });

    expect(result.data).toEqual([{ id: '1', mutedInstanceIds: [], snoozedInstances: [] }]);
  });

  test('works without params', async () => {
    const rulesClient = new RulesClient(rulesClientParams);
    const result = await rulesClient.findMutedAlerts();

    expect(result.data).toEqual([
      {
        id: '1',
        mutedInstanceIds: ['instance-1', 'instance-2'],
        snoozedInstances: [
          {
            instanceId: 'instance-3',
            expiresAt: '2099-01-01T00:00:00.000Z',
            snoozedAt: '2026-01-01T00:00:00.000Z',
            snoozedBy: 'elastic',
          },
        ],
      },
    ]);
  });

  test('throws a bad request error when params fail schema validation', async () => {
    const rulesClient = new RulesClient(rulesClientParams);
    await expect(
      // @ts-expect-error: testing invalid runtime input
      rulesClient.findMutedAlerts({ options: { page: 'not-a-number' } })
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Error validating find muted alerts data - [options.page]: expected value of type [number] but got [string]"`
    );
  });

  describe('authorization', () => {
    test('authorizes using the findMutedAlerts read operation', async () => {
      const rulesClient = new RulesClient(rulesClientParams);
      await rulesClient.findMutedAlerts({ options: {} });

      expect(authorization.getAuthorizationFilter).toHaveBeenCalledWith({
        operation: 'findMutedAlerts',
        authorizationEntity: 'rule',
        filterOpts: {
          fieldNames: {
            consumer: 'alert.attributes.consumer',
            ruleTypeId: 'alert.attributes.alertTypeId',
          },
          type: 'kql',
        },
      });
    });

    test('combines the user filter with the authorization filter', async () => {
      const filter = fromKueryExpression(
        'alert.attributes.alertTypeId:myType and alert.attributes.consumer:myApp'
      );
      authorization.getAuthorizationFilter.mockResolvedValue({
        filter,
        ensureRuleTypeIsAuthorized() {},
      });

      const rulesClient = new RulesClient(rulesClientParams);
      await rulesClient.findMutedAlerts({
        options: { filter: `alert.attributes.muteAll: true` },
      });

      const finalFilter = unsecuredSavedObjectsClient.find.mock.calls[0][0].filter;
      expect(toKqlExpression(finalFilter)).toMatchInlineSnapshot(
        `"(alert.attributes.muteAll: true AND (alert.attributes.alertTypeId: myType AND alert.attributes.consumer: myApp))"`
      );
    });

    test('throws when the user is not authorized to find any rule types', async () => {
      authorization.getAuthorizationFilter.mockRejectedValue(new Error('not authorized'));

      const rulesClient = new RulesClient(rulesClientParams);
      await expect(
        rulesClient.findMutedAlerts({ options: {} })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"not authorized"`);
    });

    test('throws when a returned rule type is not authorized for the user', async () => {
      authorization.getAuthorizationFilter.mockResolvedValue({
        filter: undefined,
        ensureRuleTypeIsAuthorized: jest.fn(() => {
          throw new Error('Unauthorized');
        }),
      });

      const rulesClient = new RulesClient(rulesClientParams);
      await expect(rulesClient.findMutedAlerts({ options: {} })).rejects.toThrow('Unauthorized');
    });
  });

  describe('auditLogger', () => {
    test('logs an audit event per returned rule on success', async () => {
      const rulesClient = new RulesClient({ ...rulesClientParams, auditLogger });
      await rulesClient.findMutedAlerts({ options: {} });

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_find_muted_alerts',
            outcome: 'success',
          }),
          kibana: { saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE, name: 'fakeRuleName' } },
        })
      );
    });

    test('logs a failure audit event when the user is not authorized to find', async () => {
      authorization.getAuthorizationFilter.mockRejectedValue(new Error('Unauthorized'));

      const rulesClient = new RulesClient({ ...rulesClientParams, auditLogger });
      await expect(rulesClient.findMutedAlerts({ options: {} })).rejects.toThrow();

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_find_muted_alerts',
            outcome: 'failure',
          }),
          error: { code: 'Error', message: 'Unauthorized' },
        })
      );
    });

    test('logs a failure audit event when a rule type is not authorized', async () => {
      authorization.getAuthorizationFilter.mockResolvedValue({
        filter: undefined,
        ensureRuleTypeIsAuthorized: jest.fn(() => {
          throw new Error('Unauthorized');
        }),
      });

      const rulesClient = new RulesClient({ ...rulesClientParams, auditLogger });
      await expect(rulesClient.findMutedAlerts({ options: {} })).rejects.toThrow();

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_find_muted_alerts',
            outcome: 'failure',
          }),
          kibana: { saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE, name: 'fakeRuleName' } },
          error: { code: 'Error', message: 'Unauthorized' },
        })
      );
    });

    test('does not log success events for earlier rules when a later rule fails authorization', async () => {
      mockSavedObjectsFindResponse([
        { id: '1', attributes: { alertTypeId: 'myType', consumer: 'myApp', name: 'authorized' } },
        {
          id: '2',
          attributes: { alertTypeId: 'otherType', consumer: 'myApp', name: 'unauthorized' },
        },
      ]);

      authorization.getAuthorizationFilter.mockResolvedValue({
        filter: undefined,
        ensureRuleTypeIsAuthorized: (ruleTypeId: string) => {
          if (ruleTypeId === 'otherType') {
            throw new Error('Unauthorized');
          }
        },
      });

      const rulesClient = new RulesClient({ ...rulesClientParams, auditLogger });
      await expect(rulesClient.findMutedAlerts({ options: {} })).rejects.toThrow('Unauthorized');

      // The earlier, authorized rule must not leave a success trail for a denied request.
      expect(auditLogger.log).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_find_muted_alerts',
            outcome: 'success',
          }),
        })
      );
      // The failing rule still logs a failure event.
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_find_muted_alerts',
            outcome: 'failure',
          }),
          kibana: { saved_object: { id: '2', type: RULE_SAVED_OBJECT_TYPE, name: 'unauthorized' } },
        })
      );
    });
  });
});
