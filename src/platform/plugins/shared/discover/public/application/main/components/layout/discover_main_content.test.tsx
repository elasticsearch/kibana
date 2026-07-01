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
import { esHitsMock } from '@kbn/discover-utils/src/__mocks__';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import { FetchStatus } from '../../../types';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { DiscoverMainContentProps } from './discover_main_content';
import { DiscoverMainContent } from './discover_main_content';
import { VIEW_MODE } from '@kbn/saved-search-plugin/public';
import { getDiscoverInternalStateMock } from '../../../../__mocks__/discover_state.mock';
import { createDataSource } from '../../../../../common/data_sources';
import { DiscoverToolkitTestProvider } from '../../../../__mocks__/test_provider';
import type { DiscoverAppState } from '../../state_management/redux';
import { internalStateActions } from '../../state_management/redux';
import { createContextAwarenessMocks } from '../../../../context_awareness/__mocks__';
import { dataViewWithTimefieldMock } from '../../../../__mocks__/data_view_with_timefield';

jest.mock('../../../../components/view_mode_toggle', () => ({
  DocumentViewModeToggle: jest.fn(({ prepend }) => (
    <div data-test-subj="documentViewModeToggleMock">{prepend}</div>
  )),
}));

jest.mock('./discover_documents', () => ({
  DiscoverDocuments: jest.fn(({ viewModeToggle }) => (
    <div
      data-test-subj="discoverDocumentsMock"
      data-has-view-mode-toggle={String(Boolean(viewModeToggle))}
    >
      {viewModeToggle}
    </div>
  )),
}));

jest.mock('../field_stats_table', () => ({
  FieldStatisticsTab: jest.fn(() => <div data-test-subj="fieldStatisticsTabMock" />),
}));

jest.mock('../pattern_analysis/pattern_analysis_tab', () => ({
  PatternAnalysisTab: jest.fn(() => <div data-test-subj="patternAnalysisTabMock" />),
}));

jest.mock('../../../../components/panels_toggle', () => ({
  PanelsToggle: jest.fn(({ omitChartButton, omitTableButton }) => (
    <div
      data-test-subj="panelsToggleMock"
      data-omit-chart-button={String(omitChartButton)}
      data-omit-table-button={String(omitTableButton)}
    />
  )),
}));

const dataView = dataViewWithTimefieldMock;

const renderComponent = async ({
  hideChart = false,
  isEsqlMode = false,
  isChartAvailable,
  viewMode = VIEW_MODE.DOCUMENT_LEVEL,
}: {
  hideChart?: boolean;
  isEsqlMode?: boolean;
  isChartAvailable?: boolean;
  viewMode?: VIEW_MODE;
} = {}) => {
  const { profilesManagerMock } = createContextAwarenessMocks({ shouldRegisterProviders: false });
  const services = createDiscoverServicesMock();

  services.profilesManager = profilesManagerMock;

  const toolkit = getDiscoverInternalStateMock({
    services,
    persistedDataViews: [dataView],
  });

  await toolkit.initializeTabs();

  const query: DiscoverAppState['query'] = isEsqlMode
    ? { esql: 'from *' }
    : { query: '', language: 'kuery' };

  toolkit.internalState.dispatch(
    internalStateActions.updateAppState({
      tabId: toolkit.getCurrentTab().id,
      appState: {
        dataSource: createDataSource({ dataView, query }),
        interval: 'auto',
        hideChart,
        columns: [],
        query,
      },
    })
  );

  const { dataStateContainer } = await toolkit.initializeSingleTab({
    tabId: toolkit.getCurrentTab().id,
  });

  dataStateContainer.data$.documents$.next({
    fetchStatus: FetchStatus.COMPLETE,
    result: esHitsMock.map((esHit) => buildDataTableRecord(esHit, dataView)),
  });
  dataStateContainer.data$.totalHits$.next({
    fetchStatus: FetchStatus.COMPLETE,
    result: Number(esHitsMock.length),
  });
  dataStateContainer.data$.main$.next({
    fetchStatus: FetchStatus.COMPLETE,
    foundDocuments: true,
  });

  const props: DiscoverMainContentProps = {
    dataView,
    onFieldEdited: jest.fn(),
    columns: [],
    viewMode,
    onAddFilter: jest.fn(),
    isChartAvailable,
  };

  renderWithKibanaRenderContext(
    <DiscoverToolkitTestProvider toolkit={toolkit}>
      <DiscoverMainContent {...props} />
    </DiscoverToolkitTestProvider>
  );

  await waitFor(() => {
    expect(screen.getByTestId('dscMainContent')).toBeVisible();
  });
};

