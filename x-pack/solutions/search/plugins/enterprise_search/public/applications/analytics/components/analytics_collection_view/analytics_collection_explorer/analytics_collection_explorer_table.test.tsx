/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { ExploreTables } from '../analytics_collection_explore_table_types';

import { AnalyticsCollectionExplorerTable } from './analytics_collection_explorer_table';

describe('AnalyticsCollectionExplorerTable', () => {
  const mockActions = {
    onTableChange: jest.fn(),
    setPageIndex: jest.fn(),
    setPageSize: jest.fn(),
    setSearch: jest.fn(),
    setSelectedTable: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    setMockValues({ items: [], selectedTable: ExploreTables.Clicked });
    setMockActions(mockActions);
  });

  it('should set default selectedTable', async () => {
    setMockValues({ items: [], selectedTable: null });
    renderWithKibanaRenderContext(<AnalyticsCollectionExplorerTable />);

    await waitFor(() => {
      expect(mockActions.setSelectedTable).toHaveBeenCalledWith(ExploreTables.SearchTerms, {
        direction: 'desc',
        field: 'count',
      });
    });
  });

  it('should call setSelectedTable when click on a tab', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionExplorerTable />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);

    fireEvent.click(tabs[2]);
    expect(mockActions.setSelectedTable).toHaveBeenCalledWith(ExploreTables.WorsePerformers, {
      direction: 'desc',
      field: 'count',
    });
  });

  it('should call onTableChange when a sortable column header is clicked', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionExplorerTable />);

    fireEvent.click(screen.getByText('Count'));

    expect(mockActions.onTableChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: expect.objectContaining({ field: 'count' }) })
    );
  });
});
