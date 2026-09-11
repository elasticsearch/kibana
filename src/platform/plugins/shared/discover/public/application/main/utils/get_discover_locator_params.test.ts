/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import type { Filter } from '@kbn/es-query';
import { constructCascadeQuery } from '@kbn/esql-utils';
import { DataSourceType } from '../../../../common/data_sources';
import { getDiscoverInternalStateMock } from '../../../__mocks__/discover_state.mock';
import { internalStateActions } from '../state_management/redux';
import {
  getDiscoverLocatorParams,
  toCascadeDocShareLocatorParams,
} from './get_discover_locator_params';

const filters: Filter[] = [];
const timeRange = { from: 'now-15m', to: 'now' };
const refreshInterval = { pause: true, value: 60000 };
const profileState = { profile: { value: 'state' } };

describe('getDiscoverLocatorParams', () => {
  it('builds params for a persisted data view and Discover session', async () => {
    const toolkit = getDiscoverInternalStateMock();
    await toolkit.initializeTabs();
    const currentTab = toolkit.getCurrentTab();

    toolkit.internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: currentTab.id,
        appState: { dataSource: { type: DataSourceType.DataView, dataViewId: 'data-view-id' } },
      })
    );

    const updatedTab = toolkit.getCurrentTab();
    const { dataSource, ...appState } = updatedTab.appState;
    const persistedDiscoverSession = createDiscoverSessionMock({ id: 'session-id' });

    expect(
      getDiscoverLocatorParams({
        currentTab: updatedTab,
        dataView: dataViewMock,
        persistedDiscoverSession,
        filters,
        timeRange,
        refreshInterval,
        profileState,
      })
    ).toEqual({
      ...appState,
      savedSearchId: 'session-id',
      dataViewId: dataViewMock.id,
      filters,
      timeRange,
      refreshInterval,
      profileState,
      tab: { id: updatedTab.id, label: updatedTab.label },
    });
    expect(dataSource).toBeDefined();
  });

  it('builds params with a specification for an ad hoc data view', async () => {
    const toolkit = getDiscoverInternalStateMock();
    await toolkit.initializeTabs();
    const currentTab = toolkit.getCurrentTab();
    const { dataSource, ...appState } = currentTab.appState;
    const dataViewSpec = dataViewMock.toMinimalSpec();
    jest.spyOn(dataViewMock, 'isPersisted').mockReturnValue(false);

    expect(
      getDiscoverLocatorParams({
        currentTab,
        dataView: dataViewMock,
        persistedDiscoverSession: undefined,
        filters,
        timeRange: undefined,
        refreshInterval: undefined,
        profileState: undefined,
      })
    ).toEqual({
      ...appState,
      dataViewSpec,
      filters,
      timeRange: undefined,
      refreshInterval: undefined,
      profileState: undefined,
      tab: { id: currentTab.id, label: currentTab.label },
    });
    expect(dataSource).toBeUndefined();
  });
});

describe('toCascadeDocShareLocatorParams', () => {
  it('scopes session params to a nested group-by document share', async () => {
    const toolkit = getDiscoverInternalStateMock();
    await toolkit.initializeTabs();
    const currentTab = toolkit.getCurrentTab();
    const expandedDoc = buildDataTableRecord(
      { _id: 'doc-1', _index: 'logs', _source: { extension: 'png' } },
      dataViewMock
    );
    const groupingQuery = { esql: 'FROM logs | STATS count() BY extension' };
    const cascadePath = {
      nodePath: ['extension'],
      nodePathMap: { extension: 'png' },
    };
    const cascadeQuery = constructCascadeQuery({
      query: groupingQuery,
      dataView: dataViewMock,
      esqlVariables: undefined,
      nodeType: 'leaf',
      ...cascadePath,
    });

    if (!cascadeQuery) {
      throw new Error('Expected a cascade leaf query');
    }

    toolkit.internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: currentTab.id,
        appState: {
          query: groupingQuery,
          columns: ['count', 'extension'],
          sort: [['count', 'desc']],
        },
      })
    );
    toolkit.internalState.dispatch(
      internalStateActions.setExpandedDoc({
        tabId: currentTab.id,
        expandedDoc,
      })
    );

    const persistedDiscoverSession = createDiscoverSessionMock({ id: 'session-id' });
    const locatorParams = toCascadeDocShareLocatorParams({
      locatorParams: getDiscoverLocatorParams({
        currentTab: toolkit.getCurrentTab(),
        dataView: dataViewMock,
        persistedDiscoverSession,
        filters,
        timeRange,
        refreshInterval,
        profileState,
      }),
      query: cascadeQuery,
      expandedDoc: toolkit.getCurrentTab().expandedDoc,
    });

    expect(locatorParams.query).toEqual(cascadeQuery);
    expect(locatorParams.expandedDoc).toEqual({ id: 'doc-1', index: 'logs' });
    expect(locatorParams.savedSearchId).toBeUndefined();
    expect(locatorParams.columns).toEqual([]);
    expect(locatorParams.grid).toBeUndefined();
    expect(locatorParams.sort).toBeUndefined();
    expect(locatorParams.timeRange).toEqual(timeRange);
    expect(locatorParams.filters).toEqual(filters);
  });
});
