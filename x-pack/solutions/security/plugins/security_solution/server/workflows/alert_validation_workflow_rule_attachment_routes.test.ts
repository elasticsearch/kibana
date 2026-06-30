/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import type { StartServicesAccessor } from '@kbn/core/server';
import type { RouterMock } from '@kbn/core-http-router-server-mocks';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { StartPlugins } from '../plugin';
import type {
  SecuritySolutionApiRequestHandlerContext,
  SecuritySolutionPluginRouter,
  SecuritySolutionRequestHandlerContext,
} from '../types';
import type { RuleAlertType } from '../lib/detection_engine/rule_schema';
import {
  ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULES_ROUTE,
  registerAlertValidationWorkflowRuleAttachmentRoutes,
} from './alert_validation_workflow_rule_attachment_routes';
import { ALERT_VALIDATION_WORKFLOW_SYSTEM_CONNECTOR_ID } from './alert_validation_workflow_rule_attachments';

jest.mock(
  '../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client',
  () => ({
    createPrebuiltRuleAssetsClient: jest.fn(() => ({
      fetchAssetsByVersion: jest.fn().mockResolvedValue({ assets: [] }),
    })),
  })
);

const WORKFLOW_ID = 'system-security-alert-validation-space-1';

const createWorkflowAction = (): RuleAlertType['actions'][number] =>
  ({
    actionTypeId: '.workflows',
    group: 'default',
    id: ALERT_VALIDATION_WORKFLOW_SYSTEM_CONNECTOR_ID,
    params: {
      subAction: 'run',
      subActionParams: {
        workflowId: WORKFLOW_ID,
        summaryMode: false,
      },
    },
  } as RuleAlertType['actions'][number]);

const createWorkflowSystemAction = (): NonNullable<RuleAlertType['systemActions']>[number] =>
  ({
    actionTypeId: '.workflows',
    id: ALERT_VALIDATION_WORKFLOW_SYSTEM_CONNECTOR_ID,
    params: {
      subAction: 'run',
      subActionParams: {
        workflowId: WORKFLOW_ID,
        summaryMode: false,
      },
    },
  } as NonNullable<RuleAlertType['systemActions']>[number]);

const createConnectorAction = (): RuleAlertType['actions'][number] =>
  ({
    actionTypeId: '.server-log',
    group: 'default',
    id: 'connector-id',
    params: {
      message: 'Rule {{rule.name}} matched',
    },
    frequency: {
      summary: false,
      notifyWhen: 'onActiveAlert',
      throttle: null,
    },
  } as RuleAlertType['actions'][number]);

const createRule = ({
  id,
  actions = [],
  systemActions = [],
  enabled = true,
}: {
  id: string;
  actions?: RuleAlertType['actions'];
  systemActions?: RuleAlertType['systemActions'];
  enabled?: boolean;
}): RuleAlertType =>
  ({
    id,
    name: `Rule ${id}`,
    enabled,
    actions,
    systemActions,
    params: {
      immutable: false,
    },
  } as RuleAlertType);

