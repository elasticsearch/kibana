/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { AggregateQuery } from '@kbn/es-query';

import { useHasEsqlPanel } from './publishes_esql';

const makeEsqlChild = (queries: AggregateQuery[] = []) => ({
  esql$: new BehaviorSubject<AggregateQuery[]>(queries),
  approximationApplied$: new BehaviorSubject<boolean | undefined>(undefined),
});

const makeParentApi = (children: Record<string, unknown> = {}) => ({
  children$: new BehaviorSubject<Record<string, unknown>>(children),
});

describe('useHasEsqlPanel', () => {
  test('returns false when parentApi is undefined', () => {
    const { result } = renderHook(() => useHasEsqlPanel(undefined));
    expect(result.current).toBe(false);
  });

  test('returns false when parentApi has no children', () => {
    const { result } = renderHook(() => useHasEsqlPanel(makeParentApi({})));
    expect(result.current).toBe(false);
  });

  test('returns false when children do not implement PublishesEsql', () => {
    const parentApi = makeParentApi({ panel1: { title$: new BehaviorSubject('not esql') } });
    const { result } = renderHook(() => useHasEsqlPanel(parentApi));
    expect(result.current).toBe(false);
  });

  test('returns false when an esql child emits an empty query array', () => {
    const parentApi = makeParentApi({ panel1: makeEsqlChild([]) });
    const { result } = renderHook(() => useHasEsqlPanel(parentApi));
    expect(result.current).toBe(false);
  });

  test('returns true when a child emits a non-empty esql query array', () => {
    const parentApi = makeParentApi({ panel1: makeEsqlChild([{ esql: 'FROM logs' }]) });
    const { result } = renderHook(() => useHasEsqlPanel(parentApi));
    expect(result.current).toBe(true);
  });

  test('updates to true when child esql$ emits a non-empty array', () => {
    const child = makeEsqlChild([]);
    const parentApi = makeParentApi({ panel1: child });
    const { result } = renderHook(() => useHasEsqlPanel(parentApi));
    expect(result.current).toBe(false);

    act(() => child.esql$.next([{ esql: 'FROM logs' }]));
    expect(result.current).toBe(true);
  });

  test('updates to false when child esql$ becomes empty', () => {
    const child = makeEsqlChild([{ esql: 'FROM logs' }]);
    const parentApi = makeParentApi({ panel1: child });
    const { result } = renderHook(() => useHasEsqlPanel(parentApi));
    expect(result.current).toBe(true);

    act(() => child.esql$.next([]));
    expect(result.current).toBe(false);
  });

  test('updates to true when an esql child is added to children$', () => {
    const parentApi = makeParentApi({});
    const { result } = renderHook(() => useHasEsqlPanel(parentApi));
    expect(result.current).toBe(false);

    act(() => parentApi.children$.next({ panel1: makeEsqlChild([{ esql: 'FROM logs' }]) }));
    expect(result.current).toBe(true);
  });

  test('updates to false when the last esql child is removed from children$', () => {
    const parentApi = makeParentApi({ panel1: makeEsqlChild([{ esql: 'FROM logs' }]) });
    const { result } = renderHook(() => useHasEsqlPanel(parentApi));
    expect(result.current).toBe(true);

    act(() => parentApi.children$.next({}));
    expect(result.current).toBe(false);
  });
});
