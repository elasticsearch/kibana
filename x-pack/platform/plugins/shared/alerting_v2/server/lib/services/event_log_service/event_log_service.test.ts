/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IEvent } from '@kbn/event-log-plugin/server';
import {
  ACTION_POLICY_EVENT_ACTIONS,
  ACTION_POLICY_EVENT_PROVIDER,
} from '../../dispatcher/steps/constants';
import { createEventLogService } from './event_log_service.mock';
import type { FindRuleExecutionsQuery } from './types';

const SINCE = '2026-05-04T00:00:00Z';

const buildSearchResponse = (
  hits: Array<{ _id?: string; _source: unknown }> = [],
  total: number | { value: number; relation: 'eq' | 'gte' } = hits.length
) =>
  ({
    hits: { hits, total },
  } as any);

describe('EventLogService', () => {
  describe('logEvent', () => {
    it('delegates logEvent to the underlying IEventLogger', () => {
      const { eventLogService, mockEventLogger } = createEventLogService();
      const event: IEvent = {
        '@timestamp': '2026-04-29T12:00:00.000Z',
        event: { action: 'test', outcome: 'success' },
      };

      eventLogService.logEvent(event);

      expect(mockEventLogger.logEvent).toHaveBeenCalledTimes(1);
      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(event, undefined);
    });

    it('forwards the optional id argument to the underlying IEventLogger', () => {
      const { eventLogService, mockEventLogger } = createEventLogService();
      const event: IEvent = {
        '@timestamp': '2026-04-29T12:00:00.000Z',
        event: { action: 'test', outcome: 'success' },
      };

      eventLogService.logEvent(event, 'event-id-1');

      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(event, 'event-id-1');
    });
  });

  describe('findActionPolicyExecutionEvents', () => {
    it('resolves the index pattern via IEventLogService.getIndexPattern', async () => {
      const { eventLogService, mockEsClient, mockEventLogSetup } = createEventLogService();
      mockEventLogSetup.getIndexPattern.mockReturnValue('.kibana-event-log-test-*');
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findActionPolicyExecutionEvents({
        spaceId: 'default',
        startDate: SINCE,
      });

      expect(mockEventLogSetup.getIndexPattern).toHaveBeenCalled();
      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ index: '.kibana-event-log-test-*' })
      );
    });

    it('filters by provider, space and start date and orders by @timestamp desc', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findActionPolicyExecutionEvents({
        spaceId: 'my-space',
        startDate: SINCE,
      });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      expect(args.query.bool.filter).toEqual(
        expect.arrayContaining([
          { term: { 'event.provider': ACTION_POLICY_EVENT_PROVIDER } },
          { term: { 'kibana.space_ids': 'my-space' } },
          { range: { '@timestamp': { gte: SINCE } } },
        ])
      );
      expect(args.sort).toEqual([{ '@timestamp': { order: 'desc' } }]);
      expect(args.track_total_hits).toBe(true);
    });

    it('matches both dispatched and throttled when outcome is omitted', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findActionPolicyExecutionEvents({
        spaceId: 'default',
        startDate: SINCE,
      });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      expect(args.query.bool.filter).toEqual(
        expect.arrayContaining([
          {
            terms: {
              'event.action': [
                ACTION_POLICY_EVENT_ACTIONS.DISPATCHED,
                ACTION_POLICY_EVENT_ACTIONS.THROTTLED,
              ],
            },
          },
        ])
      );
    });

    it('narrows to a single event.action when outcome is provided', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findActionPolicyExecutionEvents({
        spaceId: 'default',
        startDate: SINCE,
        outcome: 'dispatched',
      });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      expect(args.query.bool.filter).toEqual(
        expect.arrayContaining([{ term: { 'event.action': 'dispatched' } }])
      );
    });

    it('emits a nested saved_objects.id terms filter that includes policy + rule ids', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findActionPolicyExecutionEvents({
        spaceId: 'default',
        startDate: SINCE,
        policyIds: ['p1'],
        ruleIds: ['r1'],
      });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      const boolClause = args.query.bool.filter.find((f: any) => f?.bool?.should);
      expect(boolClause).toBeDefined();
      expect(boolClause.bool.should).toEqual(
        expect.arrayContaining([
          {
            nested: {
              path: 'kibana.saved_objects',
              query: {
                bool: {
                  filter: [
                    { term: { 'kibana.saved_objects.type': 'alerting_action_policy' } },
                    { terms: { 'kibana.saved_objects.id': ['p1'] } },
                  ],
                },
              },
            },
          },
          {
            nested: {
              path: 'kibana.saved_objects',
              query: {
                bool: {
                  filter: [
                    { term: { 'kibana.saved_objects.type': 'alerting_rule' } },
                    { terms: { 'kibana.saved_objects.id': ['r1'] } },
                  ],
                },
              },
            },
          },
          { terms: { 'kibana.alerting_v2.dispatcher.rule_ids': ['r1'] } },
        ])
      );
      expect(boolClause.bool.minimum_should_match).toBe(1);
    });

    it('translates page/perPage into from/size', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findActionPolicyExecutionEvents({
        spaceId: 'default',
        startDate: SINCE,
        page: 3,
        perPage: 25,
      });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      expect(args.from).toBe(50);
      expect(args.size).toBe(25);
    });

    it('applies default page=1 and perPage=50 when not provided', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findActionPolicyExecutionEvents({
        spaceId: 'default',
        startDate: SINCE,
      });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      expect(args.from).toBe(0);
      expect(args.size).toBe(50);
    });

    it('maps the ES response to the contract shape', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      const source = { '@timestamp': '2026-05-05T10:00:00Z' };
      mockEsClient.search.mockResolvedValue(buildSearchResponse([{ _source: source }], 137));

      const result = await eventLogService.findActionPolicyExecutionEvents({
        spaceId: 'default',
        startDate: SINCE,
        page: 2,
        perPage: 25,
      });

      expect(result).toEqual({
        events: [source],
        page: 2,
        perPage: 25,
        total: 137,
      });
    });

    it('reads total.value when ES returns the object form', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse([], { value: 42, relation: 'eq' }));

      const result = await eventLogService.findActionPolicyExecutionEvents({
        spaceId: 'default',
        startDate: SINCE,
      });
      expect(result.total).toBe(42);
    });

    it('propagates errors from the ES client', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockRejectedValue(new Error('boom'));

      await expect(
        eventLogService.findActionPolicyExecutionEvents({
          spaceId: 'default',
          startDate: SINCE,
        })
      ).rejects.toThrow('boom');
    });
  });

  describe('countActionPolicyExecutionEventsSince', () => {
    it('runs a count-only search with size=0 and track_total_hits', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse([], 0));

      await eventLogService.countActionPolicyExecutionEventsSince({
        spaceId: 'default',
        since: SINCE,
      });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      expect(args.size).toBe(0);
      expect(args.from).toBeUndefined();
      expect(args.track_total_hits).toBe(true);
      expect(args.query.bool.filter).toEqual(
        expect.arrayContaining([{ range: { '@timestamp': { gte: SINCE } } }])
      );
    });

    it('forwards outcome and ids into the underlying ES query', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse([], 0));

      await eventLogService.countActionPolicyExecutionEventsSince({
        spaceId: 'default',
        since: SINCE,
        outcome: 'throttled',
        policyIds: ['p1'],
        ruleIds: ['r1'],
      });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      expect(args.query.bool.filter).toEqual(
        expect.arrayContaining([{ term: { 'event.action': 'throttled' } }])
      );
      const boolClause = args.query.bool.filter.find((f: any) => f?.bool?.should);
      expect(boolClause).toBeDefined();
    });

    it('returns total as count', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse([], 42));

      const result = await eventLogService.countActionPolicyExecutionEventsSince({
        spaceId: 'default',
        since: SINCE,
      });

      expect(result).toEqual({ count: 42 });
    });

    it('returns total.value when ES returns the object form', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse([], { value: 13, relation: 'eq' }));

      const result = await eventLogService.countActionPolicyExecutionEventsSince({
        spaceId: 'default',
        since: SINCE,
      });
      expect(result.count).toBe(13);
    });

    it('propagates errors from the ES client', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockRejectedValue(new Error('boom'));

      await expect(
        eventLogService.countActionPolicyExecutionEventsSince({
          spaceId: 'default',
          since: SINCE,
        })
      ).rejects.toThrow('boom');
    });
  });

  describe('findRuleExecutions', () => {
    const baseQuery: FindRuleExecutionsQuery = {
      spaceId: 'default',
      page: 1,
      perPage: 20,
    };

    const validRaw = {
      event: {
        provider: 'taskManager',
        action: 'task-run',
        outcome: 'success',
        start: '2026-06-23T09:59:50.000Z',
        end: '2026-06-23T10:00:00.000Z',
        duration: 1_000_000_000,
      },
      kibana: {
        task: {
          id: 'alerting_v2:rule_executor:default:rule-1',
          type: 'alerting_v2:rule_executor',
          schedule_delay: 500_000_000,
        },
        server_uuid: 'srv-1',
      },
    };

    it('resolves the index pattern via IEventLogService.getIndexPattern', async () => {
      const { eventLogService, mockEsClient, mockEventLogSetup } = createEventLogService();
      mockEventLogSetup.getIndexPattern.mockReturnValue('.kibana-event-log-test-*');
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findRuleExecutions(baseQuery);

      expect(mockEventLogSetup.getIndexPattern).toHaveBeenCalled();
      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ index: '.kibana-event-log-test-*' })
      );
    });

    it('passes the query body produced by the builder to ES', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findRuleExecutions({
        ...baseQuery,
        ruleIds: ['rule-a'],
        outcomes: ['failure'],
      });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      const filters = args.query.bool.filter;
      expect(filters).toEqual(
        expect.arrayContaining([
          { term: { 'event.provider': 'taskManager' } },
          { term: { 'kibana.task.type': 'alerting_v2:rule_executor' } },
          { term: { 'event.action': 'task-run' } },
          { prefix: { 'kibana.task.id': 'alerting_v2:rule_executor:default:' } },
          { terms: { 'kibana.task.id': ['alerting_v2:rule_executor:default:rule-a'] } },
          { terms: { 'event.outcome': ['failure'] } },
        ])
      );
      expect(args).not.toHaveProperty('track_total_hits');
    });

    it('always sends the space-prefix filter to ES, even with no ruleIds (cross-space leak guard)', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      await eventLogService.findRuleExecutions({ ...baseQuery, spaceId: 'space-A' });

      const [args] = mockEsClient.search.mock.calls[0] as [any];
      expect(args.query.bool.filter).toEqual(
        expect.arrayContaining([
          { prefix: { 'kibana.task.id': 'alerting_v2:rule_executor:space-A:' } },
        ])
      );
    });

    it('normalizes hits and drops malformed rows without throwing', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(
        buildSearchResponse([
          { _id: 'doc-1', _source: validRaw },
          {
            _id: 'doc-2',
            _source: {
              ...validRaw,
              kibana: { ...validRaw.kibana, task: { ...validRaw.kibana.task, id: 'malformed' } },
            },
          },
        ])
      );

      const result = await eventLogService.findRuleExecutions(baseQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].rule.id).toBe('rule-1');
    });

    it('surfaces the ES document _id as the execution id', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(
        buildSearchResponse([{ _id: 'tEv0XJUBd-rfxabc1234', _source: validRaw }])
      );

      const result = await eventLogService.findRuleExecutions(baseQuery);
      expect(result.items[0].id).toBe('tEv0XJUBd-rfxabc1234');
    });

    it('drops hits with a missing _id', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(
        buildSearchResponse([
          { _source: validRaw }, // no _id
          { _id: 'doc-2', _source: validRaw },
        ])
      );

      const result = await eventLogService.findRuleExecutions(baseQuery);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('doc-2');
    });

    it('returns total as a plain number when ES reports an exact count', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(
        buildSearchResponse([{ _id: 'doc-1', _source: validRaw }], 1)
      );

      const result = await eventLogService.findRuleExecutions(baseQuery);
      expect(result.total).toBe(1);
    });

    it('returns total.value when ES caps the relation at gte (10000+ semantics)', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(
        buildSearchResponse([{ _id: 'doc-1', _source: validRaw }], {
          value: 10_000,
          relation: 'gte',
        })
      );

      const result = await eventLogService.findRuleExecutions(baseQuery);
      expect(result.total).toBe(10_000);
    });

    it('echoes page and perPage back on the result', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockResolvedValue(buildSearchResponse());

      const result = await eventLogService.findRuleExecutions({
        ...baseQuery,
        page: 3,
        perPage: 25,
      });
      expect(result.page).toBe(3);
      expect(result.perPage).toBe(25);
    });

    it('propagates errors from the ES client', async () => {
      const { eventLogService, mockEsClient } = createEventLogService();
      mockEsClient.search.mockRejectedValue(new Error('boom'));

      await expect(eventLogService.findRuleExecutions(baseQuery)).rejects.toThrow('boom');
    });
  });
});
