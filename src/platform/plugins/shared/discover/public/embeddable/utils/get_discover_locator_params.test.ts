/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedSearch } from '@kbn/saved-search-plugin/common';
import { BehaviorSubject } from 'rxjs';
import moment from 'moment';
import { buildDataViewMock, dataViewMock, esHitsMock } from '@kbn/discover-utils/src/__mocks__';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { Filter, Query } from '@kbn/es-query';
import { ESQLVariableType, type ESQLControlVariable } from '@kbn/esql-types';
import { savedSearchMock } from '../../__mocks__/saved_search';
import {
  getDiscoverLocatorParams,
  getExpandedDocLocatorParams,
  type GetExpandedDocLocatorParamsArgs,
} from './get_discover_locator_params';

describe('getDiscoverLocatorParams', () => {
  it('should return saved search id if input has savedObjectId', () => {
    expect(
      getDiscoverLocatorParams({
        savedObjectId$: new BehaviorSubject<string | undefined>('savedObjectId'),
        savedSearch$: new BehaviorSubject<SavedSearch>(savedSearchMock),
      })
    ).toEqual({
      savedSearchId: 'savedObjectId',
    });
  });

  it('should include tab param for by-reference input when selectedTabId is provided', () => {
    expect(
      getDiscoverLocatorParams({
        savedObjectId$: new BehaviorSubject<string | undefined>('savedObjectId'),
        savedSearch$: new BehaviorSubject<SavedSearch>(savedSearchMock),
        getSelectedTabId: () => 'tab-1',
      })
    ).toEqual({
      savedSearchId: 'savedObjectId',
      tab: { id: 'tab-1' },
    });
  });

  it('should not include tab param for by-value input even when selectedTabId is provided', () => {
    const result = getDiscoverLocatorParams({
      savedSearch$: new BehaviorSubject<SavedSearch>(savedSearchMock),
      getSelectedTabId: () => 'tab-1',
    });
    expect(result).not.toHaveProperty('tab');
  });

  it('should return Discover params if input has no savedObjectId', () => {
    expect(
      getDiscoverLocatorParams({
        savedSearch$: new BehaviorSubject<SavedSearch>(savedSearchMock),
      })
    ).toEqual({
      dataViewId: savedSearchMock.searchSource.getField('index')?.id,
      dataViewSpec: savedSearchMock.searchSource.getField('index')?.toMinimalSpec(),
      timeRange: savedSearchMock.timeRange,
      refreshInterval: savedSearchMock.refreshInterval,
      filters: savedSearchMock.searchSource.getField('filter'),
      query: savedSearchMock.searchSource.getField('query'),
      columns: savedSearchMock.columns,
      sort: savedSearchMock.sort,
      viewMode: savedSearchMock.viewMode,
      hideAggregatedPreview: savedSearchMock.hideAggregatedPreview,
    });
  });
});

describe('getExpandedDocLocatorParams', () => {
  const query: Query = { query: 'hello', language: 'kuery' };
  const expandedDoc = buildDataTableRecord(esHitsMock[0], dataViewMock);
  const expandedDocRef = { id: esHitsMock[0]._id, index: esHitsMock[0]._index };

  // Resolve any range to a fixed absolute window so the "freeze the time range" behavior is testable.
  const timefilter: GetExpandedDocLocatorParamsArgs['timefilter'] = {
    calculateBounds: () => ({
      min: moment('2024-01-01T00:00:00.000Z'),
      max: moment('2024-01-02T00:00:00.000Z'),
    }),
  };

  const buildArgs = (
    overrides: Partial<GetExpandedDocLocatorParamsArgs> = {}
  ): GetExpandedDocLocatorParamsArgs => ({
    api: { savedSearch$: new BehaviorSubject<SavedSearch>(savedSearchMock) },
    savedSearch: savedSearchMock,
    dataView: dataViewMock,
    query,
    panelFilters: undefined,
    dashboardFilters: undefined,
    columns: ['message'],
    sort: [['@timestamp', 'desc']],
    grid: undefined,
    isEsql: false,
    esqlVariables: undefined,
    expandedDoc,
    timeRange: { from: 'now-15m', to: 'now' },
    timefilter,
    ...overrides,
  });

  it('builds a self-describing link with pinned query, data view, doc, and absolute time range', () => {
    expect(getExpandedDocLocatorParams(buildArgs())).toEqual({
      query,
      dataViewId: dataViewMock.id,
      filters: [],
      columns: ['message'],
      sort: [['@timestamp', 'desc']],
      grid: undefined,
      viewMode: savedSearchMock.viewMode,
      hideAggregatedPreview: savedSearchMock.hideAggregatedPreview,
      sampleSize: savedSearchMock.sampleSize,
      breakdownField: savedSearchMock.breakdownField,
      expandedDoc: expandedDocRef,
      timeRange: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-02T00:00:00.000Z' },
    });
  });

  it('links back to the library saved search and still pins its query for by-reference panels', () => {
    const params = getExpandedDocLocatorParams(
      buildArgs({
        api: {
          savedSearch$: new BehaviorSubject<SavedSearch>(savedSearchMock),
          savedObjectId$: new BehaviorSubject<string | undefined>('library-id'),
          getSelectedTabId: () => 'tab-1',
        },
      })
    );

    expect(params.savedSearchId).toBe('library-id');
    expect(params.tab).toEqual({ id: 'tab-1' });
    expect(params.query).toEqual(query);
    expect(params.dataViewId).toBe(dataViewMock.id);
  });

  it('combines the panel filters with the dashboard filters', () => {
    const panelFilter: Filter = { meta: { key: 'panel' } };
    const dashboardFilter: Filter = { meta: { key: 'dashboard' } };

    const params = getExpandedDocLocatorParams(
      buildArgs({ panelFilters: [panelFilter], dashboardFilters: [dashboardFilter] })
    );

    expect(params.filters).toEqual([panelFilter, dashboardFilter]);
  });

  it('forwards ES|QL variables and an ad hoc data view spec in ES|QL mode', () => {
    const adHocDataView = buildDataViewMock({ name: 'ad-hoc', isPersisted: false });
    const esqlVariables: ESQLControlVariable[] = [
      { key: 'crew_id', value: 5, type: ESQLVariableType.VALUES },
    ];

    const params = getExpandedDocLocatorParams(
      buildArgs({
        isEsql: true,
        esqlVariables,
        dataView: adHocDataView,
        query: { esql: 'FROM logs | LIMIT 10' },
      })
    );

    expect(params.dataViewId).toBeUndefined();
    expect(params.dataViewSpec).toEqual(adHocDataView.toMinimalSpec());
    expect(params.esqlVariables).toEqual(esqlVariables);
    // No presentation container is available, so no controls can be resolved.
    expect(params.esqlControls).toBeUndefined();
  });
});
