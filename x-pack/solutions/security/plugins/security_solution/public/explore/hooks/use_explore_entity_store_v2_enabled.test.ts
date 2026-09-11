/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useUiSetting } from '@kbn/kibana-react-plugin/public';
import { useIsEntityStoreV2Available } from '../../flyout/shared/hooks/use_is_entity_store_v2_available';
import { useExploreEntityStoreV2Enabled } from './use_explore_entity_store_v2_enabled';

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  ...jest.requireActual('@kbn/kibana-react-plugin/public'),
  useUiSetting: jest.fn(),
}));
jest.mock('../../flyout/shared/hooks/use_is_entity_store_v2_available');

const mockUseUiSetting = useUiSetting as jest.MockedFunction<typeof useUiSetting>;
const mockUseIsEntityStoreV2Available = useIsEntityStoreV2Available as jest.Mock;

describe('useExploreEntityStoreV2Enabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUiSetting.mockReturnValue(true);
    mockUseIsEntityStoreV2Available.mockReturnValue({
      data: { indexExists: true },
      isLoading: false,
    });
  });

  it('returns true when the UI setting is on and the entity-store index exists', () => {
    const { result } = renderHook(() => useExploreEntityStoreV2Enabled());
    expect(result.current).toBe(true);
  });

  it('returns false when the UI setting is off', () => {
    mockUseUiSetting.mockReturnValue(false);

    const { result } = renderHook(() => useExploreEntityStoreV2Enabled());
    expect(result.current).toBe(false);
  });

  it('returns false when the entity-store index is missing', () => {
    mockUseIsEntityStoreV2Available.mockReturnValue({
      data: { indexExists: false },
      isLoading: false,
    });

    const { result } = renderHook(() => useExploreEntityStoreV2Enabled());
    expect(result.current).toBe(false);
  });

  it('returns false while the index probe is loading', () => {
    mockUseIsEntityStoreV2Available.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { result } = renderHook(() => useExploreEntityStoreV2Enabled());
    expect(result.current).toBe(false);
  });
});
