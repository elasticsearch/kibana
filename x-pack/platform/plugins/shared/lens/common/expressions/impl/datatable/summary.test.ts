/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IFieldFormat } from '@kbn/field-formats-plugin/common';
import type { Datatable } from '@kbn/expressions-plugin/common';
import { computeSummaryRowForColumn, getFinalSummaryConfiguration } from './summary';

describe('Summary row helpers', () => {
  const mockNumericTable: Datatable = {
    type: 'datatable',
    columns: [{ id: 'myColumn', name: 'My Column', meta: { type: 'number' } }],
    rows: [{ myColumn: 45 }],
  };

  const mockNumericTableWithArray: Datatable = {
    type: 'datatable',
    columns: [{ id: 'myColumn', name: 'My Column', meta: { type: 'number' } }],
    rows: [{ myColumn: [45, 90] }],
  };

  const mockNonNumericTable: Datatable = {
    type: 'datatable',
    columns: [{ id: 'myColumn', name: 'My Column', meta: { type: 'string' } }],
    rows: [{ myColumn: 'myString' }],
  };

  const defaultFormatter = { convertToText: (x) => x } as IFieldFormat;
  const customNumericFormatter = { convertToText: (x: number) => x.toFixed(2) } as IFieldFormat;

  describe('getFinalSummaryConfiguration', () => {
    it('should return the base configuration for an unconfigured column', () => {
      expect(getFinalSummaryConfiguration('myColumn', {}, mockNumericTable)).toEqual({
        summaryRow: 'none',
        summaryLabel: 'None',
      });
    });

    it('should return the right configuration for a partially configured column', () => {
      expect(
        getFinalSummaryConfiguration('myColumn', { summaryRow: 'sum' }, mockNumericTable)
      ).toEqual({
        summaryRow: 'sum',
        summaryLabel: 'Sum',
      });
    });

    it('should return the base configuration for a transitioned invalid column', () => {
      expect(
        getFinalSummaryConfiguration('myColumn', { summaryRow: 'sum' }, mockNumericTableWithArray)
      ).toEqual({
        summaryRow: 'sum',
        summaryLabel: 'Sum',
      });
    });

    it('should return the base configuration for a non numeric column', () => {
      expect(
        getFinalSummaryConfiguration('myColumn', { summaryRow: 'sum' }, mockNonNumericTable)
      ).toEqual({
        summaryRow: 'none',
        summaryLabel: 'None',
      });
    });
  });

  describe('computeSummaryRowForColumn', () => {
    for (const op of ['avg', 'sum', 'min', 'max'] as const) {
      it(`should return formatted value for a ${op} summary function`, () => {
        expect(
          computeSummaryRowForColumn(
            { summaryRow: op, columnId: 'myColumn' },
            mockNumericTable,
            {
              myColumn: customNumericFormatter,
            },
            defaultFormatter
          )
        ).toBe('45.00');
      });
    }

    it('should ignore the column formatter, rather return the raw value for count operation', () => {
      expect(
        computeSummaryRowForColumn(
          { summaryRow: 'count', columnId: 'myColumn' },
          mockNumericTable,
          {
            myColumn: customNumericFormatter,
          },
          defaultFormatter
        )
      ).toBe(1);
    });

    it('should only count non-null/empty values', () => {
      expect(
        computeSummaryRowForColumn(
          { summaryRow: 'count', columnId: 'myColumn' },
          { ...mockNumericTable, rows: [...mockNumericTable.rows, { myColumn: null }] },
          {
            myColumn: customNumericFormatter,
          },
          defaultFormatter
        )
      ).toBe(1);
    });

    it('should return an empty summary instead of NaN/Infinity for an all-null column', () => {
      const allNullTable = { ...mockNumericTable, rows: [{ myColumn: null }, { myColumn: null }] };
      for (const op of ['avg', 'sum', 'min', 'max'] as const) {
        expect(
          computeSummaryRowForColumn(
            { summaryRow: op, columnId: 'myColumn' },
            allNullTable,
            { myColumn: customNumericFormatter },
            defaultFormatter
          )
        ).toBe('');
      }
    });

    it('should skip NaN values instead of poisoning the summary', () => {
      const tableWithNaN = { ...mockNumericTable, rows: [{ myColumn: 45 }, { myColumn: NaN }] };
      expect(
        computeSummaryRowForColumn(
          { summaryRow: 'sum', columnId: 'myColumn' },
          tableWithNaN,
          { myColumn: customNumericFormatter },
          defaultFormatter
        )
      ).toBe('45.00');
      expect(
        computeSummaryRowForColumn(
          { summaryRow: 'count', columnId: 'myColumn' },
          tableWithNaN,
          { myColumn: customNumericFormatter },
          defaultFormatter
        )
      ).toBe(1);
    });

    it('should count numeric arrays as valid and distinct values', () => {
      expect(
        computeSummaryRowForColumn(
          { summaryRow: 'count', columnId: 'myColumn' },
          mockNumericTableWithArray,
          {
            myColumn: defaultFormatter,
          },
          defaultFormatter
        )
      ).toBe(2);
    });
  });
});
