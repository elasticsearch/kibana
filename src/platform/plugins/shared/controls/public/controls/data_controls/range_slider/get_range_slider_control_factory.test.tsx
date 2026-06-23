/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';

import type { estypes } from '@elastic/elasticsearch';
import type { PublishesUnifiedSearch, PresentationContainer } from '@kbn/presentation-publishing';
import type { Query } from '@testing-library/react';
import { render, waitFor } from '@testing-library/react';
import { DEFAULT_RANGE_SLIDER_STATE } from '@kbn/controls-constants';

import { dataService, dataViewsService } from '../../../services/kibana_services';
import { getMockedFinalizeApi } from '../../mocks/control_mocks';
import { getRangesliderControlFactory } from './get_range_slider_control_factory';
import { rangeSliderControlSchema, type RangeSliderControlState } from '@kbn/controls-schemas';
import { ControlValuesSource } from '@kbn/controls-constants';
import type { Filter, AggregateQuery, TimeRange } from '@kbn/es-query';
import type { RangeSliderControlApi } from './types';
import type { DataView } from '@kbn/data-views-plugin/common';

const mockGetESQLResults = jest.fn();
jest.mock('@kbn/esql-utils', () => ({
  ...jest.requireActual('@kbn/esql-utils'),
  getESQLResults: (...args: unknown[]) => mockGetESQLResults(...args),
}));

const DEFAULT_TOTAL_RESULTS = 20;
const DEFAULT_MIN = 0;
const DEFAULT_MAX = 1000;

