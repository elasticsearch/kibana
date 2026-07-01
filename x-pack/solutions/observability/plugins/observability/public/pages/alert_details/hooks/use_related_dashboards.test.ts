/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useRelatedDashboards } from './use_related_dashboards';
import { kibanaStartMock } from '../../../utils/kibana_react.mock';

const mockUseKibanaReturnValue = kibanaStartMock.startContract();
let capturedQueryFn: (() => Promise<any>) | undefined;

// Test constants
const TEST_ALERT_ID = 'test-alert-id';
const API_ENDPOINT = '/internal/observability/alerts/related_dashboards';

const TEST_DASHBOARD_1 = {
  id: 'dashboard-1',
  title: 'Dashboard 1',
  description: 'This is dashboard 1',
};

const TEST_DASHBOARD_2 = {
  id: 'dashboard-2',
  title: 'Dashboard 2',
  description: 'This is dashboard 2',
};

const TEST_DASHBOARD_3 = {
  id: 'dashboard-3',
  title: 'Dashboard 3',
  description: 'This is dashboard 3',
};

jest.mock('@kbn/triggers-actions-ui-plugin/public', () => ({
  __esModule: true,
  useKibana: jest.fn(() => mockUseKibanaReturnValue),
}));

const mockUseQuery = jest.fn();
jest.mock('@kbn/react-query', () => ({
  useQuery: (params: { queryKey: string[]; queryFn: () => Promise<any> }) => mockUseQuery(params),
}));

describe('useRelatedDashboards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseKibanaReturnValue.services.http.get.mockClear();

    // Default mock setup for loading state
    mockUseQuery.mockImplementation(
      (params: { queryKey: string[]; queryFn: () => Promise<any> }) => {
        capturedQueryFn = params.queryFn;
        return {
          data: undefined,
          isLoading: true,
        };
      }
    );
  });

  it('should have isLoadingSuggestedDashboards as true and suggestedDashboards as undefined when loading', () => {
    const { result } = renderHook(() => useRelatedDashboards(TEST_ALERT_ID));

    expect(result.current.isLoadingRelatedDashboards).toBe(true);
    expect(result.current.suggestedDashboards).toBeUndefined();
  });

  it('should call http.get with the correct URL and parameters', async () => {
    renderHook(() => useRelatedDashboards(TEST_ALERT_ID));

    // Call the captured queryFn to trigger the HTTP request
    await capturedQueryFn!();

    expect(mockUseKibanaReturnValue.services.http.get).toHaveBeenCalledWith(API_ENDPOINT, {
      query: { alertId: TEST_ALERT_ID },
    });
  });

  it('should be enabled by default when an alertId is provided', () => {
    renderHook(() => useRelatedDashboards(TEST_ALERT_ID));

    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('should be disabled when enabled is false (e.g. user cannot read the rule)', () => {
    renderHook(() => useRelatedDashboards(TEST_ALERT_ID, { enabled: false }));

    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('should be disabled when no alertId is provided', () => {
    renderHook(() => useRelatedDashboards(''));

    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('should return suggested and linked dashboards', () => {
    const mockApiResponse = {
      suggestedDashboards: [
        {
          id: TEST_DASHBOARD_1.id,
          title: TEST_DASHBOARD_1.title,
          description: TEST_DASHBOARD_1.description,
          createdAt: '2023-01-01',
        },
        {
          id: TEST_DASHBOARD_2.id,
          title: TEST_DASHBOARD_2.title,
          description: TEST_DASHBOARD_2.description,
          updatedAt: '2023-01-02',
        },
      ],
      linkedDashboards: [
        {
          id: TEST_DASHBOARD_3.id,
          title: TEST_DASHBOARD_3.title,
          description: TEST_DASHBOARD_3.description,
          createdAt: '2023-01-01',
        },
      ],
    };

    mockUseQuery.mockReturnValue({
      data: mockApiResponse,
      isLoading: false,
    });

    const { result } = renderHook(() => useRelatedDashboards(TEST_ALERT_ID));

    expect(result.current.isLoadingRelatedDashboards).toBe(false);
    expect(result.current.suggestedDashboards).toEqual([
      {
        id: TEST_DASHBOARD_1.id,
        title: TEST_DASHBOARD_1.title,
        description: TEST_DASHBOARD_1.description,
        createdAt: '2023-01-01',
      },
      {
        id: TEST_DASHBOARD_2.id,
        title: TEST_DASHBOARD_2.title,
        description: TEST_DASHBOARD_2.description,
        updatedAt: '2023-01-02',
      },
    ]);
    expect(result.current.linkedDashboards).toEqual([
      {
        id: TEST_DASHBOARD_3.id,
        title: TEST_DASHBOARD_3.title,
        description: TEST_DASHBOARD_3.description,
        createdAt: '2023-01-01',
      },
    ]);
  });
});
