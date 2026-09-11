/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { DiscoverLayout } from './discover_layout';
import { dataViewMock, esHitsMock } from '@kbn/discover-utils/src/__mocks__';
import type { DataView } from '@kbn/data-views-plugin/public';
import { dataViewWithTimefieldMock } from '../../../../__mocks__/data_view_with_timefield';
import type { DataMainMsg } from '../../state_management/discover_data_state_container';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import { FetchStatus } from '../../../types';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { getDiscoverInternalStateMock } from '../../../../__mocks__/discover_state.mock';
import { act } from 'react-dom/test-utils';
import { createDataViewDataSource, createEsqlDataSource } from '../../../../../common/data_sources';
import { internalStateActions } from '../../state_management/redux';
import { DiscoverToolkitTestProvider } from '../../../../__mocks__/test_provider';
import { createContextAwarenessMocks } from '../../../../context_awareness/__mocks__';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import { METRIC_TYPE } from '@kbn/analytics';
import * as savedSearchUrlConflictCallout from '../../../../components/saved_search_url_conflict_callout/saved_search_url_conflict_callout';

const setup = async ({
  dataView,
  hideSidebar,
  hideTable = false,
  isEsqlEnabled = false,
  dataMainMsg = {
    fetchStatus: FetchStatus.COMPLETE,
    foundDocuments: true,
  },
}: {
  dataView: DataView;
  hideSidebar?: boolean;
  hideTable?: boolean;
  isEsqlEnabled?: boolean;
  dataMainMsg?: DataMainMsg;
}) => {
  const { profilesManagerMock } = createContextAwarenessMocks({ shouldRegisterProviders: false });
  const services = createDiscoverServicesMock();
  const getUiSettingsMock = jest.mocked(services.uiSettings.get);
  const originalGetImplementation = getUiSettingsMock.getMockImplementation();

  services.profilesManager = profilesManagerMock;
  getUiSettingsMock.mockImplementation((key, defaultOverride) => {
    if (key === ENABLE_ESQL) {
      return isEsqlEnabled;
    }

    return originalGetImplementation?.(key, defaultOverride);
  });

  const toolkit = getDiscoverInternalStateMock({
    services,
    persistedDataViews: [dataView],
  });

  await toolkit.initializeTabs();

  toolkit.internalState.dispatch(
    internalStateActions.updateAppState({
      tabId: toolkit.getCurrentTab().id,
      appState: {
        dataSource: createDataViewDataSource({ dataViewId: dataView.id! }),
        hideTable,
        hideSidebar,
        query: { query: '', language: 'kuery' },
      },
    })
  );

  const { dataStateContainer } = await toolkit.initializeSingleTab({
    tabId: toolkit.getCurrentTab().id,
  });

  toolkit.internalState.dispatch(
    toolkit.injectCurrentTab(internalStateActions.setDataRequestParams)({
      dataRequestParams: {
        timeRangeAbsolute: {
          from: '2020-05-14T11:05:13.590',
          to: '2020-05-14T11:20:13.590',
        },
        timeRangeRelative: {
          from: '2020-05-14T11:05:13.590',
          to: '2020-05-14T11:20:13.590',
        },
        searchSessionId: '123',
        isSearchSessionRestored: false,
      },
    })
  );

  dataStateContainer.data$.documents$.next({
    fetchStatus: FetchStatus.COMPLETE,
    result: esHitsMock.map((esHit) => buildDataTableRecord(esHit, dataView)),
  });
  dataStateContainer.data$.totalHits$.next({
    fetchStatus: FetchStatus.COMPLETE,
    result: Number(esHitsMock.length),
  });
  dataStateContainer.data$.main$.next(dataMainMsg);

  render(
    <DiscoverToolkitTestProvider toolkit={toolkit} usePortalsRenderer>
      <DiscoverLayout />
    </DiscoverToolkitTestProvider>
  );

  // wait for lazy modules
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

  return { services, toolkit };
};

