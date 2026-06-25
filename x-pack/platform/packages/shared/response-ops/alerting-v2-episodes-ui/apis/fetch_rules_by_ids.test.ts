/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { ALERT_EPISODES_LIST_PAGE_SIZE } from '../constants';
import { fetchRulesByIds } from './fetch_rules_by_ids';

const mockHttp = httpServiceMock.createStartContract();

describe('fetchRulesByIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHttp.get.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      perPage: ALERT_EPISODES_LIST_PAGE_SIZE,
    });
  });

  it('returns an empty array when no ids are provided', async () => {
    await expect(fetchRulesByIds({ http: mockHttp, ids: [] })).resolves.toEqual([]);
    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  it('fetches rules with a KQL id filter', async () => {
    await fetchRulesByIds({ http: mockHttp, ids: ['rule-a', 'rule-b'] });

    expect(mockHttp.get).toHaveBeenCalledWith(ALERTING_V2_RULE_API_PATH, {
      query: {
        filter: '(id: "rule-a" OR id: "rule-b")',
        perPage: ALERT_EPISODES_LIST_PAGE_SIZE,
        page: 1,
      },
    });
  });

  it('caps ids at ALERT_EPISODES_LIST_PAGE_SIZE', async () => {
    const ids = Array.from(
      { length: ALERT_EPISODES_LIST_PAGE_SIZE + 1 },
      (_, index) => `rule-${index}`
    );

    await fetchRulesByIds({ http: mockHttp, ids });

    expect(mockHttp.get).toHaveBeenCalledTimes(1);
    expect(mockHttp.get).toHaveBeenCalledWith(ALERTING_V2_RULE_API_PATH, {
      query: {
        filter: expect.not.stringContaining(`rule-${ALERT_EPISODES_LIST_PAGE_SIZE}`),
        perPage: ALERT_EPISODES_LIST_PAGE_SIZE,
        page: 1,
      },
    });
  });
});
