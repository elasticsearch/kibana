/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { ISearchGeneric } from '@kbn/search-types';
import type {
  GetESQLSingleColumnValuesSuccess,
  GetESQLSingleColumnValuesFailure,
} from './get_esql_single_column_values';
import { getESQLSingleColumnValues } from './get_esql_single_column_values';

const mockGetESQLResults = jest.fn();
jest.mock('@kbn/esql-utils', () => ({
  ...jest.requireActual('@kbn/esql-utils'),
  getESQLResults: (...args: unknown[]) => mockGetESQLResults(...args),
}));

const searchMock = {} as ISearchGeneric;

describe('getESQLSingleColumnValues', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });
  it('returns string values for non-numeric columns', async () => {
    mockGetESQLResults.mockResolvedValueOnce({
      response: {
        columns: [{ name: 'column1', type: 'keyword' }],
        values: [['option1'], ['option2']],
      },
    });
    const result = (await getESQLSingleColumnValues({
      query: 'FROM index | STATS BY column',
      search: searchMock,
      esqlVariables: [],
    })) as GetESQLSingleColumnValuesSuccess;
    expect(getESQLSingleColumnValues.isSuccess(result)).toBe(true);
    expect(getESQLSingleColumnValues.isNumericResult(result)).toBe(false);
    expect(result.values).toEqual(['option1', 'option2']);
  });

  it('coerces values to numbers when the column type is numeric', async () => {
    mockGetESQLResults.mockResolvedValueOnce({
      response: {
        columns: [{ name: 'column1', type: 'long' }],
        values: [['10'], ['20'], ['30']],
      },
    });
    const result = (await getESQLSingleColumnValues({
      query: 'FROM index | KEEP bytes',
      search: searchMock,
      esqlVariables: [],
    })) as GetESQLSingleColumnValuesSuccess;
    expect(getESQLSingleColumnValues.isNumericResult(result)).toBe(true);
    expect(result.values).toEqual([10, 20, 30]);
  });

  it('reports the no-results case so callers can distinguish "empty" from "failure"', async () => {
    mockGetESQLResults.mockResolvedValueOnce({
      response: {
        columns: [],
        all_columns: [{ name: 'column1', type: 'keyword' }],
        values: [],
      },
    });
    const result = await getESQLSingleColumnValues({
      query: 'FROM index | WHERE never',
      search: searchMock,
      esqlVariables: [],
    });
    expect(getESQLSingleColumnValues.isSuccess(result)).toBe(true);
    expect(getESQLSingleColumnValues.hasNoResults(result)).toBe(true);
  });

  it('returns an error when query returns multiple columns', async () => {
    mockGetESQLResults.mockResolvedValueOnce({
      response: {
        columns: [{ name: 'column1' }, { name: 'column2' }],
        values: [['option1'], ['option2']],
      },
    });
    const result = (await getESQLSingleColumnValues({
      query: 'FROM index',
      search: searchMock,
      esqlVariables: [],
    })) as GetESQLSingleColumnValuesFailure;
    expect(getESQLSingleColumnValues.isSuccess(result)).toBe(false);
    expect(getESQLSingleColumnValues.isMultiColumnError(result)).toBe(true);
    expect(result.errors[0].message).toBe('Query must return a single column');
  });
  it('returns an error on a failed query', async () => {
    mockGetESQLResults.mockRejectedValueOnce('Invalid ES|QL query');
    const result = (await getESQLSingleColumnValues({
      query: 'FROM index | EVAL',
      search: searchMock,
      esqlVariables: [],
    })) as GetESQLSingleColumnValuesFailure;
    expect(getESQLSingleColumnValues.isSuccess(result)).toBe(false);
    expect('values' in result).toBe(false);
    expect(result).toMatchInlineSnapshot(`
      Object {
        "errors": Array [
          "Invalid ES|QL query",
        ],
      }
    `);
  });

  it('passes timeRange successfully', async () => {
    const timeRange = { from: 'now-10m', to: 'now' };
    await getESQLSingleColumnValues({
      query: 'FROM index | STATS BY column',
      search: searchMock,
      timeRange,
      esqlVariables: [],
    });
    expect(mockGetESQLResults).toHaveBeenCalledWith(
      expect.objectContaining({
        timeRange,
      })
    );
  });
});