describe('Discover component', () => {
  test('renders the conflict callout before the sidebar and results container', async () => {
    const calloutSpy = jest
      .spyOn(savedSearchUrlConflictCallout, 'SavedSearchURLConflictCallout')
      .mockReturnValue(<div data-test-subj="testConflictCallout" />);

    try {
      await setup({ dataView: dataViewWithTimefieldMock });

      const callout = screen.getByTestId('testConflictCallout');
      const layout = screen.getByTestId('discoverLayoutResizableContainer');
      expect(callout.nextElementSibling).toContainElement(layout);
    } finally {
      calloutSpy.mockRestore();
    }
  }, 10000);

  test('selected data view without time field displays no chart and table toggle', async () => {
    await setup({ dataView: dataViewMock });
    expect(screen.queryByTestId('dscHideHistogramButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscShowHistogramButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscHideTableButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscShowTableButton')).not.toBeInTheDocument();
  }, 10000);

  test('selected data view without time field still shows results when table is collapsed', async () => {
    await setup({ dataView: dataViewMock, hideTable: true });
    expect(screen.queryByTestId('discoverDocumentsTable')).toBeInTheDocument();
    expect(screen.queryByTestId('dscHideHistogramButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscShowHistogramButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscHideTableButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscShowTableButton')).not.toBeInTheDocument();
  }, 10000);

  test('selected data view with time field displays chart and table toggle', async () => {
    await setup({ dataView: dataViewWithTimefieldMock });
    expect(screen.queryByTestId('dscHideHistogramButton')).toBeInTheDocument();
    expect(screen.queryByTestId('dscShowHistogramButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscHideTableButton')).toBeInTheDocument();
    expect(screen.queryByTestId('dscShowTableButton')).not.toBeInTheDocument();
  }, 10000);

  test('uninitialized classic mode offers switching to ES|QL', async () => {
    const user = userEvent.setup();
    const { services, toolkit } = await setup({
      dataView: dataViewWithTimefieldMock,
      dataMainMsg: {
        fetchStatus: FetchStatus.UNINITIALIZED,
        foundDocuments: false,
      },
      isEsqlEnabled: true,
    });

    expect(screen.getByTestId('refreshDataButton')).toBeVisible();
    expect(screen.getByText('or')).toBeVisible();

    await user.click(screen.getByTestId('queryInEsqlButton'));

    expect(services.trackUiMetric).toHaveBeenCalledWith(
      METRIC_TYPE.CLICK,
      'esql:uninitialized_query_in_esql_clicked'
    );
    expect(services.trackUiMetric).not.toHaveBeenCalledWith(
      METRIC_TYPE.CLICK,
      'esql:try_btn_clicked'
    );
    expect(toolkit.getCurrentTab().appState.dataSource).toEqual(createEsqlDataSource());
  }, 10000);

  describe('sidebar', () => {
    test('should be opened if hideSidebar is not set', async () => {
      await setup({ dataView: dataViewWithTimefieldMock });
      expect(screen.queryByTestId('fieldList')).toBeInTheDocument();
    }, 10000);

    test('should be opened if hideSidebar is false', async () => {
      await setup({
        dataView: dataViewWithTimefieldMock,
        hideSidebar: false,
      });
      expect(screen.queryByTestId('fieldList')).toBeInTheDocument();
    }, 10000);

    test('should be closed if hideSidebar is true', async () => {
      await setup({
        dataView: dataViewWithTimefieldMock,
        hideSidebar: true,
      });
      await waitFor(() => {
        expect(screen.queryByTestId('fieldList')).not.toBeInTheDocument();
      });
    }, 10000);
  });

  it('shows the no results error display', async () => {
    await setup({
      dataView: dataViewWithTimefieldMock,
      dataMainMsg: {
        fetchStatus: FetchStatus.ERROR,
        foundDocuments: false,
        error: new Error('No results'),
      },
    });
    expect(screen.queryByTestId('discoverErrorCalloutTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('dscPanelsToggleInHistogram')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscPanelsToggleInPage')).toBeInTheDocument();
    expect(screen.queryByTestId('dscHideHistogramButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscShowHistogramButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscHideTableButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dscShowTableButton')).not.toBeInTheDocument();
  }, 10000);
});
