/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { FetchStatus } from '../../types';
import { createMockEsqlSource } from '@kbn/data-source/src/__mocks__/esql_source.mock';
import type { Subject } from 'rxjs';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { reduce } from 'rxjs';
import type { SearchSource } from '@kbn/data-plugin/public';
import { RequestAdapter } from '@kbn/inspector-plugin/common';
import { savedSearchMock } from '../../../__mocks__/saved_search';
import { fetchAll, fetchMoreDocuments } from './fetch_all';
import type {
  DataDocumentsMsg,
  DataMainMsg,
  DataTotalHitsMsg,
  SavedSearchData,
} from '../state_management/discover_data_state_container';
import { fetchDocuments } from './fetch_documents';
import { fetchEsql } from './fetch_esql';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { dataViewMock, esHitsMockWithSort } from '@kbn/discover-utils/src/__mocks__';
import { searchResponseIncompleteWarningLocalCluster } from '@kbn/search-response-warnings/src/__mocks__/search_response_warnings';
import { getDiscoverInternalStateMock } from '../../../__mocks__/discover_state.mock';
import { internalStateActions, selectTabRuntimeState } from '../state_management/redux';
import type { DataView } from '@kbn/data-views-plugin/common';
import { createDiscoverServicesMock } from '../../../__mocks__/services';

jest.mock('./fetch_documents', () => ({
  fetchDocuments: jest.fn().mockResolvedValue([]),
}));

jest.mock('./fetch_esql', () => ({
  fetchEsql: jest.fn().mockResolvedValue([]),
}));

const mockFetchDocuments = fetchDocuments as unknown as jest.MockedFunction<typeof fetchDocuments>;
const mockfetchEsql = fetchEsql as unknown as jest.MockedFunction<typeof fetchEsql>;

function subjectCollector<T>(subject: Subject<T>): () => Promise<T[]> {
  const promise = firstValueFrom(
    subject.pipe(reduce((history, value) => history.concat([value]), [] as T[]))
  );

  return () => {
    subject.complete();
    return promise;
  };
}

const waitForNextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('test fetchAll', () => {
  let subjects: SavedSearchData;
  let deps: Parameters<typeof fetchAll>[0];
  let searchSource: SearchSource;

  beforeEach(async () => {
    subjects = {
      main$: new BehaviorSubject<DataMainMsg>({ fetchStatus: FetchStatus.UNINITIALIZED }),
      documents$: new BehaviorSubject<DataDocumentsMsg>({ fetchStatus: FetchStatus.UNINITIALIZED }),
      totalHits$: new BehaviorSubject<DataTotalHitsMsg>({ fetchStatus: FetchStatus.UNINITIALIZED }),
    };
    searchSource = savedSearchMock.searchSource.createChild();
    const services = createDiscoverServicesMock();
    const toolkit = getDiscoverInternalStateMock({ services });
    await toolkit.initializeTabs();
    await toolkit.initializeSingleTab({
      tabId: toolkit.getCurrentTab().id,
      skipWaitForDataFetching: true,
    });
    const { scopedProfilesManager$, scopedEbtManager$ } = selectTabRuntimeState(
      toolkit.runtimeStateManager,
      toolkit.getCurrentTab().id
    );
    deps = {
      dataSubjects: subjects,
      reset: false,
      abortController: new AbortController(),
      inspectorAdapters: { requests: new RequestAdapter() },
      internalState: toolkit.internalState,
      scopedProfilesManager: scopedProfilesManager$.getValue(),
      scopedEbtManager: scopedEbtManager$.getValue(),
      searchSessionId: '123',
      initialFetchStatus: FetchStatus.UNINITIALIZED,
      searchSource,
      services,
      getCurrentTab: toolkit.getCurrentTab,
    };
    mockFetchDocuments.mockReset().mockResolvedValue({ records: [] });
    mockfetchEsql.mockReset().mockResolvedValue({ records: [] });
  });

  test('changes of fetchStatus when starting with FetchStatus.UNINITIALIZED', async () => {
    const stateArr: FetchStatus[] = [];

    subjects.main$.subscribe((value) => stateArr.push(value.fetchStatus));

    fetchAll(deps);
    await waitForNextTick();

    expect(stateArr).toEqual([
      FetchStatus.UNINITIALIZED,
      FetchStatus.LOADING,
      FetchStatus.COMPLETE,
    ]);
  });

  test('emits loading and documents on documents$ correctly', async () => {
    const collect = subjectCollector(subjects.documents$);
    const hits = [
      { _id: '1', _index: 'logs' },
      { _id: '2', _index: 'logs' },
    ];
    const documents = hits.map((hit) => buildDataTableRecord(hit, dataViewMock));
    mockFetchDocuments.mockResolvedValue({ records: documents });
    fetchAll(deps);
    await waitForNextTick();
    expect(await collect()).toEqual([
      { fetchStatus: FetchStatus.UNINITIALIZED },
      {
        fetchStatus: FetchStatus.LOADING,
        query: { query: '', language: 'kuery' },
      },
      {
        fetchStatus: FetchStatus.COMPLETE,
        interceptedWarnings: [],
        result: documents,
        dataSource: expect.any(Object),
        query: { query: '', language: 'kuery' },
      },
    ]);
  });

  test('emits loading and hit count on totalHits$ correctly', async () => {
    const collect = subjectCollector(subjects.totalHits$);
    const hits = [
      { _id: '1', _index: 'logs' },
      { _id: '2', _index: 'logs' },
    ];
    searchSource.getField('index')!.isTimeBased = (() => false) as DataView['isTimeBased'];
    const documents = hits.map((hit) => buildDataTableRecord(hit, dataViewMock));
    mockFetchDocuments.mockResolvedValue({ records: documents });

    subjects.totalHits$.next({
      fetchStatus: FetchStatus.LOADING,
    });
    fetchAll(deps);
    await waitForNextTick();
    subjects.totalHits$.next({
      fetchStatus: FetchStatus.COMPLETE,
      result: 42,
    });

    expect(await collect()).toEqual([
      { fetchStatus: FetchStatus.UNINITIALIZED },
      { fetchStatus: FetchStatus.LOADING },
      { fetchStatus: FetchStatus.PARTIAL, result: 2 },
      { fetchStatus: FetchStatus.COMPLETE, result: 42 },
    ]);
  });

  test('should use charts query to fetch total hit count when chart is visible', async () => {
    const collect = subjectCollector(subjects.totalHits$);
    searchSource.getField('index')!.isTimeBased = (() => true) as DataView['isTimeBased'];
    subjects.totalHits$.next({
      fetchStatus: FetchStatus.LOADING,
    });
    fetchAll(deps);
    await waitForNextTick();
    subjects.totalHits$.next({
      fetchStatus: FetchStatus.COMPLETE,
      result: 32,
    });

    expect(await collect()).toEqual([
      { fetchStatus: FetchStatus.UNINITIALIZED },
      { fetchStatus: FetchStatus.LOADING },
      { fetchStatus: FetchStatus.PARTIAL, result: 0 }, // From documents query
      { fetchStatus: FetchStatus.COMPLETE, result: 32 },
    ]);
  });

  test('should only fail totalHits$ query not main$ for error from that query', async () => {
    const collectTotalHits = subjectCollector(subjects.totalHits$);
    const collectMain = subjectCollector(subjects.main$);
    searchSource.getField('index')!.isTimeBased = (() => false) as DataView['isTimeBased'];
    const hits = [{ _id: '1', _index: 'logs' }];
    const documents = hits.map((hit) => buildDataTableRecord(hit, dataViewMock));
    mockFetchDocuments.mockResolvedValue({ records: documents });
    subjects.totalHits$.next({
      fetchStatus: FetchStatus.LOADING,
    });
    fetchAll(deps);
    await waitForNextTick();
    subjects.totalHits$.next({
      fetchStatus: FetchStatus.ERROR,
      error: { msg: 'Oh noes!' } as unknown as Error,
    });

    expect(await collectTotalHits()).toEqual([
      { fetchStatus: FetchStatus.UNINITIALIZED },
      { fetchStatus: FetchStatus.LOADING },
      { fetchStatus: FetchStatus.PARTIAL, result: 1 },
      { fetchStatus: FetchStatus.ERROR, error: { msg: 'Oh noes!' } },
    ]);
    expect(await collectMain()).toEqual([
      { fetchStatus: FetchStatus.UNINITIALIZED },
      { fetchStatus: FetchStatus.LOADING },
      { fetchStatus: FetchStatus.PARTIAL },
      {
        fetchStatus: FetchStatus.COMPLETE,
        foundDocuments: true,
        error: undefined,
      },
    ]);
  });

  test('should not set COMPLETE if an ERROR has been set on main$', async () => {
    const collectMain = subjectCollector(subjects.main$);
    searchSource.getField('index')!.isTimeBased = (() => false) as DataView['isTimeBased'];
    mockFetchDocuments.mockRejectedValue({ msg: 'This query failed' });
    subjects.totalHits$.next({
      fetchStatus: FetchStatus.LOADING,
    });
    fetchAll(deps);
    await waitForNextTick();
    subjects.totalHits$.next({
      fetchStatus: FetchStatus.COMPLETE,
      result: 5,
    });

    expect(await collectMain()).toEqual([
      { fetchStatus: FetchStatus.UNINITIALIZED },
      { fetchStatus: FetchStatus.LOADING },
      {
        fetchStatus: FetchStatus.ERROR,
        error: { msg: 'This query failed' },
      },
      // Here should be no COMPLETE coming anymore
    ]);
  });

  test('emits loading and documents on documents$ correctly for ES|QL query', async () => {
    const collect = subjectCollector(subjects.documents$);
    const hits = [
      { _id: '1', _index: 'logs' },
      { _id: '2', _index: 'logs' },
    ];
    const documents = hits.map((hit) => buildDataTableRecord(hit, dataViewMock));
    mockfetchEsql.mockResolvedValue({
      records: documents,
      dataSource: createMockEsqlSource(),
    });
    const query = { esql: 'from foo' };
    deps.internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: deps.getCurrentTab().id,
        appState: { query },
      })
    );
    fetchAll(deps);
    await waitForNextTick();

    expect(await collect()).toEqual([
      { fetchStatus: FetchStatus.UNINITIALIZED },
      { fetchStatus: FetchStatus.LOADING, query },
      {
        fetchStatus: FetchStatus.PARTIAL,
        interceptedWarnings: [],
        result: documents,
        dataSource: expect.objectContaining({ id: 'mock-esql-source' }),
        query,
      },
    ]);
  });

  describe('fetchMoreDocuments', () => {
    const records = esHitsMockWithSort.map((hit) => buildDataTableRecord(hit, dataViewMock));
    const initialRecords = [records[0], records[1]];
    const moreRecords = [records[2], records[3]];

    const interceptedWarnings = [searchResponseIncompleteWarningLocalCluster];

    test('should add more records', async () => {
      const collectDocuments = subjectCollector(subjects.documents$);
      const collectMain = subjectCollector(subjects.main$);
      mockFetchDocuments.mockResolvedValue({ records: moreRecords, interceptedWarnings });
      subjects.documents$.next({
        fetchStatus: FetchStatus.COMPLETE,
        result: initialRecords,
      });
      fetchMoreDocuments(deps);
      await waitForNextTick();

      expect(await collectDocuments()).toEqual([
        { fetchStatus: FetchStatus.UNINITIALIZED },
        {
          fetchStatus: FetchStatus.COMPLETE,
          result: initialRecords,
        },
        {
          fetchStatus: FetchStatus.LOADING_MORE,
          result: initialRecords,
        },
        {
          fetchStatus: FetchStatus.COMPLETE,
          result: [...initialRecords, ...moreRecords],
          interceptedWarnings,
        },
      ]);
      expect(await collectMain()).toEqual([
        {
          fetchStatus: FetchStatus.UNINITIALIZED,
        },
      ]);
    });

    test('should handle exceptions', async () => {
      const collectDocuments = subjectCollector(subjects.documents$);
      const collectMain = subjectCollector(subjects.main$);
      mockFetchDocuments.mockRejectedValue({ msg: 'This query failed' });
      subjects.documents$.next({
        fetchStatus: FetchStatus.COMPLETE,
        result: initialRecords,
      });
      fetchMoreDocuments(deps);
      await waitForNextTick();

      expect(await collectDocuments()).toEqual([
        { fetchStatus: FetchStatus.UNINITIALIZED },
        {
          fetchStatus: FetchStatus.COMPLETE,
          result: initialRecords,
        },
        {
          fetchStatus: FetchStatus.LOADING_MORE,
          result: initialRecords,
        },
        {
          fetchStatus: FetchStatus.COMPLETE,
          result: initialRecords,
        },
      ]);
      expect(await collectMain()).toEqual([
        {
          fetchStatus: FetchStatus.UNINITIALIZED,
        },
        {
          error: {
            msg: 'This query failed',
          },
          fetchStatus: 'error',
        },
      ]);
    });

    test('should swallow abort errors', async () => {
      const collect = subjectCollector(subjects.documents$);
      mockfetchEsql.mockRejectedValue({ msg: 'The query was aborted' });
      const query = { esql: 'from foo' };
      deps.internalState.dispatch(
        internalStateActions.updateAppState({
          tabId: deps.getCurrentTab().id,
          appState: { query },
        })
      );
      fetchAll(deps);
      deps.abortController.abort();
      await waitForNextTick();

      expect((await collect()).find(({ error }) => error)).toBeUndefined();
    });
  });
});
