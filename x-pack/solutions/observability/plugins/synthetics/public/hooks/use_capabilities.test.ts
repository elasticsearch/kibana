/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { FETCH_STATUS, useFetcher } from '@kbn/observability-shared-plugin/public';
import { SYNTHETICS_API_URLS } from '../../common/constants';
import { apiService } from '../utils/api_service';
import { useCanReadSyntheticsIndex } from './use_capabilities';

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  FETCH_STATUS: jest.requireActual('@kbn/observability-shared-plugin/public').FETCH_STATUS,
  useFetcher: jest.fn(),
}));

jest.mock('../utils/api_service', () => ({
  apiService: { get: jest.fn() },
}));

const mockUseFetcher = useFetcher as jest.MockedFunction<typeof useFetcher>;
const mockApiGet = apiService.get as jest.MockedFunction<typeof apiService.get>;

describe('useCanReadSyntheticsIndex', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns canRead from the index privileges API', async () => {
    mockUseFetcher.mockReturnValue({
      data: { canRead: false },
      loading: false,
      status: FETCH_STATUS.SUCCESS,
      refetch: jest.fn(),
    });
    mockApiGet.mockResolvedValue({ canRead: false });

    const { result } = renderHook(() => useCanReadSyntheticsIndex());

    expect(result.current.canRead).toBe(false);
    const [fetch] = mockUseFetcher.mock.calls[0];
    await fetch({ signal: new AbortController().signal });
    expect(mockApiGet).toHaveBeenCalledWith(SYNTHETICS_API_URLS.INDEX_PRIVILEGES);
  });
});
