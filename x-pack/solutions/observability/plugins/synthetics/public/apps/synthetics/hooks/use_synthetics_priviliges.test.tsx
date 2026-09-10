/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import React from 'react';
import { render, WrappedHelper } from '../utils/testing';
import { useCanReadSyntheticsIndex } from '../../../hooks/use_capabilities';
import { useSyntheticsPrivileges } from './use_synthetics_priviliges';

jest.mock('../../../hooks/use_capabilities', () => ({
  useCanReadSyntheticsIndex: jest.fn().mockReturnValue({ canRead: true, loading: false }),
}));

const mockUseCanReadSyntheticsIndex = useCanReadSyntheticsIndex as jest.MockedFunction<
  typeof useCanReadSyntheticsIndex
>;

jest.mock('react-redux-v7', () => {
  const actual = jest.requireActual('react-redux-v7');
  return {
    ...actual,
    useSelector: jest.fn().mockReturnValue({ error: { body: { message: 'License not active' } } }),
  };
});

function wrapper({ children }: React.PropsWithChildren) {
  return <WrappedHelper>{children}</WrappedHelper>;
}

describe('useSyntheticsPrivileges', () => {
  afterEach(() => {
    mockUseCanReadSyntheticsIndex.mockReturnValue({ canRead: true, loading: false });
  });

  it('shows a loading spinner while index privileges are being checked', () => {
    mockUseCanReadSyntheticsIndex.mockReturnValue({ canRead: undefined, loading: true });

    const {
      result: { current },
    } = renderHook(() => useSyntheticsPrivileges(), { wrapper });

    const { getByTestId } = render(current!);
    expect(getByTestId('syntheticsPrivilegesLoading')).toBeInTheDocument();
  });

  it('shows the unprivileged empty state when the user cannot read synthetics-*', () => {
    mockUseCanReadSyntheticsIndex.mockReturnValue({ canRead: false, loading: false });

    const {
      result: { current },
    } = renderHook(() => useSyntheticsPrivileges(), { wrapper });

    const { getByTestId } = render(current!);
    expect(getByTestId('syntheticsUnprivileged')).toBeInTheDocument();
  });

  it.each([
    [true, null],
    [false, ''],
  ])(
    'should correctly set the disabled prop of the license nav button if `licenseManagement` enabled is %s',
    (enabled, expectedDisabledAttribute) => {
      const {
        result: { current },
      } = renderHook(() => useSyntheticsPrivileges(), { wrapper });

      expect(current).not.toBeUndefined();

      const { getByLabelText } = render(current!, {
        core: {
          licenseManagement: { enabled },
        },
      });

      const licenseNavButton = getByLabelText('Navigate to license management');

      expect(licenseNavButton);

      // there should only be an href if the license management is enabled, otherwise we render a disabled button with no handler
      expect(!!licenseNavButton.getAttribute('href')).toEqual(enabled);
      expect(licenseNavButton.getAttribute('disabled')).toEqual(expectedDisabledAttribute);
    }
  );
});
