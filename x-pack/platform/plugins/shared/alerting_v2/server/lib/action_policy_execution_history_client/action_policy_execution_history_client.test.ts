/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { ActionPolicyClient } from '../action_policy_client/action_policy_client';
import type { RulesClient } from '../rules_client';
import type { EventLogServiceContract } from '../services/event_log_service/event_log_service';
import type { LoggerServiceContract } from '../services/logger_service/logger_service';
import type { AlertingServerStartDependencies } from '../../types';
import { ACTION_POLICY_EVENT_ACTIONS } from '../dispatcher/steps/constants';
import { ACTION_POLICY_SAVED_OBJECT_TYPE, RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import { ActionPolicyExecutionHistoryClient } from './action_policy_execution_history_client';

const buildEvent = ({
  policyId,
  ruleIds = [],
  workflowIds = [],
  episodeCount = 1,
  actionGroupCount = 1,
  action = ACTION_POLICY_EVENT_ACTIONS.DISPATCHED,
  timestamp = '2026-05-05T10:00:00.000Z',
}: {
  policyId: string;
  ruleIds?: string[];
  workflowIds?: string[];
  episodeCount?: number;
  actionGroupCount?: number;
  action?: 'dispatched' | 'throttled';
  timestamp?: string;
}) => ({
  '@timestamp': timestamp,
  event: { action, provider: 'alerting_v2' },
  kibana: {
    saved_objects: [
      { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: policyId },
      ...ruleIds.map((id) => ({ type: RULE_SAVED_OBJECT_TYPE, id })),
    ],
    alerting_v2: {
      dispatcher: {
        episode_count: episodeCount,
        action_group_count: actionGroupCount,
        workflow_ids: workflowIds,
      },
    },
  },
});

const buildPolicy = (id: string, name: string) => ({ id, name } as any);
const buildRule = (id: string, name: string) => ({ id, metadata: { name } } as any);
const buildWorkflow = (id: string, name: string) => ({ id, name } as any);
const buildFindRulesResponse = (rules: Array<{ id: string; metadata: { name: string } }>) =>
  ({ items: rules, total: rules.length, page: 1, perPage: rules.length } as any);

const createMocks = () => {
  const eventLogService: jest.Mocked<EventLogServiceContract> = {
    logEvent: jest.fn(),
    findActionPolicyExecutionEvents: jest.fn().mockResolvedValue({
      events: [],
      page: 1,
      perPage: 100,
      total: 0,
    }),
    countActionPolicyExecutionEventsSince: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const actionPolicyClient = {
    getActionPolicies: jest.fn().mockResolvedValue([]),
    findActionPolicies: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, perPage: 500 }),
  } as unknown as jest.Mocked<ActionPolicyClient>;
  const rulesClient = {
    findRules: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, perPage: 0 }),
  } as unknown as jest.Mocked<RulesClient>;
  const workflowsManagement = {
    getWorkflowsByIds: jest.fn().mockResolvedValue([]),
  };
  const spaces = {
    spacesService: {
      getSpaceId: jest.fn().mockReturnValue('default'),
    },
  } as unknown as AlertingServerStartDependencies['spaces'];
  const logger: jest.Mocked<LoggerServiceContract> = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const client = new ActionPolicyExecutionHistoryClient(
    eventLogService,
    actionPolicyClient,
    rulesClient,
    workflowsManagement as any,
    spaces,
    logger
  );

  return {
    client,
    eventLogService,
    actionPolicyClient,
    rulesClient,
    workflowsManagement,
    spaces,
    logger,
  };
};

