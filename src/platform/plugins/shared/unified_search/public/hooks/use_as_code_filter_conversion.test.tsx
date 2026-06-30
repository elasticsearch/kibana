/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { apm } from '@elastic/apm-rum';
import { FilterStateStore } from '@kbn/es-query';
import { loggerMock } from '@kbn/logging-mocks';
import { act, renderHook } from '@testing-library/react';
import type { AsCodeFilter } from '@kbn/as-code-filters-schema';
import type { Filter } from '@kbn/es-query';
import { useAsCodeFilterConversion } from './use_as_code_filter_conversion';

jest.mock('@elastic/apm-rum', () => ({
  apm: {
    captureError: jest.fn(),
  },
}));

const captureErrorMock = apm.captureError as jest.MockedFunction<typeof apm.captureError>;

const createPhraseFilter = (field: string, value: string, pinned = false): Filter => ({
  meta: {
    key: field,
    type: 'phrase',
    params: { query: value },
    disabled: false,
    negate: false,
    alias: null,
  },
  query: {
    match_phrase: {
      [field]: value,
    },
  },
  ...(pinned ? { $state: { store: FilterStateStore.GLOBAL_STATE } } : {}),
});

const asCodeFilter: AsCodeFilter = {
  type: 'condition',
  condition: {
    field: 'status',
    operator: 'is',
    value: 'active',
  },
};

