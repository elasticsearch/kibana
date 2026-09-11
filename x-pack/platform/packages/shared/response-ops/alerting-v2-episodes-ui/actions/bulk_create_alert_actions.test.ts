/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import {
  bulkAckEpisodeActions,
  bulkActivateEpisodeActions,
  bulkAssignEpisodeActions,
  bulkDeactivateEpisodeActions,
  bulkSnoozeSeriesActions,
  bulkTagSeriesActions,
  bulkUnackEpisodeActions,
  bulkUnsnoozeSeriesActions,
} from './bulk_create_alert_actions';
import {
  ALERTING_V2_EPISODES_API_PATH,
  ALERTING_V2_SERIES_API_PATH,
} from '@kbn/alerting-v2-constants';

describe('series bulk actions', () => {
  const mockHttp = httpServiceMock.createStartContract();

  beforeEach(() => jest.clearAllMocks());

  it('bulkTagSeriesActions POSTs the items envelope to _bulk_tag and returns the bulk response', async () => {
    mockHttp.post.mockResolvedValue({ affected_count: 2, errors: [] });
    const items = [{ group_hash: 'g1', tags: ['t1'] }];
    const result = await bulkTagSeriesActions(mockHttp, items);
    expect(mockHttp.post).toHaveBeenCalledWith(`${ALERTING_V2_SERIES_API_PATH}/_bulk_tag`, {
      body: JSON.stringify({ items }),
    });
    expect(result).toEqual({ affected_count: 2, errors: [] });
  });

  it('bulkSnoozeSeriesActions POSTs the items envelope to _bulk_snooze and returns the bulk response', async () => {
    mockHttp.post.mockResolvedValue({ affected_count: 1, errors: [] });
    const items = [{ group_hash: 'g1', expiry: '2026-05-01T00:00:00Z' }];
    const result = await bulkSnoozeSeriesActions(mockHttp, items);
    expect(mockHttp.post).toHaveBeenCalledWith(`${ALERTING_V2_SERIES_API_PATH}/_bulk_snooze`, {
      body: JSON.stringify({ items }),
    });
    expect(result).toEqual({ affected_count: 1, errors: [] });
  });

  it('bulkUnsnoozeSeriesActions POSTs the items envelope to _bulk_unsnooze and returns the bulk response', async () => {
    mockHttp.post.mockResolvedValue({ affected_count: 1, errors: [] });
    const items = [{ group_hash: 'g1' }];
    const result = await bulkUnsnoozeSeriesActions(mockHttp, items);
    expect(mockHttp.post).toHaveBeenCalledWith(`${ALERTING_V2_SERIES_API_PATH}/_bulk_unsnooze`, {
      body: JSON.stringify({ items }),
    });
    expect(result).toEqual({ affected_count: 1, errors: [] });
  });
});

describe('episode bulk actions', () => {
  const mockHttp = httpServiceMock.createStartContract();

  beforeEach(() => jest.clearAllMocks());

  it('bulkAckEpisodeActions POSTs the items envelope to _bulk_ack and returns the bulk response', async () => {
    mockHttp.post.mockResolvedValue({ affected_count: 1, errors: [] });
    const items = [{ episode_id: 'e1' }];
    const result = await bulkAckEpisodeActions(mockHttp, items);
    expect(mockHttp.post).toHaveBeenCalledWith(`${ALERTING_V2_EPISODES_API_PATH}/_bulk_ack`, {
      body: JSON.stringify({ items }),
    });
    expect(result).toEqual({ affected_count: 1, errors: [] });
  });

  it('bulkUnackEpisodeActions POSTs the items envelope to _bulk_unack and returns the bulk response', async () => {
    mockHttp.post.mockResolvedValue({ affected_count: 1, errors: [] });
    const items = [{ episode_id: 'e1' }];
    const result = await bulkUnackEpisodeActions(mockHttp, items);
    expect(mockHttp.post).toHaveBeenCalledWith(`${ALERTING_V2_EPISODES_API_PATH}/_bulk_unack`, {
      body: JSON.stringify({ items }),
    });
    expect(result).toEqual({ affected_count: 1, errors: [] });
  });

  it('bulkAssignEpisodeActions POSTs the items envelope to _bulk_assign and returns the bulk response', async () => {
    mockHttp.post.mockResolvedValue({ affected_count: 1, errors: [] });
    const items = [{ episode_id: 'e1', assignee_uid: null }];
    const result = await bulkAssignEpisodeActions(mockHttp, items);
    expect(mockHttp.post).toHaveBeenCalledWith(`${ALERTING_V2_EPISODES_API_PATH}/_bulk_assign`, {
      body: JSON.stringify({ items }),
    });
    expect(result).toEqual({ affected_count: 1, errors: [] });
  });

  it('bulkActivateEpisodeActions POSTs the items envelope to _bulk_activate and returns the bulk response', async () => {
    mockHttp.post.mockResolvedValue({ affected_count: 1, errors: [] });
    const items = [{ episode_id: 'e1', reason: 'why' }];
    const result = await bulkActivateEpisodeActions(mockHttp, items);
    expect(mockHttp.post).toHaveBeenCalledWith(`${ALERTING_V2_EPISODES_API_PATH}/_bulk_activate`, {
      body: JSON.stringify({ items }),
    });
    expect(result).toEqual({ affected_count: 1, errors: [] });
  });

  it('bulkDeactivateEpisodeActions POSTs the items envelope to _bulk_deactivate and returns the bulk response', async () => {
    mockHttp.post.mockResolvedValue({ affected_count: 1, errors: [] });
    const items = [{ episode_id: 'e1', reason: 'why' }];
    const result = await bulkDeactivateEpisodeActions(mockHttp, items);
    expect(mockHttp.post).toHaveBeenCalledWith(
      `${ALERTING_V2_EPISODES_API_PATH}/_bulk_deactivate`,
      { body: JSON.stringify({ items }) }
    );
    expect(result).toEqual({ affected_count: 1, errors: [] });
  });
});