describe('Discover main content component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DocumentViewModeToggle', () => {
    it('should show DocumentViewModeToggle when not in ES|QL mode', async () => {
      await renderComponent();

      expect(screen.getByTestId('discoverDocumentsMock')).toHaveAttribute(
        'data-has-view-mode-toggle',
        'true'
      );
    });

    it('should include DocumentViewModeToggle when in ES|QL mode', async () => {
      await renderComponent({ isEsqlMode: true });

      expect(screen.getByTestId('discoverDocumentsMock')).toHaveAttribute(
        'data-has-view-mode-toggle',
        'true'
      );
    });

    it('should show DocumentViewModeToggle for Field Statistics', async () => {
      await renderComponent({ viewMode: VIEW_MODE.AGGREGATED_LEVEL });

      expect(screen.getByTestId('documentViewModeToggleMock')).toBeVisible();
    });

    it('should not include inline PanelsToggle when chart is available and visible', async () => {
      await renderComponent({ isChartAvailable: true });

      expect(screen.queryByTestId('panelsToggleMock')).not.toBeInTheDocument();
      expect(screen.getByRole('separator')).toBeVisible();
    });

    it('should include PanelsToggle when chart is available and hidden', async () => {
      await renderComponent({ isChartAvailable: true, hideChart: true });

      expect(screen.getByTestId('panelsToggleMock')).toHaveAttribute(
        'data-omit-chart-button',
        'false'
      );
      expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });

    it('should include PanelsToggle when chart is not available', async () => {
      await renderComponent({ isChartAvailable: false });

      expect(screen.getByTestId('panelsToggleMock')).toHaveAttribute(
        'data-omit-chart-button',
        'true'
      );
      expect(screen.getByTestId('panelsToggleMock')).toHaveAttribute(
        'data-omit-table-button',
        'true'
      );
      expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });
  });

  describe('Document view', () => {
    it('should show DiscoverDocuments when VIEW_MODE is DOCUMENT_LEVEL', async () => {
      await renderComponent();

      expect(screen.getByTestId('discoverDocumentsMock')).toBeVisible();
      expect(screen.queryByTestId('patternAnalysisTabMock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('fieldStatisticsTabMock')).not.toBeInTheDocument();
    });

    it('should show FieldStatisticsTab when VIEW_MODE is AGGREGATED_LEVEL', async () => {
      await renderComponent({ viewMode: VIEW_MODE.AGGREGATED_LEVEL });

      expect(screen.queryByTestId('discoverDocumentsMock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('patternAnalysisTabMock')).not.toBeInTheDocument();
      expect(screen.getByTestId('fieldStatisticsTabMock')).toBeVisible();
    });

    it('should show PatternAnalysisTab when VIEW_MODE is PATTERN_LEVEL', async () => {
      await renderComponent({ viewMode: VIEW_MODE.PATTERN_LEVEL });

      expect(screen.queryByTestId('discoverDocumentsMock')).not.toBeInTheDocument();
      expect(screen.getByTestId('patternAnalysisTabMock')).toBeVisible();
      expect(screen.queryByTestId('fieldStatisticsTabMock')).not.toBeInTheDocument();
    });
  });
});
