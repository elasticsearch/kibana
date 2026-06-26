/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { EntityType } from '@kbn/entity-store/common';
import { useEntitiesListQuery } from './use_entities_list_query';
import { useEntityAnalyticsRoutes } from '../../../api/api';
import React from 'react';

jest.mock('../../../api/api');
jest.mock('../../../../common/lib/kibana', () => ({
  useKibana: () => ({ services: { http: {} } }),
}));

describe('useEntitiesListQuery', () => {
  const fetchEntitiesListV2Mock = jest.fn();
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (useEntityAnalyticsRoutes as jest.Mock).mockReturnValue({
      fetchEntitiesListV2: fetchEntitiesListV2Mock,
    });
  });

  it('calls fetchEntitiesListV2 with correct parameters', async () => {
    const searchParams = {
      entityTypes: ['host'] as EntityType[],
      page: 2,
      perPage: 20,
      sortField: '@timestamp',
      sortOrder: 'desc' as const,
      filterQuery: '{"match_all":{}}',
    };
    const v2Response = { records: [], total: 0, page: 2, per_page: 20 };
    fetchEntitiesListV2Mock.mockResolvedValueOnce(v2Response);

    const { result } = renderHook(() => useEntitiesListQuery({ ...searchParams, skip: false }), {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(fetchEntitiesListV2Mock).toHaveBeenCalledWith({
        params: {
          entityTypes: ['host'],
          filterQuery: '{"match_all":{}}',
          page: 2,
          perPage: 20,
          sortField: '@timestamp',
          sortOrder: 'desc',
        },
        signal: expect.any(AbortSignal),
      });
      expect(result.current.data).toEqual(v2Response);
    });
  });

  it('does not call fetchEntitiesListV2 when skip is true', async () => {
    const searchParams = { entityTypes: [] as EntityType[], page: 7 };

    const { result } = renderHook(() => useEntitiesListQuery({ ...searchParams, skip: true }), {
      wrapper: TestWrapper,
    });

    expect(fetchEntitiesListV2Mock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
