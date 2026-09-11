/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import type { RouterMock } from '@kbn/core-http-router-server-mocks';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type {
  SecuritySolutionApiRequestHandlerContext,
  SecuritySolutionPluginRouter,
  SecuritySolutionRequestHandlerContext,
} from '../../types';
import type { RuleAlertType } from '../../lib/detection_engine/rule_schema';
import {
  ALERT_ANALYSIS_WORKFLOW_RULE_SELECTION_ROUTE,
  ALERT_ANALYSIS_WORKFLOW_RULE_STATS_ROUTE,
  ALERT_ANALYSIS_WORKFLOW_RULE_UPDATE_ROUTE,
  ALERT_ANALYSIS_WORKFLOW_RULES_ROUTE,
  registerAlertAnalysisWorkflowRuleAttachmentRoutes,
} from './rule_attachment_routes';
import { ALERT_ANALYSIS_WORKFLOW_SYSTEM_CONNECTOR_ID } from './rule_attachments';
import {
  createConnectorAction,
  createRule,
  createWorkflowAction as createWorkflowActionFixture,
  createWorkflowSystemAction as createWorkflowSystemActionFixture,
} from './test_fixtures';

jest.mock(
  '../../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client',
  () => ({
    createPrebuiltRuleAssetsClient: jest.fn(() => ({
      fetchAssetsByVersion: jest.fn().mockResolvedValue({ assets: [] }),
    })),
  })
);

// The workflow is installed once in the global space, so rule actions reference the bare id (no
// per-space suffix); the route builds its service with this same id.
const WORKFLOW_ID = 'system-security-alert-analysis';

const createWorkflowAction = () => createWorkflowActionFixture(WORKFLOW_ID);

const createWorkflowSystemAction = () => createWorkflowSystemActionFixture(WORKFLOW_ID);

describe('registerAlertAnalysisWorkflowRuleAttachmentRoutes', () => {
  let router: RouterMock;
  let mockResponse: ReturnType<typeof httpServerMock.createResponseFactory>;
  let rulesClient: jest.Mocked<RulesClient>;
  let actionsClient: jest.Mocked<ActionsClient>;
  let hasAtLeast: jest.Mock;
  let context: SecuritySolutionRequestHandlerContext;

  // Mirrors the parts of rulesClient.find the service relies on: name search, the "has the workflow
  // action" KQL filter (detected by the actionRef clause), name sorting, count-only requests
  // (perPage 0), and page slicing.
  const mockFindRules = (rules: RuleAlertType[]) => {
    rulesClient.find.mockImplementation(async ({ options } = {}) => {
      const {
        filter,
        search,
        page = 1,
        perPage = 0,
        sortField,
        sortOrder,
      } = (options ?? {}) as {
        filter?: string;
        search?: string;
        page?: number;
        perPage?: number;
        sortField?: string;
        sortOrder?: string;
      };

      let matched = rules;
      if (typeof search === 'string' && search.length > 0) {
        const lowerSearch = search.toLowerCase();
        matched = matched.filter((rule) => rule.name.toLowerCase().includes(lowerSearch));
      }
      if (typeof filter === 'string' && filter.includes('actionRef')) {
        matched = matched.filter((rule) =>
          [...rule.actions, ...(rule.systemActions ?? [])].some(
            (action) =>
              action.id === ALERT_ANALYSIS_WORKFLOW_SYSTEM_CONNECTOR_ID &&
              (action.params as { subActionParams?: { workflowId?: string } }).subActionParams
                ?.workflowId === WORKFLOW_ID
          )
        );
      }
      if (sortField === 'name') {
        const direction = sortOrder === 'desc' ? -1 : 1;
        matched = [...matched].sort((a, b) => a.name.localeCompare(b.name) * direction);
      }

      const total = matched.length;
      const start = (page - 1) * perPage;
      const data = perPage === 0 ? [] : matched.slice(start, start + perPage);

      return { data, total, page, perPage };
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
      isSystemAction: jest.fn((id: string) => id === ALERT_ANALYSIS_WORKFLOW_SYSTEM_CONNECTOR_ID),
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

    hasAtLeast = jest.fn().mockReturnValue(true);
    context = {
      licensing: Promise.resolve({ license: { hasAtLeast } }),
      loadPluginContract: jest.fn(),
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

    registerAlertAnalysisWorkflowRuleAttachmentRoutes(
      router as unknown as SecuritySolutionPluginRouter
    );
  });

  it('returns matching rules with attached state', async () => {
    mockFindRules([
      createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
      createRule({ id: 'rule-2', enabled: false }),
    ]);
    const handler = router.versioned.getRoute('get', ALERT_ANALYSIS_WORKFLOW_RULES_ROUTE).versions[
      '1'
    ].handler;

    await handler(
      context,
      createRequest({
        method: 'get',
        path: ALERT_ANALYSIS_WORKFLOW_RULES_ROUTE,
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

  it('passes the attachment filter through to the rule list', async () => {
    mockFindRules([
      createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
      createRule({ id: 'rule-2', enabled: false }),
    ]);
    const handler = router.versioned.getRoute('get', ALERT_ANALYSIS_WORKFLOW_RULES_ROUTE).versions[
      '1'
    ].handler;

    await handler(
      context,
      createRequest({
        method: 'get',
        path: ALERT_ANALYSIS_WORKFLOW_RULES_ROUTE,
        query: { search: '', attachment_filter: 'attached', page: 1, per_page: 20 },
      }),
      mockResponse
    );

    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: {
        total: 1,
        attached: 1,
        page: 1,
        perPage: 20,
        rules: [{ id: 'rule-1', name: 'Rule rule-1', enabled: true, attached: true }],
      },
    });
  });

  it('returns attachment stats', async () => {
    mockFindRules([
      createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
      createRule({ id: 'rule-2' }),
    ]);
    const handler = router.versioned.getRoute('get', ALERT_ANALYSIS_WORKFLOW_RULE_STATS_ROUTE)
      .versions['1'].handler;

    await handler(
      context,
      createRequest({
        method: 'get',
        path: ALERT_ANALYSIS_WORKFLOW_RULE_STATS_ROUTE,
        query: { search: '' },
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
    const handler = router.versioned.getRoute('get', ALERT_ANALYSIS_WORKFLOW_RULE_SELECTION_ROUTE)
      .versions['1'].handler;

    await handler(
      context,
      createRequest({
        method: 'get',
        path: ALERT_ANALYSIS_WORKFLOW_RULE_SELECTION_ROUTE,
        query: { search: '' },
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
    const handler = router.versioned.getRoute('post', ALERT_ANALYSIS_WORKFLOW_RULE_UPDATE_ROUTE)
      .versions['1'].handler;

    await handler(
      context,
      createRequest({
        method: 'post',
        path: ALERT_ANALYSIS_WORKFLOW_RULE_UPDATE_ROUTE,
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

  it('returns forbidden when the license does not support the feature', async () => {
    hasAtLeast.mockReturnValue(false);
    const handler = router.versioned.getRoute('post', ALERT_ANALYSIS_WORKFLOW_RULE_UPDATE_ROUTE)
      .versions['1'].handler;

    await handler(
      context,
      createRequest({
        method: 'post',
        path: ALERT_ANALYSIS_WORKFLOW_RULE_UPDATE_ROUTE,
        body: { attachRuleIds: ['rule-1'], detachRuleIds: [], dryRun: false },
      }),
      mockResponse
    );

    expect(mockResponse.forbidden).toHaveBeenCalled();
    expect(rulesClient.bulkEdit).not.toHaveBeenCalled();
    expect(rulesClient.find).not.toHaveBeenCalled();
  });
});
