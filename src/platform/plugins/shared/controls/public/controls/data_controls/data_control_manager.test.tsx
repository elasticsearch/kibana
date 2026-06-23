/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/public';
import { BehaviorSubject, first, skip } from 'rxjs';
import type { ESQLControlVariable } from '@kbn/esql-types';
import { ESQLVariableType } from '@kbn/esql-types';
import { dataViewsService } from '../../services/kibana_services';
import { initializeDataControlManager } from './data_control_manager';
import { initializeStateManager } from '@kbn/presentation-publishing';
import { ControlValuesSource, DEFAULT_DATA_CONTROL_STATE } from '@kbn/controls-constants';
import type { DataControlState } from '@kbn/controls-schemas';

const mockGetESQLSingleColumnValues = jest.fn();
jest.mock('../../../common/options_list/get_esql_single_column_values', () => {
  const fn = (...args: unknown[]) => mockGetESQLSingleColumnValues(...args);
  fn.isSuccess = (result: unknown) => !!result && 'column' in (result as Record<string, unknown>);
  fn.isMultiColumnError = (result: unknown) =>
    !!result && 'columns' in (result as Record<string, unknown>);
  fn.hasNoResults = (result: unknown) =>
    fn.isSuccess(result) && !(result as { values?: unknown[] }).values?.length;
  fn.isNumericResult = () => false;
  return { getESQLSingleColumnValues: fn };
});

jest.mock('../utils/get_data_view_id_from_esql_query', () => ({
  getDataViewIdFromESQLQuery: jest.fn().mockResolvedValue('myDataViewId'),
}));

