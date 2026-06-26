/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EntityType } from '../../../../common/entity_analytics/types';
import {
  renderMutation,
  renderQuery,
  renderWrappedHook,
} from '../../../management/hooks/test_utils';
import type { Entity } from './use_asset_criticality';
import { useAssetCriticalityPrivileges, useAssetCriticalityData } from './use_asset_criticality';

const mockFetchAssetCriticalityPrivileges = jest.fn().mockResolvedValue({});
const mockFetchEntityStoreV2Privileges = jest.fn().mockResolvedValue({});
const mockFetchAssetCriticality = jest.fn().mockResolvedValue({});
const mockDeleteAssetCriticality = jest.fn().mockResolvedValue({});
const mockCreateAssetCriticality = jest.fn().mockResolvedValue({});
jest.mock('../../api/api', () => ({
  useEntityAnalyticsRoutes: () => ({
    fetchAssetCriticalityPrivileges: mockFetchAssetCriticalityPrivileges,
    fetchEntityStoreV2Privileges: mockFetchEntityStoreV2Privileges,
    fetchAssetCriticality: mockFetchAssetCriticality,
    deleteAssetCriticality: mockDeleteAssetCriticality,
    createAssetCriticality: mockCreateAssetCriticality,
  }),
}));

const mockUseHasSecurityCapability = jest.fn().mockReturnValue(false);
jest.mock('../../../helper_hooks', () => ({
  useHasSecurityCapability: () => mockUseHasSecurityCapability(),
}));

describe('useAssetCriticality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useAssetCriticalityPrivileges', () => {
    it('does not call any privileges API when hasEntityAnalyticsCapability is false', async () => {
      mockUseHasSecurityCapability.mockReturnValue(false);

      await renderQuery(() => useAssetCriticalityPrivileges('test_entity_name'), 'isSuccess');

      expect(mockFetchEntityStoreV2Privileges).not.toHaveBeenCalled();
      expect(mockFetchAssetCriticalityPrivileges).not.toHaveBeenCalled();
    });

    it('calls entity store v2 privileges API when hasEntityAnalyticsCapability is true', async () => {
      mockUseHasSecurityCapability.mockReturnValue(true);

      await renderQuery(() => useAssetCriticalityPrivileges('test_entity_name'), 'isSuccess');

      expect(mockFetchEntityStoreV2Privileges).toHaveBeenCalled();
      expect(mockFetchAssetCriticalityPrivileges).not.toHaveBeenCalled();
    });
  });

  describe('useAssetCriticalityData', () => {
    it('calls delete api when the mutation is called with unassigned criticality level', async () => {
      mockFetchEntityStoreV2Privileges.mockResolvedValue({ has_all_required: true });
      mockDeleteAssetCriticality.mockResolvedValue({});
      mockCreateAssetCriticality.mockResolvedValue({});
      const entity: Entity = { name: 'test_entity_name', type: EntityType.host };

      const { mutation } = await renderWrappedHook(() => useAssetCriticalityData({ entity }));

      await renderMutation(async () =>
        mutation.mutate({
          idField: 'test_entity_type.name',
          idValue: 'test_entity_name',
          criticalityLevel: 'unassigned',
        })
      );

      expect(mockDeleteAssetCriticality).toHaveBeenCalled();
    });

    it('calls create api when the mutation is called with assigned criticality level', async () => {
      mockFetchEntityStoreV2Privileges.mockResolvedValue({ has_all_required: true });
      mockDeleteAssetCriticality.mockResolvedValue({});
      mockCreateAssetCriticality.mockResolvedValue({});
      const entity: Entity = { name: 'test_entity_name', type: EntityType.host };

      const { mutation } = await renderWrappedHook(() => useAssetCriticalityData({ entity }));

      await renderMutation(async () =>
        mutation.mutate({
          idField: 'test_entity_type.name',
          idValue: 'test_entity_name',
          criticalityLevel: 'critical',
        })
      );

      expect(mockCreateAssetCriticality).toHaveBeenCalled();
    });
  });
});
