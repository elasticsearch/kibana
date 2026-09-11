/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createDatatableUtilitiesMock } from '@kbn/data-plugin/common/mocks';
import type { Datatable } from '@kbn/expressions-plugin/public';
import type { LensDocument } from '@kbn/lens-common';
import {
  getActiveDatasourceIdFromDoc,
  getUniqueLabelGenerator,
  inferTimeField,
  renewIDs,
} from './utils';

const datatableUtilities = createDatatableUtilitiesMock();

const table: Datatable = {
  type: 'datatable',
  rows: [],
  columns: [
    {
      id: '1',
      name: '',
      meta: {
        type: 'date',
        field: 'abc',
        source: 'esaggs',
        sourceParams: {
          type: 'date_histogram',
          params: {},
          appliedTimeRange: {
            from: '2021-01-01',
            to: '2022-01-01',
          },
        },
      },
    },
  ],
};

const tableWithoutAppliedTimeRange = {
  ...table,
  columns: [
    {
      ...table.columns[0],
      meta: {
        ...table.columns[0].meta,
        sourceParams: {
          ...table.columns[0].meta.sourceParams,
          appliedTimeRange: undefined,
        },
      },
    },
  ],
};

describe('utils', () => {
  describe('getActiveDatasourceIdFromDoc', () => {
    const docWithDatasourceStates = (datasourceStates: Record<string, unknown>): LensDocument =>
      ({
        state: { datasourceStates },
      } as unknown as LensDocument);

    it('prefers textBased over formBased when both hold data', () => {
      expect(
        getActiveDatasourceIdFromDoc(
          docWithDatasourceStates({
            formBased: { layers: { a: {} } },
            textBased: { layers: { b: {} } },
          })
        )
      ).toBe('textBased');
    });

    it('ignores empty datasource states when another one holds data', () => {
      expect(
        getActiveDatasourceIdFromDoc(
          docWithDatasourceStates({
            textBased: { layers: {} },
            formBased: { layers: { a: {} } },
          })
        )
      ).toBe('formBased');
    });

    it('falls back to known datasource keys when all states are empty', () => {
      expect(
        getActiveDatasourceIdFromDoc(
          docWithDatasourceStates({
            textBased: { layers: {} },
            formBased: { layers: {} },
          })
        )
      ).toBe('formBased');
    });

    it('returns null when the only non-empty state belongs to an unknown datasource', () => {
      // corrupted doc or forward-incompatible export: the panel config lives under
      // an unknown id, so it must surface as "no datasource" instead of resolving
      // to an empty known datasource
      expect(
        getActiveDatasourceIdFromDoc(
          docWithDatasourceStates({
            UNKNOWN: { layers: { a: {} } },
            textBased: { layers: {} },
          })
        )
      ).toBeNull();
    });

    it('returns null when no known datasource key exists', () => {
      expect(getActiveDatasourceIdFromDoc(docWithDatasourceStates({ UNKNOWN: {} }))).toBeNull();
    });
  });

  describe('inferTimeField', () => {
    test('infer time field for brush event', () => {
      expect(
        inferTimeField(datatableUtilities, {
          name: 'brush',
          data: {
            table,
            column: 0,
            range: [1, 2],
          },
        })
      ).toEqual('abc');
    });

    test('do not return time field if time range is not bound', () => {
      expect(
        inferTimeField(datatableUtilities, {
          name: 'brush',
          data: {
            table: tableWithoutAppliedTimeRange,
            column: 0,
            range: [1, 2],
          },
        })
      ).toEqual(undefined);
    });

    test('infer time field for click event', () => {
      expect(
        inferTimeField(datatableUtilities, {
          name: 'filter',
          data: {
            data: [
              {
                table,
                column: 0,
                row: 0,
                value: 1,
              },
            ],
          },
        })
      ).toEqual('abc');
    });

    test('do not return time field for negated click event', () => {
      expect(
        inferTimeField(datatableUtilities, {
          name: 'filter',
          data: {
            data: [
              {
                table,
                column: 0,
                row: 0,
                value: 1,
              },
            ],
            negate: true,
          },
        })
      ).toEqual(undefined);
    });

    test('do not return time field for click event without bound time field', () => {
      expect(
        inferTimeField(datatableUtilities, {
          name: 'filter',
          data: {
            data: [
              {
                table: tableWithoutAppliedTimeRange,
                column: 0,
                row: 0,
                value: 1,
              },
            ],
          },
        })
      ).toEqual(undefined);
    });
  });

  describe('renewIDs', () => {
    test('should renew ids for multiple cases', () => {
      expect(
        renewIDs(
          {
            r1: {
              a: [
                'r2',
                'b',
                {
                  b: 'r3',
                  r3: 'test',
                },
              ],
            },
            r2: 'r3',
          },
          ['r1', 'r2', 'r3'],
          (i) => i + '_test'
        )
      ).toMatchInlineSnapshot(`
        Object {
          "r1_test": Object {
            "a": Array [
              "r2_test",
              "b",
              Object {
                "b": "r3_test",
                "r3_test": "test",
              },
            ],
          },
          "r2_test": "r3_test",
        }
      `);
    });
  });
  describe('getUniqueLabelGenerator', () => {
    it('should handle empty labels', () => {
      expect(getUniqueLabelGenerator()(' ')).toBe('[Untitled]');
    });

    it('should add a counter for multiple hits of the same label', () => {
      const labelGenerator = getUniqueLabelGenerator();
      expect(['myLabel', 'myLabel'].map(labelGenerator)).toEqual(['myLabel', 'myLabel [1]']);
    });

    it('should add a counter for multiple empty labels', () => {
      const labelGenerator = getUniqueLabelGenerator();
      expect([' ', ' '].map(labelGenerator)).toEqual(['[Untitled]', '[Untitled] [1]']);
    });
  });
});