describe('initializeDataControlManager', () => {
  const dataControlState: DataControlState = {
    ...DEFAULT_DATA_CONTROL_STATE,
    data_view_id: 'myDataViewId',
    field_name: 'myFieldName',
    values_source: ControlValuesSource.FIELD,
    esql_query: undefined as never,
    title: undefined,
  };

  dataViewsService.get = async (id: string): Promise<DataView> => {
    if (id !== 'myDataViewId') {
      throw new Error(`Simulated error: no data view found for id ${id}`);
    }
    return {
      id,
      getFieldByName: (fieldName: string) => {
        return [
          {
            displayName: 'My field name',
            name: 'myFieldName',
            type: 'string',
            toSpec: () => ({ name: 'myFieldName', type: 'string' }),
          },
        ].find((field) => fieldName === field.name);
      },
      getFormatterForField: () => ({
        getConverterFor: () => (value: unknown) => String(value),
      }),
    } as unknown as DataView;
  };

  describe('data_view_id subscription', () => {
    describe('no blocking errors', () => {
      let dataControlManager: undefined | Awaited<ReturnType<typeof initializeDataControlManager>>;
      beforeAll((done) => {
        initializeDataControlManager({
          controlId: 'myControlId',
          controlType: 'myControlType',
          state: dataControlState,
          editorStateManager: initializeStateManager({}, {}),
          parentApi: {},
          typeDisplayName: 'My Control Type',
        }).then((controlManager) => {
          dataControlManager = controlManager;
          dataControlManager.api.defaultTitle$!.pipe(skip(1), first()).subscribe(() => {
            done();
          });
        });
      });

      test('should set data view', () => {
        const dataViews = dataControlManager!.api.dataViews$.value;
        expect(dataViews).not.toBeUndefined();
        expect(dataViews!.length).toBe(1);
        expect(dataViews![0].id).toBe('myDataViewId');
      });

      test('should set default panel title', () => {
        const defaultPanelTitle = dataControlManager!.api.defaultTitle$!.value;
        expect(defaultPanelTitle).not.toBeUndefined();
        expect(defaultPanelTitle).toBe('My field name');
      });
    });

    describe('data view does not exist', () => {
      let dataControlManager: undefined | Awaited<ReturnType<typeof initializeDataControlManager>>;
      beforeAll((done) => {
        initializeDataControlManager({
          controlId: 'myControlId',
          controlType: 'myControlType',
          state: {
            ...dataControlState,
            data_view_id: 'notGonnaFindMeDataViewId',
          },
          editorStateManager: initializeStateManager({}, {}),
          parentApi: {},
          typeDisplayName: 'My Control Type',
        }).then((controlManager) => {
          dataControlManager = controlManager;
          dataControlManager.api.defaultTitle$!.pipe(first()).subscribe(() => {
            done();
          });
        });
      });

      test('should set blocking error', () => {
        const error = dataControlManager!.api.blockingError$.value;
        expect(error).not.toBeUndefined();
        expect(error!.message).toBe(
          'Simulated error: no data view found for id notGonnaFindMeDataViewId'
        );
      });

      test('should clear blocking error when valid data view id provided', (done) => {
        dataControlManager!.api.dataViews$.pipe(skip(1), first()).subscribe((dataView) => {
          expect(dataView).not.toBeUndefined();
          expect(dataControlManager!.api.blockingError$.value).toBeUndefined();
          done();
        });
        dataControlManager!.api.setDataViewId('myDataViewId');
      });
    });

    describe('field does not exist', () => {
      let dataControlManager: undefined | Awaited<ReturnType<typeof initializeDataControlManager>>;
      beforeAll((done) => {
        initializeDataControlManager({
          controlId: 'myControlId',
          controlType: 'myControlType',
          state: {
            ...dataControlState,
            field_name: 'notGonnaFindMeFieldName',
          },
          editorStateManager: initializeStateManager({}, {}),
          parentApi: {},
          typeDisplayName: 'My Control Type',
        }).then((controlManager) => {
          dataControlManager = controlManager;
          dataControlManager.api.defaultTitle$!.pipe(first()).subscribe(() => {
            done();
          });
        });
      });

      test('should set blocking error', () => {
        const error = dataControlManager!.api.blockingError$.value;
        expect(error).not.toBeUndefined();
        expect(error!.message).toBe('Could not locate field: notGonnaFindMeFieldName');
      });

      test('should clear blocking error when valid field name provided', (done) => {
        dataControlManager!.api.defaultTitle$!.pipe(skip(1), first()).subscribe((defaultTitle) => {
          expect(defaultTitle).toBe('My field name');
          expect(dataControlManager!.api.blockingError$.value).toBeUndefined();
          done();
        });
        dataControlManager!.api.setFieldName('myFieldName');
      });
    });
  });

  describe('ESQL query subscription', () => {
    const esqlState: DataControlState = {
      ...dataControlState,
      values_source: ControlValuesSource.ESQL,
      esql_query: 'FROM logs | WHERE country == ?geo_dest | KEEP myFieldName',
    };

    const variable: ESQLControlVariable = {
      key: 'geo_dest',
      value: 'US',
      type: ESQLVariableType.VALUES,
    };

    beforeEach(() => {
      mockGetESQLSingleColumnValues.mockReset();
    });

    it("forwards the parent's ESQL variables to getESQLSingleColumnValues", async () => {
      mockGetESQLSingleColumnValues.mockResolvedValue({
        values: ['US'],
        column: { name: 'myFieldName', type: 'keyword' },
      });
      const esqlVariables$ = new BehaviorSubject<ESQLControlVariable[]>([variable]);

      await initializeDataControlManager({
        controlId: 'esqlControl',
        controlType: 'esql',
        state: esqlState,
        editorStateManager: initializeStateManager({}, {}),
        parentApi: { esqlVariables$ },
        typeDisplayName: 'ES|QL Control',
      });

      // Allow the subscription's async work to flush.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockGetESQLSingleColumnValues).toHaveBeenCalledWith(
        expect.objectContaining({ esqlVariables: [variable] })
      );
    });

    it('re-derives the column when a new variable key appears in the parent', async () => {
      mockGetESQLSingleColumnValues.mockResolvedValue({
        values: ['US'],
        column: { name: 'myFieldName', type: 'keyword' },
      });
      const esqlVariables$ = new BehaviorSubject<ESQLControlVariable[]>([]);

      await initializeDataControlManager({
        controlId: 'esqlControl',
        controlType: 'esql',
        state: esqlState,
        editorStateManager: initializeStateManager({}, {}),
        parentApi: { esqlVariables$ },
        typeDisplayName: 'ES|QL Control',
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      const initialCalls = mockGetESQLSingleColumnValues.mock.calls.length;

      // Adding a new variable key must trigger a re-derivation since the query
      // referenced an unresolved parameter on the first run.
      esqlVariables$.next([variable]);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockGetESQLSingleColumnValues.mock.calls.length).toBeGreaterThan(initialCalls);
      expect(mockGetESQLSingleColumnValues).toHaveBeenLastCalledWith(
        expect.objectContaining({ esqlVariables: [variable] })
      );
    });

    it('skips re-derivation when only variable values change (same key set)', async () => {
      mockGetESQLSingleColumnValues.mockResolvedValue({
        values: ['US'],
        column: { name: 'myFieldName', type: 'keyword' },
      });
      const esqlVariables$ = new BehaviorSubject<ESQLControlVariable[]>([variable]);

      await initializeDataControlManager({
        controlId: 'esqlControl',
        controlType: 'esql',
        state: esqlState,
        editorStateManager: initializeStateManager({}, {}),
        parentApi: { esqlVariables$ },
        typeDisplayName: 'ES|QL Control',
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      const initialCalls = mockGetESQLSingleColumnValues.mock.calls.length;

      // Same key, different value — should be a no-op for column derivation.
      esqlVariables$.next([{ ...variable, value: 'CA' }]);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockGetESQLSingleColumnValues.mock.calls.length).toBe(initialCalls);
    });
  });
});
