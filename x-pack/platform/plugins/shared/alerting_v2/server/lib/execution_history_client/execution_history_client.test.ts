/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetRuleExecutionsQuery } from '@kbn/alerting-v2-schemas';
import type { EventLogService } from '../services/event_log_service/event_log_service';
import { createEventLogService } from '../services/event_log_service/event_log_service.mock';
import { ExecutionHistoryClient } from './execution_history_client';

const baseQuery = (overrides: Partial<GetRuleExecutionsQuery> = {}): GetRuleExecutionsQuery => ({
  sort: 'startedAt',
  sortOrder: 'desc',
  page: 1,
  perPage: 20,
  ...overrides,
});

interface Mocks {
  eventLogService: EventLogService;
  findRuleExecutions: jest.SpiedFunction<EventLogService['findRuleExecutions']>;
  client: ExecutionHistoryClient;
}

const createMocks = (spaceId = 'default'): Mocks => {
  const { eventLogService } = createEventLogService();

  const findRuleExecutions = jest
    .spyOn(eventLogService, 'findRuleExecutions')
    .mockResolvedValue({ items: [], total: 0, page: 1, perPage: 20 });

  const client = new ExecutionHistoryClient(eventLogService, spaceId);
  return { eventLogService, findRuleExecutions, client };
};

describe('ExecutionHistoryClient', () => {
  describe('getRuleExecutions', () => {
    it('passes the request space id to the underlying event log service', async () => {
      const { client, findRuleExecutions } = createMocks('space-A');
      await client.getRuleExecutions(baseQuery());
      expect(findRuleExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'space-A' })
      );
    });

    it('renames the schema ruleId (singular, REST convention) to ruleIds for the service call', async () => {
      const { client, findRuleExecutions } = createMocks();
      await client.getRuleExecutions(baseQuery({ ruleId: ['rule-x'] }));
      expect(findRuleExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ ruleIds: ['rule-x'] })
      );
    });

    it('supports filtering on multiple rule ids', async () => {
      const { client, findRuleExecutions } = createMocks();
      await client.getRuleExecutions(baseQuery({ ruleId: ['rule-x', 'rule-y', 'rule-z'] }));
      expect(findRuleExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ ruleIds: ['rule-x', 'rule-y', 'rule-z'] })
      );
    });

    it('omits ruleIds when no rule filter is provided', async () => {
      const { client, findRuleExecutions } = createMocks();
      await client.getRuleExecutions(baseQuery());
      expect(findRuleExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ ruleIds: undefined })
      );
    });

    it('renames the schema outcome (singular, REST convention) to outcomes for the service call', async () => {
      const { client, findRuleExecutions } = createMocks();
      await client.getRuleExecutions(baseQuery({ outcome: ['success', 'failure'] }));
      expect(findRuleExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ outcomes: ['success', 'failure'] })
      );
    });

    it('passes through sort, sortOrder, from, to, paging unchanged', async () => {
      const { client, findRuleExecutions } = createMocks();
      await client.getRuleExecutions(
        baseQuery({
          sort: 'duration',
          sortOrder: 'asc',
          from: '2026-06-01T00:00:00Z',
          to: '2026-06-02T00:00:00Z',
          page: 4,
          perPage: 25,
        })
      );
      expect(findRuleExecutions).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'duration',
          sortOrder: 'asc',
          from: '2026-06-01T00:00:00Z',
          to: '2026-06-02T00:00:00Z',
          page: 4,
          perPage: 25,
        })
      );
    });

    it('echoes the service response back to the caller verbatim', async () => {
      const { client, findRuleExecutions } = createMocks();
      findRuleExecutions.mockResolvedValue({
        items: [],
        total: 137,
        page: 5,
        perPage: 25,
      });
      const result = await client.getRuleExecutions(baseQuery({ page: 5, perPage: 25 }));
      expect(result).toEqual({ total: 137, page: 5, perPage: 25, items: [] });
    });
  });
});
