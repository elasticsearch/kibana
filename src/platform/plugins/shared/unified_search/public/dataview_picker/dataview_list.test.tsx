/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { DataViewListItemEnhanced, DataViewsListProps } from './dataview_list';
import { DataViewsList } from './dataview_list';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ESQL_TYPE } from '@kbn/data-view-utils';

// Mock DOM measurement functions to prevent EUI truncation width errors
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  value: 500,
});

Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
  configurable: true,
  value: 400,
});

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  value: 500,
});

describe('DataView list component', () => {
  const list = [
    {
      id: 'dataview-1',
      title: 'dataview-1',
    },
    {
      id: 'dataview-2',
      title: 'dataview-2',
    },
  ];
  const changeDataViewSpy = jest.fn();
  let props: DataViewsListProps;

  // Helper to render with proper container dimensions
  const renderWithContainer = (element: React.ReactElement) => {
    return render(<div style={{ width: '400px', height: '300px' }}>{element}</div>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    props = {
      currentDataViewId: 'dataview-1',
      onChangeDataView: changeDataViewSpy,
      dataViewsList: list,
    };
  });

  it('sorts alphabetically the items', async () => {
    const listWithEmptyName: DataViewListItemEnhanced[] = [
      { id: 'dataview-1', title: 'beta', name: '' },
      { id: 'dataview-2', title: 'alpha' },
      { id: 'dataview-3', title: 'gamma', name: 'gamma' },
    ];

    renderWithContainer(
      <DataViewsList {...props} dataViewsList={listWithEmptyName} currentDataViewId="dv-1" />
    );

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(3);

      // Check that options are sorted alphabetically
      expect(options[0]).toHaveTextContent('alpha');
      expect(options[1]).toHaveTextContent('beta');
      expect(options[2]).toHaveTextContent('gamma');
    });
  });

  it('should trigger the onChangeDataView if a new dataview is selected', async () => {
    const user = userEvent.setup();
    renderWithContainer(<DataViewsList {...props} />);

    // Find the dataview option and click it
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /^dataview-2 / })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('option', { name: /^dataview-2 / }));

    expect(changeDataViewSpy).toHaveBeenCalledWith('dataview-2');
  });

  it('should list all dataviews', async () => {
    renderWithContainer(<DataViewsList {...props} />);

    // Verify both dataviews are visible as options
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
      expect(screen.getByRole('option', { name: /^dataview-1 / })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /^dataview-2 / })).toBeInTheDocument();
    });
  });

  describe('ad hoc data views', () => {
    const runAdHocDataViewTest = async (esqlDataViews: DataViewListItemEnhanced[] = []) => {
      const dataViewList = [
        ...list,
        {
          id: 'dataview-3',
          title: 'dataview-3',
          isAdhoc: true,
        },
        ...esqlDataViews,
      ];

      renderWithContainer(<DataViewsList {...props} dataViewsList={dataViewList} />);

      // Verify the expected dataviews are visible as options
      await waitFor(() => {
        expect(screen.getAllByRole('option')).toHaveLength(3);
        expect(screen.getByRole('option', { name: /^dataview-1 / })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /^dataview-2 / })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /^dataview-3 / })).toBeInTheDocument();
      });
    };

    const esqlDataViews: DataViewListItemEnhanced[] = [
      {
        id: 'dataview-4',
        title: 'dataview-4',
        type: ESQL_TYPE,
        isAdhoc: true,
      },
    ];

    it('should show ad hoc data views for data view mode', async () => {
      await runAdHocDataViewTest();
    });

    it('should not show ES|QL ad hoc data views for data view mode', async () => {
      const dataViewList = [
        ...list,
        {
          id: 'dataview-3',
          title: 'dataview-3',
          isAdhoc: true,
        },
        ...esqlDataViews,
      ];

      renderWithContainer(<DataViewsList {...props} dataViewsList={dataViewList} />);

      await waitFor(() => {
        // Regular dataviews should be visible
        expect(screen.getAllByRole('option')).toHaveLength(3);
        expect(screen.getByRole('option', { name: /^dataview-1 / })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /^dataview-2 / })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /^dataview-3 / })).toBeInTheDocument();

        // ES|QL dataview should not be visible (filtered out)
        expect(screen.queryByRole('option', { name: /^dataview-4 / })).not.toBeInTheDocument();
      });
    });
  });

  it('should handle empty dataviews list', async () => {
    renderWithContainer(<DataViewsList {...props} dataViewsList={[]} />);

    // Find the search input using the correct role
    const searchInput = screen.getByRole('searchbox');
    expect(searchInput).toBeInTheDocument();

    // The component should render even with empty list
    expect(screen.queryByRole('option', { name: /^dataview-1 / })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^dataview-2 / })).not.toBeInTheDocument();

    // Should show "No options available" message - use getAllByText since there are multiple instances
    const noOptionsMessages = screen.getAllByText('No options available');
    expect(noOptionsMessages.length).toBeGreaterThan(0);
  });

  it('should handle search functionality', async () => {
    const user = userEvent.setup();
    renderWithContainer(<DataViewsList {...props} />);

    // Verify both options are initially visible
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
      expect(screen.getByRole('option', { name: /^dataview-1 / })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /^dataview-2 / })).toBeInTheDocument();
    });

    // When the list has items, the input has role "combobox" (not "searchbox")
    const searchInput = screen.getByRole('combobox');

    // Clear and type to filter options
    await user.clear(searchInput);
    await user.type(searchInput, 'dataview-1');

    await waitFor(() => {
      // Only matching dataview should be visible
      expect(screen.getByRole('option', { name: /^dataview-1 / })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /^dataview-2 / })).not.toBeInTheDocument();
    });
  });
});
