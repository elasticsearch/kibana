/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { esHitsMock } from '@kbn/discover-utils/src/__mocks__';
import { FetchStatus } from '../../../types';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { DiscoverHistogramLayout } from './discover_histogram_layout';
import { VIEW_MODE } from '@kbn/saved-search-plugin/public';
import { getDiscoverInternalStateMock } from '../../../../__mocks__/discover_state.mock';
import { act } from 'react-dom/test-utils';
import { createDataViewDataSource } from '../../../../../common/data_sources';
import { internalStateActions } from '../../state_management/redux';
import { DiscoverToolkitTestProvider } from '../../../../__mocks__/test_provider';
import type { DiscoverMainContentProps } from './discover_main_content';
import { dataViewWithTimefieldMock } from '../../../../__mocks__/data_view_with_timefield';
import { render, screen } from '@testing-library/react';
import { createContextAwarenessMocks } from '../../../../context_awareness/__mocks__';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import userEvent from '@testing-library/user-event';

const dataView = dataViewWithTimefieldMock;
const mockSearchSessionId = '123';

const setup = async ({
  noSearchSessionId,
  hideTable = false,
}: {
  noSearchSessionId?: boolean;
  hideTable?: boolean;
} = {}) => {
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
        query: { query: '', language: 'kuery' },
      },
    })
  );

  const { dataStateContainer } = await toolkit.initializeSingleTab({
    tabId: toolkit.getCurrentTab().id,
  });

  toolkit.internalState.dispatch(
    internalStateActions.setDataRequestParams({
      tabId: toolkit.getCurrentTab().id,
      dataRequestParams: {
        timeRangeAbsolute: {
          from: '2020-05-14T11:05:13.590',
          to: '2020-05-14T11:20:13.590',
        },
        timeRangeRelative: {
          from: '2020-05-14T11:05:13.590',
          to: '2020-05-14T11:20:13.590',
        },
        searchSessionId: noSearchSessionId ? undefined : mockSearchSessionId,
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
  dataStateContainer.data$.main$.next({
    fetchStatus: FetchStatus.COMPLETE,
    foundDocuments: true,
  });

  const props: DiscoverMainContentProps = {
    dataView,
    onFieldEdited: jest.fn(),
    columns: [],
    viewMode: VIEW_MODE.DOCUMENT_LEVEL,
    onAddFilter: jest.fn(),
  };

  render(
    <DiscoverToolkitTestProvider toolkit={toolkit} usePortalsRenderer>
      <DiscoverHistogramLayout {...props} />
    </DiscoverToolkitTestProvider>
  );

  // wait for lazy modules
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

describe('Discover histogram layout component', () => {
  describe('render', () => {
    it('should not render chart if there is no search session', async () => {
      await setup({ noSearchSessionId: true });
      expect(screen.queryByTestId('unifiedHistogramRendered')).not.toBeInTheDocument();
    });

    it('should render chart if there is a search session', async () => {
      await setup();
      expect(screen.queryByTestId('unifiedHistogramRendered')).toBeInTheDocument();
    });

    it('should render PanelsToggle', async () => {
      const user = userEvent.setup();
      await setup();
      expect(screen.queryByTestId('dscPanelsToggleInHistogram')).toBeInTheDocument();
      expect(screen.queryByTestId('dscPanelsToggleInPage')).not.toBeInTheDocument();
      await user.click(screen.getByTestId('dscHideHistogramButton'));
      expect(screen.queryByTestId('dscPanelsToggleInHistogram')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dscPanelsToggleInPage')).toBeInTheDocument();
    });

    it('should hide the main panel when the table is collapsed and chart is available', async () => {
      await setup({ hideTable: true });
      expect(screen.queryByTestId('unifiedHistogramRendered')).toBeInTheDocument();
      expect(screen.queryByTestId('discoverDocumentsTable')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dscShowTableButton')).toBeInTheDocument();
    });
  });
});
