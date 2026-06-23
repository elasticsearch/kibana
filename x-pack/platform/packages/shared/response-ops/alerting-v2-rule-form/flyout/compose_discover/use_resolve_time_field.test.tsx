/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@kbn/react-query';
import type { HttpStart } from '@kbn/core/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import { getESQLTimeFieldFromQuery } from '@kbn/esql-utils';
import { createTestQueryClient } from '../../test_utils';
import { useDataFields } from '../../form/hooks/use_data_fields';
import { ruleFormKeys } from '../../form/hooks/query_key_factory';
import { useResolveTimeField } from './use_resolve_time_field';

jest.mock('@kbn/esql-utils', () => ({
  getESQLTimeFieldFromQuery: jest.fn(async () => undefined),
}));

jest.mock('../../form/hooks/use_data_fields', () => ({
  useDataFields: jest.fn(() => ({ data: {}, isLoading: false })),
}));

const FLIGHTS_QUERY =
  'FROM kibana_sample_data_flights | STATS COUNT(*) BY timestamp | WHERE Cancelled == "true"';

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const defaultParams = {
  query: FLIGHTS_QUERY,
  timeField: '@timestamp',
  http: {} as HttpStart,
  dataViews: {} as DataViewsPublicPluginStart,
};

describe('useResolveTimeField', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useDataFields as jest.Mock).mockReturnValue({ data: {}, isLoading: false });
    (getESQLTimeFieldFromQuery as jest.Mock).mockResolvedValue(undefined);
  });

  it('auto-corrects to the first date field from field caps', async () => {
    const onTimeFieldChange = jest.fn();
    (useDataFields as jest.Mock).mockReturnValue({
      data: {
        timestamp: { name: 'timestamp', type: 'date', searchable: true, aggregatable: true },
      },
      isLoading: false,
    });

    renderHook(
      () =>
        useResolveTimeField({
          ...defaultParams,
          onTimeFieldChange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(onTimeFieldChange).toHaveBeenCalledWith('timestamp');
    });
  });

  it('falls back to the ES|QL timefield API when field caps return no date fields', async () => {
    const onTimeFieldChange = jest.fn();
    (getESQLTimeFieldFromQuery as jest.Mock).mockResolvedValue('timestamp');

    renderHook(
      () =>
        useResolveTimeField({
          ...defaultParams,
          onTimeFieldChange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(getESQLTimeFieldFromQuery).toHaveBeenCalledWith({
        query: 'FROM kibana_sample_data_flights',
        http: defaultParams.http,
      });
      expect(onTimeFieldChange).toHaveBeenCalledWith('timestamp');
    });
  });

  it('does not call onTimeFieldChange when the current time field is valid', async () => {
    const onTimeFieldChange = jest.fn();
    (useDataFields as jest.Mock).mockReturnValue({
      data: {
        '@timestamp': { name: '@timestamp', type: 'date', searchable: true, aggregatable: true },
      },
      isLoading: false,
    });

    renderHook(
      () =>
        useResolveTimeField({
          ...defaultParams,
          timeField: '@timestamp',
          onTimeFieldChange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(onTimeFieldChange).not.toHaveBeenCalled();
    });
  });

  it('resets to @timestamp when no date fields are found and API returns nothing', async () => {
    const onTimeFieldChange = jest.fn();

    renderHook(
      () =>
        useResolveTimeField({
          ...defaultParams,
          timeField: 'event.start',
          onTimeFieldChange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(onTimeFieldChange).toHaveBeenCalledWith('@timestamp');
    });
  });

  it('does not reset timeField when no query is committed yet', async () => {
    const onTimeFieldChange = jest.fn();

    renderHook(
      () =>
        useResolveTimeField({
          ...defaultParams,
          query: '',
          timeField: 'event.start',
          onTimeFieldChange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(onTimeFieldChange).not.toHaveBeenCalled();
    });
  });

  it('skips resolution and auto-correction when enabled is false', async () => {
    const onTimeFieldChange = jest.fn();
    (useDataFields as jest.Mock).mockReturnValue({
      data: {
        timestamp: { name: 'timestamp', type: 'date', searchable: true, aggregatable: true },
      },
      isLoading: false,
    });

    const { result } = renderHook(
      () =>
        useResolveTimeField({
          ...defaultParams,
          timeField: '@timestamp',
          onTimeFieldChange,
          enabled: false,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(useDataFields).toHaveBeenCalledWith(
        expect.objectContaining({
          query: '',
        })
      );
      expect(onTimeFieldChange).not.toHaveBeenCalled();
      expect(getESQLTimeFieldFromQuery).not.toHaveBeenCalled();
      expect(result.current.isTimeFieldResolved).toBe(true);
    });
  });

  it('reports isTimeFieldResolved once correction completes', async () => {
    (useDataFields as jest.Mock).mockReturnValue({
      data: {
        timestamp: { name: 'timestamp', type: 'date', searchable: true, aggregatable: true },
      },
      isLoading: false,
    });

    const { result } = renderHook(
      () =>
        useResolveTimeField({
          ...defaultParams,
          timeField: 'timestamp',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isTimeFieldResolved).toBe(true);
      expect(result.current.timeFieldOptions).toEqual([{ value: 'timestamp', text: 'timestamp' }]);
    });
  });

  it('uses ruleFormKeys for the API fallback query key', () => {
    expect(ruleFormKeys.composeDiscoverApiTimeField('FROM kibana_sample_data_flights')).toEqual([
      'ruleForm',
      'composeDiscoverApiTimeField',
      'FROM kibana_sample_data_flights',
    ]);
  });
});
