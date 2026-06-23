/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { WorkflowExecutionsPage } from './executions_page';
import { createStartServicesMock } from '../../mocks';
import { getTestProvider } from '../../shared/mocks/test_providers';

jest.mock('@kbn/alerts-ui-shared/src/alert_filter_controls/filter_group', () => ({
  FilterGroup: () => <div data-test-subj="filterGroupStub" />,
}));

jest.mock('@kbn/alerts-ui-shared/src/alert_filter_controls/loading', () => ({
  FilterGroupLoading: () => <div data-test-subj="filterGroupLoadingStub" />,
}));

jest.mock('@kbn/unified-data-table', () => {
  const actual = jest.requireActual('@kbn/unified-data-table');
  return {
    ...actual,
    UnifiedDataTable: () => <div data-test-subj="unifiedDataTableStub" />,
  };
});

jest.mock('@kbn/cell-actions', () => ({
  CellActionsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('WorkflowExecutionsPage', () => {
  it('renders the executions page with search, filters, and table', async () => {
    const services = createStartServicesMock();
    services.workflowsManagement.globalExecutionsView.enabled = true;
    services.spaces.getActiveSpace = jest.fn().mockResolvedValue({ id: 'default' });
    const SearchBarStub = () => <div data-test-subj="searchBarStub" />;
    services.unifiedSearch.ui.SearchBar = SearchBarStub;
    jest.mocked(services.http.get).mockResolvedValue({
      hits: { hits: [], total: { value: 0, relation: 'eq' } },
    });

    render(<WorkflowExecutionsPage />, { wrapper: getTestProvider({ services }) });

    expect(screen.getByTestId('workflowExecutionsPage')).toBeInTheDocument();
    expect(screen.getByTestId('workflowExecutionsPageContent')).toBeInTheDocument();
    expect(screen.getByTestId('searchBarStub')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('workflowExecutionsFilters')).toBeInTheDocument();
    });
    expect(screen.getByTestId('filterGroupStub')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('workflowExecutionsTableEmpty')).toBeInTheDocument();
    });
  });
});
