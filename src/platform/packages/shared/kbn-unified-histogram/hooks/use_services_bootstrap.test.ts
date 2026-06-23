/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { dataViewWithTimefieldMock } from '../__mocks__/data_view_with_timefield';
import { unifiedHistogramServicesMock } from '../__mocks__/services';
import { getBreakdownField } from '@kbn/discover-utils';
import { useServicesBootstrap } from './use_services_bootstrap';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createStateService } from '../services/state_service';
import { useStateProps } from './use_state_props';
import type { UnifiedHistogramFetchParamsExternal } from '../types';
import { RequestAdapter } from '@kbn/inspector-plugin/common';

jest.mock('../services/state_service');
jest.mock('./use_state_props');
jest.mock('@kbn/discover-utils', () => ({
  ...jest.requireActual('@kbn/discover-utils/src/constants'),
  getBreakdownField: jest.fn(),
}));

const createStateServiceMock = createStateService as jest.MockedFunction<typeof createStateService>;
const useStatePropsMock = useStateProps as jest.MockedFunction<typeof useStateProps>;
const getBreakdownFieldMock = getBreakdownField as jest.MockedFunction<typeof getBreakdownField>;

describe('useServicesBootstrap', () => {
  const localStorageKeyPrefix = 'discover';
  const query = {
    esql: 'FROM index',
  };

  beforeEach(() => {
    useStatePropsMock.mockReturnValue({
      chart: {
        hidden: false,
        timeInterval: 'auto',
      },
    } as ReturnType<typeof useStateProps>);
  });

  it('should initialize', async () => {
    const hook = renderHook(() =>
      useServicesBootstrap(
        {
          services: unifiedHistogramServicesMock,
          localStorageKeyPrefix,
        },
        { enableLensVisService: true }
      )
    );

    expect(createStateServiceMock).toBeCalledTimes(1);
    expect(getBreakdownFieldMock).toBeCalledTimes(1);
    expect(useStatePropsMock).toBeCalledTimes(1);

    expect(hook.result.current.api).not.toBeUndefined();
    expect(hook.result.current.fetch$).not.toBeUndefined();
    expect(hook.result.current.fetchParams).toBeUndefined();
    expect(hook.result.current.hasValidFetchParams).toBe(false);
    expect(hook.result.current.stateProps).toEqual({
      chart: { hidden: false, timeInterval: 'auto' },
    });

    const subscriber = jest.fn();
    hook.result.current.fetch$.subscribe(subscriber);

    expect(subscriber).toBeCalledTimes(0);

    const fetchParamsExternal: UnifiedHistogramFetchParamsExternal = {
      searchSessionId: 'test-session',
      dataView: dataViewWithTimefieldMock,
      query,
      relativeTimeRange: { from: 'now-15m', to: 'now' },
      requestAdapter: new RequestAdapter(),
    };

    act(() => {
      hook.result.current.api.fetch(fetchParamsExternal);
    });

    await waitFor(() => {
      expect(hook.result.current.hasValidFetchParams).toBe(true);
    });
    expect(hook.result.current.fetchParams).toEqual(
      expect.objectContaining({
        searchSessionId: 'test-session',
        dataView: dataViewWithTimefieldMock,
        query,
      })
    );
    expect(hook.result.current.lensVisService).toBeDefined();
    expect(hook.result.current.lensVisServiceState).toBeDefined();
    expect(subscriber).toBeCalledTimes(1);
    expect(subscriber).toBeCalledWith({
      fetchParams: hook.result.current.fetchParams,
      lensVisServiceState: hook.result.current.lensVisServiceState,
    });
  });
});
