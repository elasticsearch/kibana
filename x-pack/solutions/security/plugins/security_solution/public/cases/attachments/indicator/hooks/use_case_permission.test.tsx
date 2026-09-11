/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React from 'react';
import type { RenderHookResult } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { casesPluginMock } from '@kbn/cases-plugin/public/mocks';
import { useCaseDisabled } from './use_case_permission';
import { TestProvidersComponent } from '../../../../threat_intelligence/mocks/test_providers';
import { EMPTY_VALUE } from '../../../../threat_intelligence/constants/common';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { APP_ID } from '../../../../../common/constants';

const casesServiceMock = casesPluginMock.createStartContract();

const mockCanUseCases = jest.fn();

const getProviderComponent =
  (mockedServices: unknown) =>
  // eslint-disable-next-line react/display-name
  ({ children }: { children: ReactNode }) =>
    (
      <TestProvidersComponent>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <KibanaContextProvider services={mockedServices as any}>{children}</KibanaContextProvider>
      </TestProvidersComponent>
    );

const getMockedServices = (permissions: object) => ({
  cases: {
    ...casesServiceMock,
    helpers: {
      ...casesServiceMock.helpers,
      canUseCases: mockCanUseCases.mockReturnValue(permissions),
    },
  },
});

describe('useCasePermission', () => {
  let hookResult: RenderHookResult<boolean, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls canUseCases scoped to the securitySolution owner', () => {
    const ProviderComponent = getProviderComponent(
      getMockedServices({ createComment: true, read: true })
    );
    renderHook(() => useCaseDisabled('abc'), { wrapper: ProviderComponent });
    expect(mockCanUseCases).toHaveBeenCalledWith([APP_ID]);
  });

  it('should return false if user has correct permissions and indicator has a name', () => {
    const ProviderComponent = getProviderComponent(
      getMockedServices({ createComment: true, read: true })
    );

    hookResult = renderHook(() => useCaseDisabled('abc'), { wrapper: ProviderComponent });
    expect(hookResult.result.current).toEqual(false);
  });

  it(`should return true if user doesn't have correct permissions`, () => {
    const ProviderComponent = getProviderComponent(
      getMockedServices({ createComment: false, read: true })
    );

    hookResult = renderHook(() => useCaseDisabled('abc'), { wrapper: ProviderComponent });
    expect(hookResult.result.current).toEqual(true);
  });

  it('should return true if indicator name is missing or empty', () => {
    const ProviderComponent = getProviderComponent(
      getMockedServices({ createComment: true, read: true })
    );

    hookResult = renderHook(() => useCaseDisabled(EMPTY_VALUE), { wrapper: ProviderComponent });
    expect(hookResult.result.current).toEqual(true);
  });
});