describe('registerAlertValidationWorkflowRuleAttachmentRoutes', () => {
  let router: RouterMock;
  let coreStart: ReturnType<typeof coreMock.createStart>;
  let getStartServices: jest.MockedFunction<StartServicesAccessor<StartPlugins>>;
  let mockResponse: ReturnType<typeof httpServerMock.createResponseFactory>;
  let rulesClient: jest.Mocked<RulesClient>;
  let actionsClient: jest.Mocked<ActionsClient>;
  let context: SecuritySolutionRequestHandlerContext;

  const mockFindRules = (rules: RuleAlertType[]) => {
    rulesClient.find.mockResolvedValue({
      data: rules,
      total: rules.length,
      page: 1,
      perPage: 2000,
    });
  };

  const createRequest = ({
    method,
    path,
    query,
    body,
  }: {
    method: 'get' | 'post';
    path: string;
    query?: Record<string, string | number>;
    body?: Record<string, string | boolean | string[]>;
  }) =>
    httpServerMock.createKibanaRequest({
      method,
      path,
      query,
      body,
    });

  beforeEach(() => {
    router = httpServiceMock.createRouter() as unknown as RouterMock;
    coreStart = coreMock.createStart();
    coreStart.featureFlags.getBooleanValue.mockResolvedValue(true);
    mockResponse = httpServerMock.createResponseFactory();
    rulesClient = {
      find: jest.fn(),
      bulkEdit: jest.fn().mockResolvedValue({
        rules: [createRule({ id: 'rule-2' })],
        skipped: [],
        errors: [],
        total: 1,
      }),
    } as Partial<jest.Mocked<RulesClient>> as jest.Mocked<RulesClient>;
    actionsClient = {
      isSystemAction: jest.fn((id: string) => id === ALERT_VALIDATION_WORKFLOW_SYSTEM_CONNECTOR_ID),
    } as Partial<jest.Mocked<ActionsClient>> as jest.Mocked<ActionsClient>;

    const securitySolutionContext = {
      getSpaceId: jest.fn().mockReturnValue('space-1'),
      getDetectionRulesClient: jest.fn().mockReturnValue({
        getRuleCustomizationStatus: jest.fn().mockReturnValue({}),
      }),
      getMlAuthz: jest.fn().mockReturnValue({}),
      getRulesAuthz: jest.fn().mockReturnValue({}),
    } as Pick<
      SecuritySolutionApiRequestHandlerContext,
      'getSpaceId' | 'getDetectionRulesClient' | 'getMlAuthz' | 'getRulesAuthz'
    >;

    context = {
      resolve: jest.fn().mockResolvedValue({
        core: {
          savedObjects: {
            client: {},
          },
        },
        securitySolution: securitySolutionContext,
        alerting: {
          getRulesClient: jest.fn().mockResolvedValue(rulesClient),
        },
        actions: {
          getActionsClient: jest.fn().mockReturnValue(actionsClient),
        },
      }),
    } as unknown as SecuritySolutionRequestHandlerContext;

    getStartServices = jest
      .fn()
      .mockResolvedValue([coreStart, {} as StartPlugins, undefined] as unknown as Awaited<
        ReturnType<StartServicesAccessor<StartPlugins>>
      >);

    registerAlertValidationWorkflowRuleAttachmentRoutes(
      router as unknown as SecuritySolutionPluginRouter,
      getStartServices as StartServicesAccessor<StartPlugins>
    );
  });

  it('returns matching rules with attached state', async () => {
    mockFindRules([
      createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
      createRule({ id: 'rule-2', enabled: false }),
    ]);
    const handler = router.versioned.getRoute('get', ALERT_VALIDATION_WORKFLOW_RULES_ROUTE)
      .versions['1'].handler;

    await handler(
      context,
      createRequest({
        method: 'get',
        path: ALERT_VALIDATION_WORKFLOW_RULES_ROUTE,
        query: { search: '', page: 1, per_page: 20 },
      }),
      mockResponse
    );

    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: {
        total: 2,
        attached: 1,
        page: 1,
        perPage: 20,
        rules: [
          {
            id: 'rule-1',
            name: 'Rule rule-1',
            enabled: true,
            attached: true,
          },
          {
            id: 'rule-2',
            name: 'Rule rule-2',
            enabled: false,
            attached: false,
          },
        ],
      },
    });
  });

  it('returns attachment stats', async () => {
    mockFindRules([
      createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
      createRule({ id: 'rule-2' }),
    ]);
    const handler = router.versioned.getRoute('post', ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE)
      .versions['1'].handler;

    await handler(
      context,
      createRequest({
        method: 'post',
        path: ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE,
        body: { search: '' },
      }),
      mockResponse
    );

    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: {
        total: 2,
        attached: 1,
      },
    });
  });

  it('returns selectable rule ids for matching rules missing the workflow action', async () => {
    mockFindRules([
      createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
      createRule({ id: 'rule-2' }),
    ]);
    const handler = router.versioned.getRoute(
      'post',
      ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE
    ).versions['1'].handler;

    await handler(
      context,
      createRequest({
        method: 'post',
        path: ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE,
        body: { search: '' },
      }),
      mockResponse
    );

    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: {
        total: 2,
        attached: 1,
        selectable: 1,
        attachedRuleIds: ['rule-1'],
        ruleIds: ['rule-2'],
      },
    });
  });

  it('updates workflow attachments only for rules whose state changed', async () => {
    mockFindRules([
      createRule({ id: 'rule-1', systemActions: [createWorkflowSystemAction()] }),
      createRule({ id: 'rule-2' }),
      createRule({
        id: 'rule-3',
        actions: [createConnectorAction()],
        systemActions: [createWorkflowSystemAction()],
      }),
    ]);
    rulesClient.bulkEdit
      .mockResolvedValueOnce({
        rules: [createRule({ id: 'rule-2' })],
        skipped: [],
        errors: [],
        total: 1,
      })
      .mockResolvedValueOnce({
        rules: [createRule({ id: 'rule-3', actions: [createConnectorAction()] })],
        skipped: [],
        errors: [],
        total: 1,
      });
    const handler = router.versioned.getRoute('post', ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE)
      .versions['1'].handler;

    await handler(
      context,
      createRequest({
        method: 'post',
        path: ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE,
        body: { attachRuleIds: ['rule-1', 'rule-2'], detachRuleIds: ['rule-3'], dryRun: false },
      }),
      mockResponse
    );

    expect(rulesClient.bulkEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        ids: ['rule-2'],
        operations: [
          expect.objectContaining({
            field: 'actions',
            operation: 'add',
          }),
        ],
      })
    );
    expect(rulesClient.bulkEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ids: ['rule-3'],
        operations: [
          expect.objectContaining({
            field: 'actions',
            operation: 'set',
          }),
        ],
      })
    );
    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: {
        matched: 3,
        updated: 2,
      },
    });
  });

  it('returns 404 when the feature flag is disabled', async () => {
    coreStart.featureFlags.getBooleanValue.mockResolvedValue(false);
    const handler = router.versioned.getRoute('post', ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE)
      .versions['1'].handler;

    await handler(
      context,
      createRequest({
        method: 'post',
        path: ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE,
        body: { search: '' },
      }),
      mockResponse
    );

    expect(mockResponse.notFound).toHaveBeenCalled();
    expect(rulesClient.find).not.toHaveBeenCalled();
  });
});
