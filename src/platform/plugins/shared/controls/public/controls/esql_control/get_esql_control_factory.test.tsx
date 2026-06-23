/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { EsqlControlType, ESQLVariableType } from '@kbn/esql-types';
import {
  optionsListESQLControlSchema,
  type OptionsListESQLControlState,
} from '@kbn/controls-schemas';
import { DEFAULT_ESQL_OPTIONS_LIST_STATE } from '@kbn/controls-constants';
import { getMockedFinalizeApi } from '../mocks/control_mocks';
import { getESQLControlFactory } from './get_esql_control_factory';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import type { ESQLControlApi } from './types';

const mockGetESQLSingleColumnValues = jest.fn(() => ({ options: ['option1', 'option2'] }));
const mockIsSuccess = jest.fn(() => true);

const mockFetch$ = new BehaviorSubject({});
jest.mock('@kbn/presentation-publishing', () => ({
  ...jest.requireActual('@kbn/presentation-publishing'),
  fetch$: () => mockFetch$,
}));

jest.mock('../../../common/options_list/get_esql_single_column_values', () => {
  const getESQLSingleColumnValues = async () => mockGetESQLSingleColumnValues();
  getESQLSingleColumnValues.isSuccess = () => mockIsSuccess();
  return {
    getESQLSingleColumnValues,
  };
});

describe('ESQLControlApi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const uuid = 'myESQLControl';

  const dashboardApi = { panelIsPinned: () => true };
  const factory = getESQLControlFactory();
  const finalizeApi = getMockedFinalizeApi(uuid, factory, dashboardApi);

  test('should publish ES|QL variable', async () => {
    const initialState: OptionsListESQLControlState = {
      ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
      selected_options: ['option1'],
      available_options: ['option1', 'option2'],
      variable_name: 'variable1',
      variable_type: 'values',
      control_type: 'STATIC_VALUES',
    };
    const { api } = await factory.buildEmbeddable({
      initializeDrilldownsManager: jest.fn(),
      initialState,
      finalizeApi,
      uuid,
      parentApi: dashboardApi,
    });
    expect(api.esqlVariable$.value).toStrictEqual({
      key: 'variable1',
      type: 'values',
      value: 'option1',
      meta: {
        controlledBy: 'myESQLControl',
      },
    });
  });

  test('should serialize state', async () => {
    const initialState: OptionsListESQLControlState = {
      ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
      selected_options: ['option1'],
      available_options: ['option1', 'option2'],
      variable_name: 'variable1',
      variable_type: 'values',
      control_type: EsqlControlType.STATIC_VALUES,
    };
    const { api } = await factory.buildEmbeddable({
      initializeDrilldownsManager: jest.fn(),
      initialState,
      finalizeApi,
      uuid,
      parentApi: dashboardApi,
    });
    expect(api.serializeState()).toStrictEqual({
      available_options: ['option1', 'option2'],
      control_type: 'STATIC_VALUES',
      selected_options: ['option1'],
      title: undefined,
      variable_name: 'variable1',
      variable_type: 'values',
      single_select: true,
    });
  });

  describe('values from query', () => {
    test('should update on load and fetch', async () => {
      const initialState: OptionsListESQLControlState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        selected_options: ['option1'],
        variable_name: 'variable1',
        variable_type: 'values',
        esql_query: 'FROM foo | STATS BY column',
        control_type: EsqlControlType.VALUES_FROM_QUERY,
      };
      await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState,
        finalizeApi,
        uuid,
        parentApi: dashboardApi,
      });
      await waitFor(() => {
        expect(mockGetESQLSingleColumnValues).toHaveBeenCalledTimes(1);
        expect(mockIsSuccess).toHaveBeenCalledTimes(1);
      });
      mockFetch$.next({});
    });

    test('should update when variables change for queries with dependencies', async () => {
      const initialState: OptionsListESQLControlState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        selected_options: ['option1'],
        variable_name: 'variable2',
        variable_type: 'values',
        esql_query: 'FROM foo | WHERE column1 == ?variable1 | STATS BY column2',
        control_type: EsqlControlType.VALUES_FROM_QUERY,
      };
      await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState,
        finalizeApi,
        uuid,
        parentApi: dashboardApi,
      });
      await waitFor(() => {
        expect(mockGetESQLSingleColumnValues).toHaveBeenCalledTimes(1);
        expect(mockIsSuccess).toHaveBeenCalledTimes(1);
      });
      // Variable change
      mockFetch$.next({
        esqlVariables: [
          {
            key: 'variable1',
            value: 'newValue',
            type: ESQLVariableType.VALUES,
          },
        ],
      });

      await waitFor(() => {
        expect(mockGetESQLSingleColumnValues).toHaveBeenCalledTimes(2);
        expect(mockIsSuccess).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('changing the dropdown', () => {
    test('should publish new ES|QL variable', async () => {
      const initialState: OptionsListESQLControlState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        selected_options: ['option1'],
        available_options: ['option1', 'option2'],
        variable_name: 'variable1',
        variable_type: 'values',
        control_type: 'STATIC_VALUES',
      };
      const { Component, api } = await factory.buildEmbeddable({
        initializeDrilldownsManager: jest.fn(),
        initialState,
        finalizeApi,
        uuid,
        parentApi: dashboardApi,
      });

      expect(api.esqlVariable$.value).toStrictEqual({
        key: 'variable1',
        type: 'values',
        value: 'option1',
        meta: {
          controlledBy: 'myESQLControl',
        },
      });

      const { findByTestId, findByTitle } = render(<Component />);
      fireEvent.click(await findByTestId('optionsListSelections'));
      fireEvent.click(await findByTitle('option2'));

      await waitFor(() => {
        expect(api.esqlVariable$.value).toStrictEqual({
          key: 'variable1',
          type: 'values',
          value: 'option2',
          meta: {
            controlledBy: 'myESQLControl',
          },
        });
      });
    });
  });

  describe('unsaved changes', () => {
    test('should have unsaved changes when there are changes', async () => {
      const lastSavedState = optionsListESQLControlSchema.validate({
        control_type: 'VALUES_FROM_QUERY',
        selected_options: ['osx'],
        variable_name: 'old name',
        variable_type: 'values',
        esql_query: 'from kibana_sample_data_logs | KEEP machine.os.keyword',
      });
      const initialState = {
        ...lastSavedState,
        variable_name: 'new name',
      };
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
      const initialState = optionsListESQLControlSchema.validate({
        control_type: 'VALUES_FROM_QUERY',
        selected_options: ['osx'],
        variable_name: 'machineOs',
        variable_type: 'values',
        esql_query: 'from kibana_sample_data_logs | KEEP machine.os.keyword',
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
    let embeddableApi: ESQLControlApi<OptionsListESQLControlState>;
    beforeEach((done) => {
      factory
        .buildEmbeddable({
          initializeDrilldownsManager: jest.fn(),
          initialState: optionsListESQLControlSchema.validate({
            control_type: 'VALUES_FROM_QUERY',
            selected_options: ['osx'],
            variable_name: 'machineOs',
            variable_type: 'values',
            esql_query: 'from kibana_sample_data_logs | KEEP machine.os.keyword',
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