describe('ActionPolicyExecutionHistoryClient', () => {
  describe('listExecutionHistory', () => {
    it('forwards page, perPage and a 24h startDate to the event log service', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-11T11:00:00.000Z'));
      const { client, eventLogService } = createMocks();
      const request = httpServerMock.createKibanaRequest();

      await client.listExecutionHistory({ request, page: 2, perPage: 25 });

      expect(eventLogService.findActionPolicyExecutionEvents).toHaveBeenCalledWith({
        request,
        spaceId: 'default',
        startDate: '2026-10-10T11:00:00.000Z',
        page: 2,
        perPage: 25,
        outcome: undefined,
        policyIds: [],
        ruleIds: [],
      });

      jest.useRealTimers();
    });

    it('applies default page=1 and perPage=100 when not provided', async () => {
      const { client, eventLogService } = createMocks();
      const request = httpServerMock.createKibanaRequest();

      await client.listExecutionHistory({ request });

      const args = eventLogService.findActionPolicyExecutionEvents.mock.calls[0][0];
      expect(args.page).toBe(1);
      expect(args.perPage).toBe(100);
    });

    it('passes the request-scoped spaceId to event log + workflows lookup', async () => {
      const { client, eventLogService, workflowsManagement, spaces } = createMocks();
      (spaces.spacesService.getSpaceId as jest.Mock).mockReturnValue('my-space');
      eventLogService.findActionPolicyExecutionEvents.mockResolvedValue({
        events: [buildEvent({ policyId: 'p-1', ruleIds: ['r-1'], workflowIds: ['w-1'] })],
        page: 1,
        perPage: 100,
        total: 1,
      } as any);
      const request = httpServerMock.createKibanaRequest();

      await client.listExecutionHistory({ request });

      expect(spaces.spacesService.getSpaceId).toHaveBeenCalledWith(request);
      expect(eventLogService.findActionPolicyExecutionEvents).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'my-space' })
      );
      expect(workflowsManagement.getWorkflowsByIds).toHaveBeenCalledWith(['w-1'], 'my-space');
    });

    it('bulk-fetches policies, rules and workflows from event refs', async () => {
      const { client, eventLogService, actionPolicyClient, rulesClient, workflowsManagement } =
        createMocks();
      eventLogService.findActionPolicyExecutionEvents.mockResolvedValue({
        events: [buildEvent({ policyId: 'p-1', ruleIds: ['r-1'], workflowIds: ['w-1'] })],
        page: 1,
        perPage: 100,
        total: 1,
      } as any);
      const request = httpServerMock.createKibanaRequest();

      await client.listExecutionHistory({ request });

      expect(actionPolicyClient.getActionPolicies).toHaveBeenCalledWith({ ids: ['p-1'] });
      expect(rulesClient.findRules).toHaveBeenCalledWith({
        filter: expect.stringContaining(`id: "r-1"`),
        perPage: 1000,
      });
      expect(workflowsManagement.getWorkflowsByIds).toHaveBeenCalledWith(['w-1'], 'default');
    });

    it('passes empty arrays to bulk getters when no events are returned', async () => {
      const { client, actionPolicyClient, rulesClient, workflowsManagement } = createMocks();
      const request = httpServerMock.createKibanaRequest();

      await client.listExecutionHistory({ request });

      expect(actionPolicyClient.getActionPolicies).toHaveBeenCalledWith({ ids: [] });
      expect(rulesClient.findRules).not.toHaveBeenCalled();
      expect(workflowsManagement.getWorkflowsByIds).toHaveBeenCalledWith([], 'default');
    });

    it('populates response item names from the bulk-get results', async () => {
      const { client, eventLogService, actionPolicyClient, rulesClient, workflowsManagement } =
        createMocks();
      eventLogService.findActionPolicyExecutionEvents.mockResolvedValue({
        events: [buildEvent({ policyId: 'p-1', ruleIds: ['r-1'], workflowIds: ['w-1'] })],
        page: 1,
        perPage: 100,
        total: 1,
      } as any);
      actionPolicyClient.getActionPolicies.mockResolvedValue([buildPolicy('p-1', 'Policy 1')]);
      (rulesClient.findRules as jest.Mock).mockResolvedValue(
        buildFindRulesResponse([buildRule('r-1', 'Rule 1')])
      );
      workflowsManagement.getWorkflowsByIds.mockResolvedValue([buildWorkflow('w-1', 'WF 1')]);

      const request = httpServerMock.createKibanaRequest();

      const result = await client.listExecutionHistory({ request });

      expect(result.items[0]).toMatchObject({
        policy: { name: 'Policy 1' },
        rule: { name: 'Rule 1' },
        workflows: [{ name: 'WF 1' }],
      });
    });

    it('returns the page/perPage/totalEvents from the service', async () => {
      const { client, eventLogService } = createMocks();
      eventLogService.findActionPolicyExecutionEvents.mockResolvedValue({
        events: [],
        page: 4,
        perPage: 25,
        total: 137,
      } as any);
      const request = httpServerMock.createKibanaRequest();

      const result = await client.listExecutionHistory({ request });

      expect(result).toMatchObject({ page: 4, perPage: 25, totalEvents: 137, items: [] });
    });

    it('propagates errors from the underlying service', async () => {
      const { client, eventLogService } = createMocks();
      eventLogService.findActionPolicyExecutionEvents.mockRejectedValue(new Error('boom'));
      const request = httpServerMock.createKibanaRequest();

      await expect(client.listExecutionHistory({ request })).rejects.toThrow('boom');
    });

    describe('outcome filter', () => {
      it('passes the explicit outcome through to the event log service', async () => {
        const { client, eventLogService } = createMocks();
        const request = httpServerMock.createKibanaRequest();

        await client.listExecutionHistory({ request, outcome: 'throttled' });

        expect(eventLogService.findActionPolicyExecutionEvents).toHaveBeenCalledWith(
          expect.objectContaining({ outcome: 'throttled' })
        );
      });

      it('maps outcome="all" to undefined for the service (no outcome narrowing)', async () => {
        const { client, eventLogService } = createMocks();
        const request = httpServerMock.createKibanaRequest();

        await client.listExecutionHistory({ request, outcome: 'all' });

        expect(eventLogService.findActionPolicyExecutionEvents).toHaveBeenCalledWith(
          expect.objectContaining({ outcome: undefined })
        );
      });

      it('defaults to outcome="all" (no narrowing → undefined to service) when not provided', async () => {
        const { client, eventLogService } = createMocks();
        const request = httpServerMock.createKibanaRequest();

        await client.listExecutionHistory({ request });

        expect(eventLogService.findActionPolicyExecutionEvents).toHaveBeenCalledWith(
          expect.objectContaining({ outcome: undefined })
        );
      });
    });

    describe('search', () => {
      it('queries policies and rules in parallel using the search text', async () => {
        const { client, actionPolicyClient, rulesClient } = createMocks();
        (actionPolicyClient.findActionPolicies as jest.Mock).mockResolvedValue({
          items: [{ id: 'p-1' } as any],
          total: 1,
          page: 1,
          perPage: 500,
        });
        (rulesClient.findRules as jest.Mock).mockResolvedValue({
          items: [{ id: 'r-1' } as any],
          total: 1,
          page: 1,
          perPage: 500,
        });
        const request = httpServerMock.createKibanaRequest();

        await client.listExecutionHistory({ request, search: 'high cpu' });

        expect(actionPolicyClient.findActionPolicies).toHaveBeenCalledWith({
          search: 'high cpu',
          perPage: 500,
        });
        expect(rulesClient.findRules).toHaveBeenCalledWith({ search: 'high cpu', perPage: 500 });
      });

      it('forwards the resolved policy/rule ids to the event log service', async () => {
        const { client, eventLogService, actionPolicyClient, rulesClient } = createMocks();
        (actionPolicyClient.findActionPolicies as jest.Mock).mockResolvedValue({
          items: [{ id: 'p-1' } as any, { id: 'p-2' } as any],
          total: 2,
          page: 1,
          perPage: 500,
        });
        (rulesClient.findRules as jest.Mock).mockResolvedValue({
          items: [{ id: 'r-1' } as any],
          total: 1,
          page: 1,
          perPage: 500,
        });
        const request = httpServerMock.createKibanaRequest();

        await client.listExecutionHistory({ request, search: 'high cpu' });

        const call = eventLogService.findActionPolicyExecutionEvents.mock.calls[0][0];
        expect(call.policyIds).toEqual(expect.arrayContaining(['p-1', 'p-2']));
        expect(call.ruleIds).toEqual(expect.arrayContaining(['r-1']));
      });

      it('also includes the raw search term as a candidate id when it is a UUID', async () => {
        const { client, eventLogService } = createMocks();
        const request = httpServerMock.createKibanaRequest();
        const uuid = 'e057fcc7-9402-4e5a-b5b5-1575b7b8d651';

        await client.listExecutionHistory({ request, search: uuid });

        const call = eventLogService.findActionPolicyExecutionEvents.mock.calls[0][0];
        expect(call.policyIds).toContain(uuid);
        expect(call.ruleIds).toContain(uuid);
      });

      it('does not add the term as a candidate id when it is not a UUID', async () => {
        const { client, eventLogService, actionPolicyClient } = createMocks();
        (actionPolicyClient.findActionPolicies as jest.Mock).mockResolvedValue({
          items: [{ id: 'p-1' } as any],
          total: 1,
          page: 1,
          perPage: 500,
        });
        const request = httpServerMock.createKibanaRequest();

        for (const term of ['rule', 'cpu', '2', 'p-abc', 'two words']) {
          (eventLogService.findActionPolicyExecutionEvents as jest.Mock).mockClear();
          await client.listExecutionHistory({ request, search: term });

          const call = eventLogService.findActionPolicyExecutionEvents.mock.calls[0][0];
          expect(call.policyIds).not.toContain(term);
          expect(call.ruleIds).not.toContain(term);
        }
      });

      it('short-circuits with an empty result when search yields no matching ids', async () => {
        const { client, eventLogService } = createMocks();
        const request = httpServerMock.createKibanaRequest();

        const result = await client.listExecutionHistory({
          request,
          search: 'no matches here',
        });

        expect(eventLogService.findActionPolicyExecutionEvents).not.toHaveBeenCalled();
        expect(result).toEqual({
          items: [],
          page: 1,
          perPage: 100,
          totalEvents: 0,
          searchMatches: { policies: 0, rules: 0, cap: 500 },
        });
      });

      it('reports the policy total when matches exceed the cap', async () => {
        const { client, actionPolicyClient } = createMocks();
        (actionPolicyClient.findActionPolicies as jest.Mock).mockResolvedValue({
          items: [{ id: 'p-1' } as any],
          total: 823,
          page: 1,
          perPage: 500,
        });
        const request = httpServerMock.createKibanaRequest();

        const result = await client.listExecutionHistory({ request, search: 'something' });

        expect(result.searchMatches).toEqual({ policies: 823, rules: 0, cap: 500 });
      });

      it('reports the rule total when matches exceed the cap', async () => {
        const { client, rulesClient } = createMocks();
        (rulesClient.findRules as jest.Mock).mockResolvedValue({
          items: [{ id: 'r-1' } as any],
          total: 612,
          page: 1,
          perPage: 500,
        });
        const request = httpServerMock.createKibanaRequest();

        const result = await client.listExecutionHistory({ request, search: 'something' });

        expect(result.searchMatches).toEqual({ policies: 0, rules: 612, cap: 500 });
      });

      it('reports counts within the cap (no truncation derived)', async () => {
        const { client, actionPolicyClient, rulesClient } = createMocks();
        (actionPolicyClient.findActionPolicies as jest.Mock).mockResolvedValue({
          items: [{ id: 'p-1' } as any],
          total: 1,
          page: 1,
          perPage: 500,
        });
        (rulesClient.findRules as jest.Mock).mockResolvedValue({
          items: [{ id: 'r-1' } as any],
          total: 500,
          page: 1,
          perPage: 500,
        });
        const request = httpServerMock.createKibanaRequest();

        const result = await client.listExecutionHistory({ request, search: 'something' });

        expect(result.searchMatches).toEqual({ policies: 1, rules: 500, cap: 500 });
      });

      it('returns searchMatches=null when no search is provided', async () => {
        const { client } = createMocks();
        const request = httpServerMock.createKibanaRequest();

        const result = await client.listExecutionHistory({ request });

        expect(result.searchMatches).toBeNull();
      });
    });

    describe('partial failures in name resolution', () => {
      const setup = () => {
        const mocks = createMocks();
        mocks.eventLogService.findActionPolicyExecutionEvents.mockResolvedValue({
          events: [buildEvent({ policyId: 'p-1', ruleIds: ['r-1'], workflowIds: ['w-1'] })],
          page: 1,
          perPage: 100,
          total: 1,
        } as any);
        mocks.actionPolicyClient.getActionPolicies.mockResolvedValue([
          buildPolicy('p-1', 'Policy 1'),
        ]);
        (mocks.rulesClient.findRules as jest.Mock).mockResolvedValue(
          buildFindRulesResponse([buildRule('r-1', 'Rule 1')])
        );
        mocks.workflowsManagement.getWorkflowsByIds.mockResolvedValue([
          buildWorkflow('w-1', 'WF 1'),
        ]);
        return mocks;
      };

      it('falls back to null workflow names and logs error when workflows lookup rejects', async () => {
        const mocks = setup();
        mocks.workflowsManagement.getWorkflowsByIds.mockRejectedValue(new Error('wf down'));
        const request = httpServerMock.createKibanaRequest();

        const result = await mocks.client.listExecutionHistory({ request });

        expect(result.items[0]).toMatchObject({
          policy: { name: 'Policy 1' },
          rule: { name: 'Rule 1' },
          workflows: [{ id: 'w-1', name: null }],
        });
        expect(mocks.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'EXECUTION_HISTORY_WORKFLOW_LOOKUP_FAILED' })
        );
      });

      it('falls back to null policy names when policy lookup rejects', async () => {
        const mocks = setup();
        mocks.actionPolicyClient.getActionPolicies.mockRejectedValue(new Error('so down'));
        const request = httpServerMock.createKibanaRequest();

        const result = await mocks.client.listExecutionHistory({ request });

        expect(result.items[0].policy).toEqual({ id: 'p-1', name: null });
        expect(mocks.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'EXECUTION_HISTORY_POLICY_LOOKUP_FAILED' })
        );
      });

      it('falls back to null rule names when rules lookup rejects', async () => {
        const mocks = setup();
        (mocks.rulesClient.findRules as jest.Mock).mockRejectedValue(new Error('rules down'));
        const request = httpServerMock.createKibanaRequest();

        const result = await mocks.client.listExecutionHistory({ request });

        expect(result.items[0].rule).toEqual({ id: 'r-1', name: null });
        expect(mocks.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'EXECUTION_HISTORY_RULE_LOOKUP_FAILED' })
        );
      });
    });

    describe('missing rule ids in name resolution', () => {
      it('uses names for found ids and falls back to null for missing ones (no rejection)', async () => {
        const { client, eventLogService, rulesClient } = createMocks();
        eventLogService.findActionPolicyExecutionEvents.mockResolvedValue({
          events: [
            buildEvent({ policyId: 'p-1', ruleIds: ['r-1'] }),
            buildEvent({ policyId: 'p-1', ruleIds: ['r-2'] }),
            buildEvent({ policyId: 'p-1', ruleIds: ['r-3'] }),
          ],
          page: 1,
          perPage: 100,
          total: 3,
        } as any);
        (rulesClient.findRules as jest.Mock).mockResolvedValue(
          buildFindRulesResponse([buildRule('r-1', 'Rule 1'), buildRule('r-3', 'Rule 3')])
        );

        const request = httpServerMock.createKibanaRequest();
        const result = await client.listExecutionHistory({ request });

        expect(result.items[0].rule).toEqual({ id: 'r-1', name: 'Rule 1' });
        expect(result.items[1].rule).toEqual({ id: 'r-2', name: null });
        expect(result.items[2].rule).toEqual({ id: 'r-3', name: 'Rule 3' });
      });
    });
  });

  describe('countNewEventsSince', () => {
    it('delegates to event log service with request-scoped spaceId', async () => {
      const { client, eventLogService, spaces } = createMocks();
      (spaces.spacesService.getSpaceId as jest.Mock).mockReturnValue('my-space');
      eventLogService.countActionPolicyExecutionEventsSince.mockResolvedValue({ count: 7 });
      const request = httpServerMock.createKibanaRequest();
      const since = '2026-05-05T10:00:00.000Z';

      const result = await client.countNewEventsSince({ request, since });

      expect(spaces.spacesService.getSpaceId).toHaveBeenCalledWith(request);
      expect(eventLogService.countActionPolicyExecutionEventsSince).toHaveBeenCalledWith({
        request,
        spaceId: 'my-space',
        since,
        outcome: undefined,
        policyIds: [],
        ruleIds: [],
      });
      expect(result).toEqual({ count: 7 });
    });

    it('propagates errors from the underlying service', async () => {
      const { client, eventLogService } = createMocks();
      eventLogService.countActionPolicyExecutionEventsSince.mockRejectedValue(new Error('boom'));
      const request = httpServerMock.createKibanaRequest();

      await expect(
        client.countNewEventsSince({ request, since: '2026-05-05T10:00:00.000Z' })
      ).rejects.toThrow('boom');
    });

    it('forwards outcome and resolved search ids to the service', async () => {
      const { client, eventLogService, actionPolicyClient, rulesClient } = createMocks();
      (actionPolicyClient.findActionPolicies as jest.Mock).mockResolvedValue({
        items: [{ id: 'p-1' } as any],
        total: 1,
        page: 1,
        perPage: 500,
      });
      (rulesClient.findRules as jest.Mock).mockResolvedValue({
        items: [{ id: 'r-1' } as any],
        total: 1,
        page: 1,
        perPage: 500,
      });
      const request = httpServerMock.createKibanaRequest();

      await client.countNewEventsSince({
        request,
        since: '2026-05-05T10:00:00.000Z',
        search: 'something',
        outcome: 'throttled',
      });

      const call = eventLogService.countActionPolicyExecutionEventsSince.mock.calls[0][0];
      expect(call.outcome).toBe('throttled');
      expect(call.policyIds).toEqual(expect.arrayContaining(['p-1']));
      expect(call.ruleIds).toEqual(expect.arrayContaining(['r-1']));
    });

    it('short-circuits with count=0 when search yields no matching ids', async () => {
      const { client, eventLogService } = createMocks();
      const request = httpServerMock.createKibanaRequest();

      const result = await client.countNewEventsSince({
        request,
        since: '2026-05-05T10:00:00.000Z',
        search: 'no matches here',
      });

      expect(eventLogService.countActionPolicyExecutionEventsSince).not.toHaveBeenCalled();
      expect(result).toEqual({ count: 0 });
    });
  });
});
