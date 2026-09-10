/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { FETCH_STATUS, useFetcher } from '@kbn/observability-shared-plugin/public';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../common/constants';
import { useCanReadSyntheticsIndex } from '../../../hooks/use_capabilities';
import { SyntheticsDataViewContextProvider } from './synthetics_data_view_context';

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  FETCH_STATUS: jest.requireActual('@kbn/observability-shared-plugin/public').FETCH_STATUS,
  useFetcher: jest.fn(),
}));

jest.mock('../../../hooks/use_capabilities', () => ({
  useCanReadSyntheticsIndex: jest.fn(),
}));

const mockUseFetcher = useFetcher as jest.MockedFunction<typeof useFetcher>;
const mockUseCanReadSyntheticsIndex = useCanReadSyntheticsIndex as jest.MockedFunction<
  typeof useCanReadSyntheticsIndex
>;

describe('SyntheticsDataViewContextProvider', () => {
  afterEach(() => jest.clearAllMocks());

  const renderProvider = (create: jest.Mock) => {
    mockUseFetcher.mockReturnValue({
      data: undefined,
      loading: false,
      status: FETCH_STATUS.NOT_INITIATED,
      refetch: jest.fn(),
    });
    render(
      <SyntheticsDataViewContextProvider dataViews={{ create } as never}>
        <div />
      </SyntheticsDataViewContextProvider>
    );
    return mockUseFetcher.mock.calls[0][0];
  };

  it('does not create a data view when the user cannot read synthetics-*', () => {
    mockUseCanReadSyntheticsIndex.mockReturnValue({ canRead: false, loading: false });
    const create = jest.fn();
    const fetch = renderProvider(create);

    expect(fetch({ signal: new AbortController().signal })).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a data view when the user can read synthetics-*', async () => {
    mockUseCanReadSyntheticsIndex.mockReturnValue({ canRead: true, loading: false });
    const dataView = { id: 'dv' };
    const create = jest.fn().mockResolvedValue(dataView);
    const fetch = renderProvider(create);

    await expect(fetch({ signal: new AbortController().signal })).resolves.toBe(dataView);
    expect(create).toHaveBeenCalledWith({ title: SYNTHETICS_INDEX_PATTERN });
  });
});
