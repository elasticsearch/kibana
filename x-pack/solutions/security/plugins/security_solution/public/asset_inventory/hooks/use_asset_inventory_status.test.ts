/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { of } from 'rxjs';
import { useAssetInventoryStatus } from './use_asset_inventory_status';
import { createTestProviderWrapper } from '../test/test_provider';

// Mocks for the composed dependencies
const mockEntityStoreStatusQuery = {
  data: undefined as unknown,
  isLoading: false,
  refetch: jest.fn(),
};
const mockUseUiSetting = jest.fn();
const mockIsExperimentalFeatureEnabled = jest.fn();
const mockFetchEntityStoreV2Privileges = jest.fn();
const mockSearch = jest.fn();
const mockPostInstallAssetInventoryDataView = jest.fn();

jest.mock('../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      data: {
        search: { search: mockSearch },
      },
    },
  }),
  useUiSetting: (...args: unknown[]) => mockUseUiSetting(...args),
}));

jest.mock('../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: (...args: unknown[]) =>
    mockIsExperimentalFeatureEnabled(...args),
}));

jest.mock('../../entity_analytics/components/entity_store/hooks/use_entity_store', () => ({
  useEntityStoreStatus: () => mockEntityStoreStatusQuery,
}));

jest.mock('../../entity_analytics/api/api', () => ({
  useEntityAnalyticsRoutes: () => ({
    fetchEntityStoreV2Privileges: mockFetchEntityStoreV2Privileges,
  }),
}));

jest.mock('./use_asset_inventory_routes', () => ({
  useAssetInventoryRoutes: () => ({
    postInstallAssetInventoryDataView: mockPostInstallAssetInventoryDataView,
  }),
}));

const SECURITY_SOLUTION_ENABLE_ASSET_INVENTORY_SETTING = 'securitySolution:enableAssetInventory';

const setUiSettings = ({ assetInventory }: { assetInventory: boolean }) => {
  mockUseUiSetting.mockImplementation((key: string) => {
    if (key === SECURITY_SOLUTION_ENABLE_ASSET_INVENTORY_SETTING) return assetInventory;
    return false;
  });
};

const setHasDocs = (hasDocs: boolean) => {
  mockSearch.mockReturnValue(
    of({
      rawResponse: {
        hits: {
          total: { value: hasDocs ? 1 : 0, relation: 'eq' },
        },
      },
    })
  );
};

const setPrivileges = (privileges: { has_all_required: boolean } | undefined) => {
  mockFetchEntityStoreV2Privileges.mockResolvedValue(privileges);
};

const setEntityStoreStatus = (status: {
  status: 'not_installed' | 'installing' | 'running' | 'stopped' | 'error';
  engines?: Array<{ type: string; status?: string; components?: unknown[] }>;
}) => {
  mockEntityStoreStatusQuery.data = { engines: [], ...status };
};

const renderStatusHook = () =>
  renderHook(() => useAssetInventoryStatus(), {
    wrapper: createTestProviderWrapper(),
  });

describe('useAssetInventoryStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUiSettings({ assetInventory: true });
    mockIsExperimentalFeatureEnabled.mockReturnValue(true);
    setHasDocs(false);
    setPrivileges({ has_all_required: true });
    setEntityStoreStatus({ status: 'not_installed', engines: [] });
    mockEntityStoreStatusQuery.isLoading = false;
  });

  it('returns inactive_feature when the asset-inventory ui setting is disabled', async () => {
    setUiSettings({ assetInventory: false });

    const { result } = renderStatusHook();

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'inactive_feature' });
    });
  });

  it('returns entity_store_v2_disabled when the entity-store v2 experimental flag is disabled', async () => {
    mockIsExperimentalFeatureEnabled.mockReturnValue(false);

    const { result } = renderStatusHook();

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'entity_store_v2_disabled' });
    });
  });

  it('returns ready when the has-docs query resolves to true and triggers the data view install', async () => {
    setHasDocs(true);
    mockPostInstallAssetInventoryDataView.mockResolvedValue({});

    const { result } = renderStatusHook();

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'ready' });
    });
    expect(mockPostInstallAssetInventoryDataView).toHaveBeenCalled();
  });

  it('returns insufficient_privileges when the user is missing entity-store privileges and there are no docs', async () => {
    const privileges = { has_all_required: false };
    setHasDocs(false);
    setPrivileges(privileges);

    const { result } = renderStatusHook();

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'insufficient_privileges', privileges });
    });
  });

  it('returns disabled when the entity store is not installed', async () => {
    setHasDocs(false);
    setEntityStoreStatus({ status: 'not_installed', engines: [] });

    const { result } = renderStatusHook();

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'disabled' });
    });
  });

  it('returns initializing when the entity store is installing', async () => {
    setHasDocs(false);
    setEntityStoreStatus({ status: 'installing', engines: [] });

    const { result } = renderStatusHook();

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'initializing' });
    });
  });

  it('returns disabled when the generic engine is missing from a running store', async () => {
    setHasDocs(false);
    setEntityStoreStatus({
      status: 'running',
      engines: [{ type: 'host', status: 'started' }],
    });

    const { result } = renderStatusHook();

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'disabled' });
    });
  });

  it('returns empty when the generic engine task has executed with no docs', async () => {
    setHasDocs(false);
    setEntityStoreStatus({
      status: 'running',
      engines: [
        {
          type: 'generic',
          components: [{ resource: 'task', runs: 1, status: 'success', remainingLogsToExtract: 0 }],
        },
      ],
    });

    const { result } = renderStatusHook();

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'empty' });
    });
  });

  it('returns initializing when the generic engine task has not yet executed', async () => {
    setHasDocs(false);
    setEntityStoreStatus({
      status: 'running',
      engines: [
        {
          type: 'generic',
          components: [{ resource: 'task', runs: 0, status: 'idle', remainingLogsToExtract: null }],
        },
      ],
    });

    const { result } = renderStatusHook();

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'initializing' });
    });
  });
});
