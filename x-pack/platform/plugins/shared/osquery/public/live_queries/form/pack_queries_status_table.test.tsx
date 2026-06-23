/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { EuiProvider } from '@elastic/eui';

import { PackQueriesStatusTable } from './pack_queries_status_table';
import { useIsExperimentalFeatureEnabled } from '../../common/experimental_features_context';
import { useExportFiltersContext } from '../../results/export_filters_context';
import type { ExportFiltersStore } from '../../results/export_filters_context';

jest.mock('../../common/experimental_features_context');

// `PackQueriesStatusTable` wraps its own `ExportFiltersProvider` internally, so
// the store the toggle handler clears is the one supplied by that internal
// provider — not anything the test renders around it. Spy on the hook to
// capture that exact store instance.
jest.mock('../../results/export_filters_context', () => {
  const actual = jest.requireActual('../../results/export_filters_context');

  return {
    ...actual,
    useExportFiltersContext: jest.fn(actual.useExportFiltersContext),
  };
});

const useExportFiltersContextMock = useExportFiltersContext as jest.MockedFunction<
  typeof useExportFiltersContext
>;
jest.mock('../../routes/saved_queries/edit/tabs', () => ({
  ResultTabs: () => <div data-test-subj="mock-result-tabs" />,
}));
jest.mock('./query_details_flyout', () => ({
  QueryDetailsFlyout: () => null,
}));
jest.mock('./pack_results_header', () => ({
  PackResultsHeader: () => null,
}));
jest.mock('../../lens/pack_view_in_lens', () => ({
  PackViewInLensAction: () => null,
}));
jest.mock('../../discover/pack_view_in_discover', () => ({
  PackViewInDiscoverAction: () => null,
}));
jest.mock('../../cases/add_to_cases', () => ({
  AddToCaseWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../timelines/add_to_timeline_button', () => ({
  AddToTimelineButton: () => null,
}));
jest.mock('../../actions/components/tags_column', () => ({
  TagsColumn: () => null,
}));
jest.mock('./row_kebab_menu', () => ({
  RowKebabMenu: () => null,
}));

const useIsExperimentalFeatureEnabledMock = useIsExperimentalFeatureEnabled as jest.MockedFunction<
  typeof useIsExperimentalFeatureEnabled
>;

const renderWithContext = (Element: React.ReactElement) =>
  render(
    <EuiProvider>
      <IntlProvider locale="en">{Element}</IntlProvider>
    </EuiProvider>
  );

/** The store instance the internal `ExportFiltersProvider` handed to the component. */
const capturedStore = (): ExportFiltersStore => {
  const store = useExportFiltersContextMock.mock.results
    .map((r) => r.value)
    .find((v): v is ExportFiltersStore => Boolean(v));
  if (!store) throw new Error('export filters store was never provided to the component');

  return store;
};

const twoItemData = [
  {
    id: 'query-1',
    action_id: 'action-query-1',
    query: 'SELECT 1;',
    agents: ['agent-1'],
    docs: 5,
    status: 'completed',
    pending: 0,
  },
  {
    id: 'query-2',
    action_id: 'action-query-2',
    query: 'SELECT 2;',
    agents: ['agent-1'],
    docs: 3,
    status: 'completed',
    pending: 0,
  },
];

describe('PackQueriesStatusTable — export filters store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useIsExperimentalFeatureEnabledMock.mockReturnValue(true);
  });

  it('clears the store entry for a row when it is collapsed, but not when it is expanded', () => {
    renderWithContext(
      <PackQueriesStatusTable
        actionId="parent-action-id"
        agentIds={['agent-1']}
        data={twoItemData}
      />
    );

    const store = capturedStore();

    // Seed an entry so there is state to clear, mirroring a populated Results tab.
    act(() => {
      store.setFilters('action-query-1', { total: 5, filteredTotal: 5 });
    });
    expect(store.getFilters('action-query-1')).toBeDefined();

    const toggleButton = screen.getByTestId('toggleIcon-query-1');

    // Expand row 1 — must NOT clear (this is the tab-switch-safe path: the
    // Results table mounting/unmounting underneath no longer drops the entry).
    act(() => {
      fireEvent.click(toggleButton);
    });
    expect(screen.getByTestId('mock-result-tabs')).toBeInTheDocument();
    expect(store.getFilters('action-query-1')).toBeDefined();

    // Collapse row 1 — the owner of expand/collapse state clears the entry.
    act(() => {
      fireEvent.click(toggleButton);
    });
    expect(screen.queryByTestId('mock-result-tabs')).not.toBeInTheDocument();
    expect(store.getFilters('action-query-1')).toBeUndefined();
  });
});
