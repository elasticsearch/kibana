/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Router } from '@kbn/shared-ux-router';
import { createMemoryHistory } from 'history';
import { applyMiddleware, createStore } from 'redux';
import createSagaMiddleware from 'redux-saga';

import { rootReducer } from '../../../state/root_reducer';
import { rootEffect } from '../../../state/root_effect';

const mockUseOverviewStatus = jest.fn((_opts?: { scopeStatusByLocation: boolean }) => ({
  status: undefined,
  error: undefined,
  loading: false,
  loaded: false,
  allConfigs: [],
}));

jest.mock('../hooks/use_overview_status', () => ({
  useOverviewStatus: (opts: { scopeStatusByLocation: boolean }) => mockUseOverviewStatus(opts),
  useOverviewStatusState: jest.fn(() => ({
    status: undefined,
    error: undefined,
    loading: false,
    loaded: false,
    allConfigs: [],
  })),
}));

jest.mock('../hooks/use_monitor_list', () => ({
  useMonitorList: jest.fn(() => ({
    loading: false,
    loaded: false,
    handleFilterChange: jest.fn(),
    absoluteTotal: 0,
    syntheticsMonitors: [],
  })),
}));

jest.mock('../../../hooks', () => ({
  useEnablement: jest.fn(() => ({
    isEnabled: true,
    loading: false,
    error: undefined,
  })),
  useLocations: jest.fn(() => ({
    loading: false,
    locationsLoaded: true,
    locations: [],
  })),
  // `useSyncOverviewDateRange` (mounted by `OverviewPage`) reads the URL params
  // via this hook, so it must be stubbed here or the render throws.
  useUrlParams: jest.fn(() => [jest.fn(() => ({})), jest.fn()]),
}));

jest.mock('../../../hooks/use_synthetics_page_ready', () => ({
  useSyntheticsPageReady: jest.fn(),
}));

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  useTrackPageview: jest.fn(),
}));

jest.mock('./use_breadcrumbs', () => ({
  useOverviewBreadcrumbs: jest.fn(),
}));

jest.mock('../management/disabled_callout', () => ({
  DisabledCallout: () => null,
}));

jest.mock('../../common/alerting_callout/alerting_callout', () => ({
  AlertingCallout: () => null,
}));

jest.mock('../common/monitor_filters/filter_group', () => ({
  FilterGroup: () => null,
}));

jest.mock('../common/search_field', () => ({
  SearchField: () => null,
}));

jest.mock('./overview/quick_filters', () => ({
  QuickFilters: () => null,
}));

jest.mock('./overview/overview_grid', () => ({
  OverviewGrid: () => null,
}));

jest.mock('./overview/overview_status', () => ({
  OverviewStatus: () => null,
}));

jest.mock('./overview/overview_errors/overview_errors', () => ({
  OverviewErrors: () => null,
}));

jest.mock('./overview/overview_alerts', () => ({
  OverviewAlerts: () => null,
}));

jest.mock('../common/no_monitors_found', () => ({
  NoMonitorsFound: () => null,
}));

import { OverviewPage } from './overview_page';

const buildStore = () => {
  const sagaMiddleware = createSagaMiddleware();
  const store = createStore(rootReducer, applyMiddleware(sagaMiddleware));
  sagaMiddleware.run(rootEffect);
  return store;
};

describe('OverviewPage wiring', () => {
  beforeEach(() => {
    mockUseOverviewStatus.mockClear();
  });

  it('calls useOverviewStatus with scopeStatusByLocation: true on mount', () => {
    const store = buildStore();
    const history = createMemoryHistory({ initialEntries: ['/overview'] });

    render(
      <Provider store={store}>
        <Router history={history}>
          <OverviewPage />
        </Router>
      </Provider>
    );

    expect(mockUseOverviewStatus).toHaveBeenCalledWith({ scopeStatusByLocation: true });
  });
});
