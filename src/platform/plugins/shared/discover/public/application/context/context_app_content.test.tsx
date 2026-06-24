/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import type { GetStateReturn } from './services/context_state';
import type { SortDirection } from '@kbn/data-plugin/public';
import type { ContextAppContentProps } from './context_app_content';
import { ContextAppContent } from './context_app_content';
import { LoadingStatus } from './services/context_query_state';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { buildDataViewMock, deepMockedFields } from '@kbn/discover-utils/src/__mocks__';
import { DiscoverTestProvider } from '../../__mocks__/test_provider';

const dataViewMock = buildDataViewMock({
  name: 'the-data-view',
  fields: deepMockedFields,
});

describe('ContextAppContent test', () => {
  const renderComponent = async (overrides: Partial<ContextAppContentProps> = {}) => {
    const hit = {
      _id: '123',
      _index: 'test_index',
      _score: null,
      _version: 1,
      fields: [
        {
          order_date: ['2020-10-19T13:35:02.000Z'],
        },
      ],
      _source: {
        category: ["Men's Clothing"],
        currency: 'EUR',
        customer_first_name: 'Walker',
        customer_full_name: 'Walker Texas Ranger',
        customer_gender: 'MALE',
        customer_last_name: 'Ranger',
      },
      sort: [1603114502000, 2092],
    };
    const props = {
      columns: ['order_date', '_source'],
      dataView: dataViewMock,
      stateContainer: {} as unknown as GetStateReturn,
      anchorStatus: LoadingStatus.LOADED,
      predecessorsStatus: LoadingStatus.LOADED,
      successorsStatus: LoadingStatus.LOADED,
      rows: [buildDataTableRecord(hit, dataViewMock)],
      predecessors: [],
      successors: [],
      defaultStepSize: 5,
      predecessorCount: 10,
      successorCount: 10,
      isPaginationEnabled: false,
      onAddColumn: () => {},
      onRemoveColumn: () => {},
      onSetColumns: () => {},
      sort: [['order_date', 'desc']] as Array<[string, SortDirection]>,
      setAppState: () => {},
      addFilter: () => {},
      interceptedWarnings: [],
      ...overrides,
    } as unknown as ContextAppContentProps;
    renderWithKibanaRenderContext(
      <DiscoverTestProvider>
        <ContextAppContent {...props} />
      </DiscoverTestProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('unifiedDataTableToolbar')).toBeVisible();
    });
  };

  it('should render discover grid correctly', async () => {
    await renderComponent();

    expect(screen.getByTestId('discoverDocTable')).toBeVisible();
    expect(screen.getByTestId('unifiedDataTableToolbar')).toBeVisible();
  });

  it('should not show display options button', async () => {
    await renderComponent();

    expect(screen.getByTestId('unifiedDataTableToolbar')).toBeVisible();
    expect(screen.queryByTestId('dataGridDisplaySelectorButton')).not.toBeInTheDocument();
  });

  it('should reset column width in surrounding documents app state', async () => {
    const user = userEvent.setup();
    const setAppState = jest.fn();

    await renderComponent({
      grid: { columns: { _source: { width: 250 } } },
      setAppState,
    });

    await user.click(screen.getByTestId('dataGridHeaderCellActionButton-_source'));
    await waitForEuiPopoverOpen();
    await user.click(screen.getByTestId('unifiedDataTableResetColumnWidth'));

    expect(setAppState).toHaveBeenCalledWith({
      grid: { columns: { _source: {} } },
    });
  });
});