describe('useAsCodeFilterConversion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('converts inbound AsCodeFilter[] to Filter[]', () => {
    const { result } = renderHook(() =>
      useAsCodeFilterConversion({
        asCodeFilterMode: true,
        filters: [asCodeFilter],
      })
    );

    expect(result.current.filters).toEqual([createPhraseFilter('status', 'active')]);
  });

  it('passes through Filter[] when mode is disabled', () => {
    const filters = [createPhraseFilter('status', 'active')];
    const { result } = renderHook(() =>
      useAsCodeFilterConversion({
        asCodeFilterMode: false,
        filters,
      })
    );

    expect(result.current.filters).toBe(filters);
  });

  it('preserves pinned filters across inbound conversion', () => {
    const pinnedFilter = createPhraseFilter('host.name', 'web-01', true);
    const { result, rerender } = renderHook(
      ({ filters }) =>
        useAsCodeFilterConversion({
          asCodeFilterMode: true,
          filters,
        }),
      {
        initialProps: {
          filters: [pinnedFilter] as Filter[] | AsCodeFilter[],
        },
      }
    );

    expect(result.current.filters).toEqual([pinnedFilter]);

    rerender({ filters: [asCodeFilter] });

    expect(result.current.filters).toEqual([pinnedFilter, createPhraseFilter('status', 'active')]);
  });

  it('splits pinned filters on outbound conversion', () => {
    const onFiltersUpdated = jest.fn();
    const pinnedFilter = createPhraseFilter('host.name', 'web-01', true);
    const appFilter = createPhraseFilter('status', 'active');
    const { result } = renderHook(() =>
      useAsCodeFilterConversion({
        asCodeFilterMode: true,
        filters: [pinnedFilter],
        onFiltersUpdated,
      })
    );

    act(() => {
      result.current.onFiltersUpdated?.([pinnedFilter, appFilter]);
    });

    expect(onFiltersUpdated).toHaveBeenCalledWith([
      {
        type: 'condition',
        condition: {
          field: 'status',
          operator: 'is',
          value: 'active',
        },
      },
    ]);
  });

  it('emits empty arrays on empty outbound updates', () => {
    const onFiltersUpdated = jest.fn();
    const { result } = renderHook(() =>
      useAsCodeFilterConversion({
        asCodeFilterMode: true,
        filters: [],
        onFiltersUpdated,
      })
    );

    act(() => {
      result.current.onFiltersUpdated?.([]);
    });

    expect(onFiltersUpdated).toHaveBeenCalledWith([]);
  });

  it('logs, toasts, and reports APM for inbound conversion failures', () => {
    const logger = loggerMock.create();
    const toasts = { addDanger: jest.fn() } as any;
    const invalidFilters = [{ condition: null }] as unknown as AsCodeFilter[];

    renderHook(() =>
      useAsCodeFilterConversion({
        asCodeFilterMode: true,
        filters: invalidFilters,
        logger,
        toasts,
      })
    );

    expect(logger.warn).toHaveBeenCalled();
    expect(toasts.addDanger).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(expect.any(Error), {
      labels: {
        component: 'unifiedSearchAsCodeFilters',
        direction: 'inbound',
      },
    });
  });

  it('logs, toasts, and reports APM for outbound conversion failures', () => {
    const logger = loggerMock.create();
    const toasts = { addDanger: jest.fn() } as any;
    const onFiltersUpdated = jest.fn();
    const unsupportedFilter = {
      meta: {
        key: 'status',
        type: 'phrase',
      },
    } as Filter;

    const { result } = renderHook(() =>
      useAsCodeFilterConversion({
        asCodeFilterMode: true,
        filters: [],
        onFiltersUpdated,
        logger,
        toasts,
      })
    );

    act(() => {
      result.current.onFiltersUpdated?.([unsupportedFilter]);
    });

    expect(logger.warn).toHaveBeenCalled();
    expect(toasts.addDanger).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(expect.any(Error), {
      labels: {
        component: 'unifiedSearchAsCodeFilters',
        direction: 'outbound',
      },
    });
    expect(onFiltersUpdated).toHaveBeenCalledWith([]);
  });

  it('debounces repeated failure toasts', () => {
    const toasts = { addDanger: jest.fn() } as any;
    const unsupportedFilter = { meta: { type: 'phrase' } } as Filter;
    const { result } = renderHook(() =>
      useAsCodeFilterConversion({
        asCodeFilterMode: true,
        filters: [],
        onFiltersUpdated: jest.fn(),
        logger: loggerMock.create(),
        toasts,
      })
    );

    act(() => {
      result.current.onFiltersUpdated?.([unsupportedFilter]);
      result.current.onFiltersUpdated?.([unsupportedFilter]);
    });

    expect(toasts.addDanger).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1001);
      result.current.onFiltersUpdated?.([unsupportedFilter]);
    });

    expect(toasts.addDanger).toHaveBeenCalledTimes(2);
  });

  it('reports outbound conversion failure details and returns remaining converted filters', () => {
    const logger = loggerMock.create();
    const toasts = { addDanger: jest.fn() } as any;
    const onFiltersUpdated = jest.fn();
    const supportedFilter = createPhraseFilter('status', 'active');
    const unsupportedFilter = { meta: { key: 'geo', type: 'spatial_filter' } } as Filter;

    const { result } = renderHook(() =>
      useAsCodeFilterConversion({
        asCodeFilterMode: true,
        filters: [],
        onFiltersUpdated,
        logger,
        toasts,
      })
    );

    act(() => {
      result.current.onFiltersUpdated?.([supportedFilter, unsupportedFilter]);
    });

    expect(logger.warn).toHaveBeenCalled();
    expect(captureErrorMock).toHaveBeenCalledWith(expect.any(Error), {
      labels: {
        component: 'unifiedSearchAsCodeFilters',
        direction: 'outbound',
      },
    });
    expect(onFiltersUpdated).toHaveBeenCalledWith([
      {
        type: 'condition',
        condition: {
          field: 'status',
          operator: 'is',
          value: 'active',
        },
      },
    ]);
  });

  it('keeps memoized filter identity stable for unchanged input', () => {
    const filters = [asCodeFilter];
    const { result, rerender } = renderHook(
      ({ currentFilters }) =>
        useAsCodeFilterConversion({
          asCodeFilterMode: true,
          filters: currentFilters,
        }),
      {
        initialProps: {
          currentFilters: filters,
        },
      }
    );

    const firstFilters = result.current.filters;
    rerender({ currentFilters: filters });

    expect(result.current.filters).toBe(firstFilters);
  });
});
