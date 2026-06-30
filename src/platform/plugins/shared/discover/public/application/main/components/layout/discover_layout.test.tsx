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
import { createDataViewDataSource } from '../../../../../common/data_sources';
import { internalStateActions } from '../../state_management/redux';
import { DiscoverToolkitTestProvider } from '../../../../__mocks__/test_provider';
import { createContextAwarenessMocks } from '../../../../context_awareness/__mocks__';
import { render, screen, waitFor } from '@testing-library/react';

const setup = async ({
  dataView,
  hideSidebar,
  hideTable = false,
  dataMainMsg = {
    fetchStatus: FetchStatus.COMPLETE,
    foundDocuments: true,
  },
}: {
  dataView: DataView;
  hideSidebar?: boolean;
  hideTable?: boolean;
  dataMainMsg?: DataMainMsg;
}) => {
  const { profilesManagerMock } = createContextAwarenessMocks({ shouldRegisterProviders: false });
  const services = createDiscoverServicesMock();

  services.profilesManager = profilesManagerMock;

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
};

describe('Discover component', () => {
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