describe('RangeSliderControlApi', () => {
  const uuid = 'myControl1';

  const dashboardFilters = new BehaviorSubject<Filter[] | undefined>(undefined);
  const mockedDashboardApi = {
    appliedFilters$: dashboardFilters,
    timeRange$: new BehaviorSubject<TimeRange | undefined>(undefined),
    query$: new BehaviorSubject<Query | AggregateQuery | undefined>(undefined),
  } as unknown as PresentationContainer & PublishesUnifiedSearch;

  const parentApi = mockedDashboardApi;
  const factory = getRangesliderControlFactory();
  const finalizeApi = getMockedFinalizeApi(uuid, factory, parentApi);

  let totalResults = DEFAULT_TOTAL_RESULTS;
  let min: estypes.AggregationsSingleMetricAggregateBase['value'] = DEFAULT_MIN;
  let max: estypes.AggregationsSingleMetricAggregateBase['value'] = DEFAULT_MAX;
  dataService.search.searchSource.create = jest.fn().mockImplementation(() => {
    let isAggsRequest = false;
    return {
      setField: (key: string) => {
        if (key === 'aggs') {
          isAggsRequest = true;
        }
      },
      fetch$: () => {
        return isAggsRequest
          ? of({
              rawResponse: { aggregations: { minAgg: { value: min }, maxAgg: { value: max } } },
            })
          : of({
              rawResponse: { hits: { total: { value: totalResults } } },
            });
      },
    };
  });

  dataViewsService.get = jest.fn().mockImplementation(async (id: string): Promise<DataView> => {
    if (id !== 'myDataViewId') {
      throw new Error(`no data view found for id ${id}`);
    }
    return {
      id,
      getFieldByName: (fieldName: string) => {
        return [
          {
            displayName: 'My field name',
            name: 'myFieldName',
            type: 'number',
            toSpec: jest.fn(),
          },
        ].find((field) => fieldName === field.name);
      },
      getFormatterForField: () => {
        return {
          convertToText: (value: string) => `${value} myUnits`,
        };
      },
    } as unknown as DataView;
  });

  dataViewsService.find = jest.fn().mockResolvedValue([{ id: 'myDataViewId' }]);

  beforeEach(() => {
    totalResults = DEFAULT_TOTAL_RESULTS;
    min = DEFAULT_MIN;
    max = DEFAULT_MAX;
  });

  describe('appliedFilters$', () => {
    test('should not set appliedFilters$ when value is not provided', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_RANGE_SLIDER_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
        } as RangeSliderControlState,
        finalizeApi,
        uuid,
        parentApi,
      });
      expect(api.appliedFilters$.value).toBeUndefined();
    });

    test('should set appliedFilters$ when value is provided', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_RANGE_SLIDER_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
          value: ['5', '10'],
        } as RangeSliderControlState,
        finalizeApi,
        uuid,
        parentApi,
      });
      await waitFor(() =>
        expect(api.appliedFilters$.value).toEqual([
          {
            meta: {
              controlledBy: 'myControl1',
              field: 'myFieldName',
              index: 'myDataViewId',
              key: 'myFieldName',
              params: {
                gte: 5,
                lte: 10,
              },
              type: 'range',
            },
            query: {
              range: {
                myFieldName: {
                  gte: 5,
                  lte: 10,
                },
              },
            },
          },
        ])
      );
    });

    test('should set blocking error when data view is not found', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_RANGE_SLIDER_STATE,
          data_view_id: 'notGonnaFindMeDataView',
          field_name: 'myFieldName',
          value: ['5', '10'],
        } as RangeSliderControlState,
        finalizeApi,
        uuid,
        parentApi,
      });
      expect(api.blockingError$.value?.message).toEqual(
        'no data view found for id notGonnaFindMeDataView'
      );
      expect(api.appliedFilters$.value).toBeUndefined();
    });
  });

  describe('selected range has no results', () => {
    test('should display invalid state', async () => {
      totalResults = 0; // simulate no results by returning hits total of zero
      min = null; // simulate no results by returning min aggregation value of null
      max = null; // simulate no results by returning max aggregation value of null
      const { Component } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_RANGE_SLIDER_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
          value: ['5', '10'],
        } as RangeSliderControlState,
        finalizeApi,
        uuid,
        parentApi,
      });
      const { findByTestId } = render(<Component />);
      await waitFor(async () => {
        await findByTestId('range-slider-control-invalid-append-myControl1');
      });
    });
  });

  describe('min max', () => {
    test('bounds inputs should display min and max placeholders when there is no selected range', async () => {
      const { Component } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_RANGE_SLIDER_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
        } as RangeSliderControlState,
        finalizeApi,
        uuid,
        parentApi,
      });
      const { findByTestId } = render(<Component />);
      await waitFor(async () => {
        const minInput = await findByTestId('rangeSlider__lowerBoundFieldNumber');
        expect(minInput).toHaveAttribute('placeholder', String(DEFAULT_MIN));
        const maxInput = await findByTestId('rangeSlider__upperBoundFieldNumber');
        expect(maxInput).toHaveAttribute('placeholder', String(DEFAULT_MAX));
      });
    });

    test('fetches min/max from ES|QL when values_source is esql', async () => {
      mockGetESQLResults.mockResolvedValue({
        response: {
          columns: [{ name: 'myFieldName', type: 'long' }],
          values: [[42], [256], [1024]],
        },
      });

      const { Component } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_RANGE_SLIDER_STATE,
          values_source: ControlValuesSource.ESQL,
          esql_query: 'FROM bytes-* | KEEP bytes',
        } as RangeSliderControlState,
        finalizeApi,
        uuid,
        parentApi,
      });
      const { findByTestId } = render(<Component />);
      await waitFor(async () => {
        expect(await findByTestId('rangeSlider__lowerBoundFieldNumber')).toHaveAttribute(
          'placeholder',
          '42'
        );
        expect(await findByTestId('rangeSlider__upperBoundFieldNumber')).toHaveAttribute(
          'placeholder',
          '1024'
        );
      });
    });
  });

  describe('step state', () => {
    test('default value provided when state.step is undefined', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_RANGE_SLIDER_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
        } as RangeSliderControlState,
        finalizeApi,
        uuid,
        parentApi,
      });
      const serializedState = api.serializeState() as RangeSliderControlState;
      expect(serializedState.step).toBe(1);
    });

    test('retains value from initial state', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_RANGE_SLIDER_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
          step: 1024,
        } as RangeSliderControlState,
        finalizeApi,
        uuid,
        parentApi,
      });
      const serializedState = api.serializeState() as RangeSliderControlState;
      expect(serializedState.step).toBe(1024);
    });
  });

  describe('unsaved changes', () => {
    test('should have unsaved changes when there are changes', async () => {
      const lastSavedState = rangeSliderControlSchema.validate({
        values_source: ControlValuesSource.FIELD,
        data_view_id: 'oldDataViewId',
        field_name: 'myFieldName',
      });
      const initialState = {
        ...lastSavedState,
        values_source: ControlValuesSource.FIELD,
        data_view_id: 'newDataViewId',
      } as RangeSliderControlState;
      const embeddable = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState,
        finalizeApi,
        uuid,
        parentApi: {
          lastSavedStateForChild$: () => of(lastSavedState),
          getLastSavedStateForChild: lastSavedState,
        },
      });
      const hasUnsavedChanges = await firstValueFrom(embeddable.api.hasUnsavedChanges$);
      expect(hasUnsavedChanges).toBe(true);
    });

    test('should not have unsaved changes when there are no changes', async () => {
      const initialState = rangeSliderControlSchema.validate({
        values_source: ControlValuesSource.FIELD,
        data_view_id: 'myDataViewId',
        field_name: 'myFieldName',
      });
      const embeddable = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState,
        finalizeApi,
        uuid,
        parentApi: {
          lastSavedStateForChild$: () => of(initialState),
          getLastSavedStateForChild: initialState,
        },
      });
      const hasUnsavedChanges = await firstValueFrom(embeddable.api.hasUnsavedChanges$);
      expect(hasUnsavedChanges).toBe(false);
    });
  });

  describe('anyStateChange$', () => {
    let embeddableApi: RangeSliderControlApi;
    beforeEach((done) => {
      factory
        .buildEmbeddable({
          initializeDrilldownsManager: jest.fn(),
          initialState: rangeSliderControlSchema.validate({
            data_view_id: 'oldDataViewId',
            field_name: 'myFieldName',
          }),
          finalizeApi,
          uuid,
          parentApi: {},
        })
        .then(({ api }) => {
          embeddableApi = api;
          done();
        })
        .catch(done);
    });

    test('should not emit on subscribe and emit when any state changes', (done) => {
      embeddableApi.anyStateChange$.subscribe(() => {
        try {
          const { title } = embeddableApi.serializeState();
          expect(title).toBe('cute puppies');
        } catch (error) {
          // title assertion fails when
          // anyStateChange$ emits on subscribe
          done(error);
          return;
        }
        done();
      });
      embeddableApi.setTitle('cute puppies');
    });
  });
});
