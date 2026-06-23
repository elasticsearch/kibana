/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject, Subject } from 'rxjs';
import { ControlValuesSource } from '@kbn/controls-constants';

import { coreServices } from '../../../services/kibana_services';
import { setStubKibanaServices } from '../../../services/mocks';
import { fetchAndValidate$ } from './fetch_and_validate';

const phraseFilter = (field: string, value: string) =>
  ({
    meta: { type: 'phrase', key: field, params: { query: value } },
    query: { match_phrase: { [field]: value } },
  } as any);

const buildApi = ({
  filters$,
  parentQuery$,
}: {
  filters$: BehaviorSubject<unknown>;
  parentQuery$: BehaviorSubject<unknown>;
}) => {
  const parentApi = {
    filters$,
    query$: parentQuery$,
    timeRange$: new BehaviorSubject({ from: 'now-15m', to: 'now' }),
  };
  return {
    parentApi,
    uuid: 'test-uuid',
    loadMoreSubject: new Subject<void>(),
    loadingSuggestions$: new BehaviorSubject<boolean>(false),
    debouncedSearchString: new BehaviorSubject<string>(''),
    dataViews$: new BehaviorSubject<unknown>(undefined),
    field$: new BehaviorSubject<unknown>(undefined),
    esqlQuery$: new BehaviorSubject<string>('FROM logs | KEEP host'),
    valuesSource$: new BehaviorSubject<ControlValuesSource>(ControlValuesSource.ESQL),
    useGlobalFilters$: new BehaviorSubject<boolean>(true),
    ignoreValidations$: new BehaviorSubject<boolean>(false),
  } as any;
};

describe('fetchAndValidate$ ES|QL filter wiring', () => {
  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    setStubKibanaServices();
  });

  beforeEach(() => {
    fetchSpy = jest.spyOn(coreServices.http, 'fetch').mockResolvedValue({
      suggestions: [],
      totalCardinality: 0,
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('refetches with the new pre-filter when dashboard filters change', async () => {
    const filters$ = new BehaviorSubject<unknown>([]);
    const parentQuery$ = new BehaviorSubject<unknown>(undefined);
    const api = buildApi({ filters$, parentQuery$ });

    const requestSize$ = new BehaviorSubject<number>(10);
    const runPastTimeout$ = new BehaviorSubject<boolean>(false);
    const selectedOptions$ = new BehaviorSubject<unknown[]>([]);
    const searchTechnique$ = new BehaviorSubject<'wildcard' | 'prefix' | 'exact'>('wildcard');
    const sort$ = new BehaviorSubject<unknown>({ by: '_count', direction: 'desc' });

    const subscription = fetchAndValidate$({
      api,
      requestSize$: requestSize$ as any,
      runPastTimeout$: runPastTimeout$ as any,
      selectedOptions$: selectedOptions$ as any,
      searchTechnique$: searchTechnique$ as any,
      sort$: sort$ as any,
    }).subscribe(() => {});

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(firstBody.filter).toBeUndefined();

    filters$.next([phraseFilter('host', 'mainframe')]);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(secondBody.filter).toBeDefined();
    expect(JSON.stringify(secondBody.filter)).toContain('mainframe');

    subscription.unsubscribe();
  }, 10000);
});
