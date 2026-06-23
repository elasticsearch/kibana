/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ControlValuesSource, DEFAULT_DSL_OPTIONS_LIST_STATE } from '@kbn/controls-constants';
import type { DataView } from '@kbn/data-views-plugin/common';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_view.stub';
import { waitFor } from '@testing-library/react';

import { dataViewsService } from '../../../services/kibana_services';
import { getMockedFinalizeApi } from '../../mocks/control_mocks';
import { getOptionsListControlFactory } from './get_options_list_control_factory';
import type { OptionsListDSLControlState } from '@kbn/controls-schemas';
import { optionsListDSLControlSchema } from '@kbn/controls-schemas';
import { firstValueFrom, of } from 'rxjs';
import type { OptionsListControlApi } from './types';

describe('Options List Control Api', () => {
  const uuid = 'myControl1';
  const factory = getOptionsListControlFactory();
  const finalizeApi = getMockedFinalizeApi(uuid, factory);

  const getDataView = async (id: string): Promise<DataView> => {
    if (id !== 'myDataViewId') {
      throw new Error(`Simulated error: no data view found for id ${id}`);
    }
    const stubDataView = createStubDataView({
      spec: {
        id: 'myDataViewId',
        fields: {
          myFieldName: {
            name: 'myFieldName',
            customLabel: 'My field name',
            type: 'string',
            esTypes: ['keyword'],
            aggregatable: true,
            searchable: true,
          },
        },
        title: 'logstash-*',
        timeFieldName: '@timestamp',
      },
    });
    stubDataView.getFormatterForField = jest.fn().mockImplementation(() => {
      return {
        convertToText: (value: string) => `${value}:formatted`,
        toJSON: (value: any) => JSON.stringify(value),
      };
    });
    return stubDataView;
  };

  describe('initialization', () => {
    let dataviewDelayPromise: Promise<void> | undefined;

    beforeAll(() => {
      dataViewsService.get = jest.fn().mockImplementation(async (id: string) => {
        if (dataviewDelayPromise) await dataviewDelayPromise;
        return getDataView(id);
      });
    });

    it('returns api immediately when no initial selections are configured', async () => {
      let resolveDataView: (() => void) | undefined;
      let apiReturned = false;
      dataviewDelayPromise = new Promise((res) => (resolveDataView = res));
      (async () => {
        await factory.buildEmbeddable({
          initializeDrilldownsManager: jest.fn(),
          initialState: {
            ...DEFAULT_DSL_OPTIONS_LIST_STATE,
            data_view_id: 'myDataViewId',
            field_name: 'myFieldName',
          } as OptionsListDSLControlState,
          finalizeApi,
          uuid,
          parentApi: {},
        });
        apiReturned = true;
      })();
      await new Promise((r) => setTimeout(r, 1));
      expect(apiReturned).toBe(true);
      resolveDataView?.();
      dataviewDelayPromise = undefined;
    });

    it('waits until data view is available before returning api when initial selections are configured', async () => {
      let resolveDataView: (() => void) | undefined;
      let apiReturned = false;
      dataviewDelayPromise = new Promise((res) => (resolveDataView = res));
      (async () => {
        await factory.buildEmbeddable({
          initializeDrilldownsManager: jest.fn(),
          initialState: {
            ...DEFAULT_DSL_OPTIONS_LIST_STATE,
            data_view_id: 'myDataViewId',
            field_name: 'myFieldName',
            selected_options: ['cool', 'test'],
          } as OptionsListDSLControlState,
          finalizeApi,
          uuid,
          parentApi: {},
        });
        apiReturned = true;
      })();

      // even after 10ms the API should not have returned yet because the data view was not available
      await new Promise((r) => setTimeout(r, 10));
      expect(apiReturned).toBe(false);

      // resolve the data view and ensure the api returns
      resolveDataView?.();
      await new Promise((r) => setTimeout(r, 10));
      expect(apiReturned).toBe(true);
      dataviewDelayPromise = undefined;
    });
  });

  describe('appliedFilters$', () => {
    beforeAll(() => {
      dataViewsService.get = jest.fn().mockImplementation(getDataView);
    });

    test('should not set appliedFilters$ when selectedOptions is not provided', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_DSL_OPTIONS_LIST_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
        } as OptionsListDSLControlState,
        finalizeApi,
        uuid,
        parentApi: {},
      });
      expect(api.appliedFilters$.value).toBeUndefined();
    });

    test('should set appliedFilters$ when selectedOptions is provided', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_DSL_OPTIONS_LIST_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
          selected_options: ['cool', 'test'],
        } as OptionsListDSLControlState,
        finalizeApi,
        uuid,
        parentApi: {},
      });
      expect(api.appliedFilters$.value).toEqual([
        {
          meta: {
            controlledBy: 'myControl1',
            index: 'myDataViewId',
            key: 'myFieldName',
            params: ['cool', 'test'],
            type: 'phrases',
          },
          query: {
            bool: {
              minimum_should_match: 1,
              should: [
                {
                  match_phrase: {
                    myFieldName: 'cool',
                  },
                },
                {
                  match_phrase: {
                    myFieldName: 'test',
                  },
                },
              ],
            },
          },
        },
      ]);
    });

    test('should set appliedFilters$ when exists is selected', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_DSL_OPTIONS_LIST_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
          exists_selected: true,
        } as OptionsListDSLControlState,
        finalizeApi,
        uuid,
        parentApi: {},
      });
      expect(api.appliedFilters$.value).toEqual([
        {
          meta: {
            controlledBy: 'myControl1',
            index: 'myDataViewId',
            key: 'myFieldName',
          },
          query: {
            exists: {
              field: 'myFieldName',
            },
          },
        },
      ]);
    });

    test('should set appliedFilters$ when exclude is selected', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_DSL_OPTIONS_LIST_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
          exists_selected: true,
          exclude: true,
        } as OptionsListDSLControlState,
        finalizeApi,
        uuid,
        parentApi: {},
      });
      expect(api.appliedFilters$.value).toEqual([
        {
          meta: {
            controlledBy: 'myControl1',
            index: 'myDataViewId',
            key: 'myFieldName',
            negate: true,
          },
          query: {
            exists: {
              field: 'myFieldName',
            },
          },
        },
      ]);
    });

    test('should set appliedFilters$ when option is selected', async () => {
      const { api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState: {
          ...DEFAULT_DSL_OPTIONS_LIST_STATE,
          data_view_id: 'myDataViewId',
          field_name: 'myFieldName',
        } as OptionsListDSLControlState,
        finalizeApi,
        uuid,
        parentApi: {},
      });
      api.setSelectedOptions(['woof']);
      await waitFor(() => {
        expect(api.appliedFilters$.value).toEqual([
          {
            meta: { controlledBy: uuid, index: 'myDataViewId', key: 'myFieldName' },
            query: {
              match_phrase: {
                myFieldName: 'woof',
              },
            },
          },
        ]);
      });
    });
  });

  describe('unsaved changes', () => {
    test('should have unsaved changes when there are changes', async () => {
      const lastSavedState = optionsListDSLControlSchema.validate({
        values_source: ControlValuesSource.FIELD,
        data_view_id: 'oldDataViewId',
        field_name: 'myFieldName',
      });
      const initialState = {
        ...lastSavedState,
        values_source: ControlValuesSource.FIELD,
        data_view_id: 'newDataViewId',
      } as OptionsListDSLControlState;
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
      const initialState = optionsListDSLControlSchema.validate({
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
    let embeddableApi: OptionsListControlApi;
    beforeEach((done) => {
      factory
        .buildEmbeddable({
          initializeDrilldownsManager: jest.fn(),
          initialState: optionsListDSLControlSchema.validate({
            data_view_id: 'myDataViewId',
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
