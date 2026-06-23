/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { waitFor } from '@testing-library/react';
import { EsqlControlType, ESQLVariableType } from '@kbn/esql-types';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import { DEFAULT_ESQL_OPTIONS_LIST_STATE } from '@kbn/controls-constants';
import { initializeESQLControlManager } from './esql_control_manager';
import { BehaviorSubject } from 'rxjs';

const MOCK_VALUES_FROM_QUERY = ['option1', 'option2', 'option3', 'option4', 'option5'];

jest.mock('../../../common/options_list/get_esql_single_column_values', () => {
  const fn = Object.assign(
    jest.fn(async () => ({
      values: MOCK_VALUES_FROM_QUERY,
      column: { type: 'keyword' },
    })),
    {
      isSuccess: () => true,
    }
  );
  return { getESQLSingleColumnValues: fn };
});

const getMock = () =>
  jest.requireMock('../../../common/options_list/get_esql_single_column_values')
    .getESQLSingleColumnValues as jest.Mock;

const mockFetch$ = new BehaviorSubject({});
jest.mock('@kbn/presentation-publishing', () => ({
  ...jest.requireActual('@kbn/presentation-publishing'),
  fetch$: () => mockFetch$,
}));

describe('initializeESQLControlManager', () => {
  const uuid = 'myESQLControl';

  const dashboardApi = {};

  describe('values from query', () => {
    test('should load availableOptions but not serialize them', async () => {
      const initialState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        selected_options: ['option1'],
        available_options: ['option1', 'option2'], // Test backwards compatibility with serialized availableOptions
        variable_name: 'variable1',
        variable_type: 'values',
        esql_query: 'FROM foo | STATS BY column',
        control_type: EsqlControlType.VALUES_FROM_QUERY,
      } as OptionsListESQLControlState;

      let dataHasLoaded = false;
      const selections = initializeESQLControlManager(uuid, dashboardApi, initialState, jest.fn());

      selections.internalApi.availableOptions$.subscribe((result) => {
        if (result?.length === 5) dataHasLoaded = true;
      });

      await waitFor(() => {
        expect(dataHasLoaded).toBe(true);
      });

      const latestState = selections.getLatestState();
      expect('availableOptions' in latestState).toBeFalsy();
      expect(latestState).toMatchInlineSnapshot(`
        Object {
          "control_type": "VALUES_FROM_QUERY",
          "esql_query": "FROM foo | STATS BY column",
          "selected_options": Array [
            "option1",
          ],
          "single_select": true,
          "variable_name": "variable1",
          "variable_type": "values",
        }
      `);
    });
  });

  describe('static values', () => {
    test('should not load availableOptions and instead just serialize them', async () => {
      const initialState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        selected_options: ['option1'],
        available_options: ['option1', 'option2'],
        variable_name: 'variable1',
        variable_type: 'values',
        control_type: EsqlControlType.STATIC_VALUES,
      } as OptionsListESQLControlState;

      const selections = initializeESQLControlManager(uuid, dashboardApi, initialState, jest.fn());

      await waitFor(() => {
        const availableOptions = selections.internalApi.availableOptions$.getValue();
        expect(availableOptions?.length).toBe(2);
      });

      const latestState = selections.getLatestState();
      expect(latestState).toMatchInlineSnapshot(`
        Object {
          "available_options": Array [
            "option1",
            "option2",
          ],
          "control_type": "STATIC_VALUES",
          "selected_options": Array [
            "option1",
          ],
          "single_select": true,
          "variable_name": "variable1",
          "variable_type": "values",
        }
      `);
    });
  });

  describe('esqlVariable$', () => {
    test('should emit single value for single-select mode', async () => {
      const initialState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        selected_options: ['option1'],
        available_options: ['option1', 'option2'],
        variable_name: 'myVariable',
        variable_type: 'values',
        control_type: EsqlControlType.STATIC_VALUES,
        title: 'Test Control',
        esql_query: '',
      } as OptionsListESQLControlState;

      const selections = initializeESQLControlManager(uuid, dashboardApi, initialState, jest.fn());
      await waitFor(() => {
        const variable = selections.api.esqlVariable$.getValue();
        expect(variable).toEqual({
          key: 'myVariable',
          value: 'option1',
          type: 'values',
          meta: {
            controlledBy: 'myESQLControl',
          },
        });
      });
    });

    test('should emit array for multi-select mode', async () => {
      const initialState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        selected_options: ['option1', 'option2'],
        available_options: ['option1', 'option2', 'option3'],
        variable_name: 'myVariable',
        variable_type: 'values',
        control_type: EsqlControlType.STATIC_VALUES,
        single_select: false,
        title: 'Test Control',
        esql_query: '',
      } as OptionsListESQLControlState;

      const selections = initializeESQLControlManager(uuid, dashboardApi, initialState, jest.fn());
      await waitFor(() => {
        const variable = selections.api.esqlVariable$.getValue();
        expect(variable).toEqual({
          key: 'myVariable',
          value: ['option1', 'option2'],
          type: 'values',
          meta: {
            controlledBy: 'myESQLControl',
          },
        });
      });
    });
  });

  describe('chaining variables controls', () => {
    test('should refetch values when the query variables change', async () => {
      const initialState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        variable_name: 'variable2',
        variable_type: ESQLVariableType.VALUES,
        // query depends on another variable
        esql_query: 'FROM foo | WHERE column1 == ?variable1 | STATS BY column2',
        control_type: EsqlControlType.VALUES_FROM_QUERY,
        title: 'My variable',
      } as OptionsListESQLControlState;

      const setDataLoadingMock = jest.fn();
      initializeESQLControlManager(uuid, dashboardApi, initialState, setDataLoadingMock);

      setDataLoadingMock.mockClear();
      // Initial variables
      mockFetch$.next({
        esqlVariables: [
          {
            key: 'variable1',
            value: 'newValue1',
            type: ESQLVariableType.VALUES,
          },
        ],
      });

      await waitFor(() => {
        expect(setDataLoadingMock).toHaveBeenCalledWith(false);
      });

      // Change the variable
      setDataLoadingMock.mockClear();
      mockFetch$.next({
        esqlVariables: [
          {
            key: 'variable1',
            value: 'newValue2',
            type: ESQLVariableType.VALUES,
          },
        ],
      });

      await waitFor(() => {
        expect(setDataLoadingMock).toHaveBeenCalledWith(true);
      });
    });

    test("should not refetch when the variable value doesn't change", async () => {
      const initialState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        variable_name: 'variable1',
        variable_type: ESQLVariableType.VALUES,
        esql_query: 'FROM foo | WHERE column1 == ?variable2 | STATS BY column2',
        control_type: EsqlControlType.VALUES_FROM_QUERY,
        title: 'My variable',
      } as OptionsListESQLControlState;

      const setDataLoadingMock = jest.fn();
      initializeESQLControlManager(uuid, dashboardApi, initialState, setDataLoadingMock);

      // Initial variables
      mockFetch$.next({
        esqlVariables: [
          {
            key: 'variable1',
            value: 'newValue1',
            type: ESQLVariableType.VALUES,
          },
        ],
      });

      await waitFor(() => {
        expect(setDataLoadingMock).toHaveBeenCalledWith(false);
      });

      setDataLoadingMock.mockClear();
      mockFetch$.next({
        esqlVariables: [
          {
            key: 'variable1',
            value: 'newValue1',
            type: ESQLVariableType.VALUES,
          },
        ],
      });

      expect(setDataLoadingMock).not.toHaveBeenCalled();
    });

    test('should refetch values when the timeRange changes', async () => {
      const initialState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        variable_name: 'variable1',
        variable_type: ESQLVariableType.VALUES,
        esql_query:
          'FROM foo | WHERE @timestamp >= ?start AND @timestamp <= ?end | STATS BY column',
        control_type: EsqlControlType.VALUES_FROM_QUERY,
        title: 'My variable',
      } as OptionsListESQLControlState;

      const setDataLoadingMock = jest.fn();
      initializeESQLControlManager(uuid, dashboardApi, initialState, setDataLoadingMock);

      setDataLoadingMock.mockClear();
      // Initial fetch with timeRange
      mockFetch$.next({
        timeRange: { from: '2024-01-01', to: '2024-01-31' },
        esqlVariables: [],
      });

      await waitFor(() => {
        expect(setDataLoadingMock).toHaveBeenCalledWith(false);
      });

      // Change the timeRange (query and variables stay the same)
      setDataLoadingMock.mockClear();
      mockFetch$.next({
        timeRange: { from: '2024-02-01', to: '2024-02-28' },
        esqlVariables: [],
      });

      await waitFor(() => {
        expect(setDataLoadingMock).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('abort signal', () => {
    test('should pass an AbortSignal to getESQLSingleColumnValues', async () => {
      const initialState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        variable_name: 'variable1',
        variable_type: ESQLVariableType.VALUES,
        esql_query: 'FROM foo | STATS BY column',
        control_type: EsqlControlType.VALUES_FROM_QUERY,
      } as OptionsListESQLControlState;

      const mock = getMock();
      mock.mockClear();
      initializeESQLControlManager(uuid, dashboardApi, initialState, jest.fn());

      await waitFor(() => {
        expect(mock).toHaveBeenCalled();
      });

      const callArgs = mock.mock.calls[0][0];
      expect(callArgs.signal).toBeInstanceOf(AbortSignal);
      expect(callArgs.signal.aborted).toBe(false);
    });

    test('should abort the signal on cleanup', async () => {
      const initialState = {
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        variable_name: 'variable1',
        variable_type: ESQLVariableType.VALUES,
        esql_query: 'FROM foo | STATS BY column',
        control_type: EsqlControlType.VALUES_FROM_QUERY,
      } as OptionsListESQLControlState;

      const mock = getMock();
      mock.mockClear();
      const manager = initializeESQLControlManager(uuid, dashboardApi, initialState, jest.fn());

      await waitFor(() => {
        expect(mock).toHaveBeenCalled();
      });

      const callArgs = mock.mock.calls[0][0];
      expect(callArgs.signal.aborted).toBe(false);

      manager.cleanup();

      expect(callArgs.signal.aborted).toBe(true);
    });
  });
});
