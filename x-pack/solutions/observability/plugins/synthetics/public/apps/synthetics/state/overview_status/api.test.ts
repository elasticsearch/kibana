/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fetchStaleStatus } from './api';
import { SYNTHETICS_API_URLS } from '../../../../../common/constants';
import { apiService } from '../../../../utils/api_service';

jest.mock('../../../../utils/api_service', () => ({
  apiService: { get: jest.fn(), post: jest.fn() },
}));

describe('fetchStaleStatus', () => {
  const mockPost = apiService.post as jest.Mock;

  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ priorRuns: [] });
  });

  it('sends monitorQueryIds in the request body', async () => {
    const pageState = {
      dateRangeStart: 'now-24h',
      dateRangeEnd: 'now',
      query: '',
      tags: [],
      locations: [],
      projects: [],
      schedules: [],
      monitorTypes: [],
      remoteNames: [],
      monitorQueryIds: ['from-page-state'],
      showFromAllSpaces: false,
      useLogicalAndFor: [],
    } as any;

    await fetchStaleStatus({
      pageState,
      monitorQueryIds: ['mon-1', 'mon-2'],
    });

    expect(mockPost).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.OVERVIEW_STATUS_STALE,
      { monitorQueryIds: ['mon-1', 'mon-2'] },
      expect.anything(),
      expect.objectContaining({
        dateRangeStart: 'now-24h',
        dateRangeEnd: 'now',
      })
    );
  });
});
