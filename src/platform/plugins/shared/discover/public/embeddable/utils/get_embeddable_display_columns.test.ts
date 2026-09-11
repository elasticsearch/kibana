/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import type { DataTableColumnsMeta } from '@kbn/unified-data-table';
import { getEmbeddableDisplayColumns } from './get_embeddable_display_columns';

const categorizeColumnsMeta: DataTableColumnsMeta = {
  Count: { type: 'number' },
  Sparkline: { type: 'number' },
  Pattern: { type: 'string' },
};

const categorizeQuery =
  'FROM kibana_sample_data_logs | STATS Count = COUNT(*), Sparkline = SPARKLINE(COUNT(*), @timestamp) BY Pattern = CATEGORIZE(message)';

describe('getEmbeddableDisplayColumns', () => {
  it('preserves persisted columns when auto-apply is disabled', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: false,
        persistedColumns: [],
        profileColumns: [
          { name: 'Count', width: 150 },
          { name: 'Sparkline', width: 150 },
          { name: 'Pattern' },
        ],
        dataView: dataViewMock,
        isEsql: true,
        esql: categorizeQuery,
        columnsMeta: categorizeColumnsMeta,
      })
    ).toEqual({ columns: [], grid: undefined });
  });

  it('preserves explicit persisted columns', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: ['message', 'host'],
        profileColumns: [{ name: 'Count' }, { name: 'Pattern' }],
        dataView: dataViewMock,
        isEsql: true,
        esql: categorizeQuery,
        columnsMeta: categorizeColumnsMeta,
      })
    ).toEqual({ columns: ['message', 'host'], grid: undefined });
  });

  it('keeps matching profile widths for persisted columns', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: ['Count', 'Sparkline', 'Pattern'],
        profileColumns: [
          { name: 'Count', width: 150 },
          { name: 'Sparkline', width: 150 },
          { name: 'Pattern' },
        ],
        dataView: dataViewMock,
        isEsql: true,
        esql: categorizeQuery,
        columnsMeta: categorizeColumnsMeta,
      })
    ).toEqual({
      columns: ['Count', 'Sparkline', 'Pattern'],
      grid: {
        columns: {
          Count: { width: 150 },
          Sparkline: { width: 150 },
        },
      },
    });
  });

  it('treats an explicit Summary column as authoritative', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: ['_source'],
        profileColumns: [{ name: 'Count' }, { name: 'Pattern' }],
        dataView: dataViewMock,
        isEsql: true,
        esql: categorizeQuery,
        columnsMeta: categorizeColumnsMeta,
      })
    ).toEqual({ columns: ['_source'], grid: undefined });
  });

  it('uses profile columns for empty CATEGORIZE sessions', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: [],
        profileColumns: [
          { name: 'Count', width: 150 },
          { name: 'Sparkline', width: 150 },
          { name: 'Pattern' },
        ],
        dataView: dataViewMock,
        isEsql: true,
        esql: categorizeQuery,
        columnsMeta: categorizeColumnsMeta,
      })
    ).toEqual({
      columns: ['Count', 'Sparkline', 'Pattern'],
      grid: {
        columns: {
          Count: { width: 150 },
          Sparkline: { width: 150 },
        },
      },
    });
  });

  it('uses guarded transformational ES|QL columns when the profile has no matching defaults', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: [],
        profileColumns: [{ name: 'message' }],
        dataView: dataViewMock,
        isEsql: true,
        esql: 'FROM logs | STATS count = COUNT(*) BY status',
        columnsMeta: {
          count: { type: 'number' },
          status: { type: 'string' },
        },
      })
    ).toEqual({
      columns: ['count', 'status'],
      grid: undefined,
    });
  });

  it('does not expose every field of a wide non-transformational ES|QL response', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: [],
        dataView: dataViewMock,
        isEsql: true,
        esql: 'FROM logs | WHERE response == "404"',
        columnsMeta: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string' },
          d: { type: 'string' },
          e: { type: 'string' },
          f: { type: 'string' },
        },
      })
    ).toEqual({ columns: [], grid: undefined });
  });

  it('uses Summary for document queries when no profile matches', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: [],
        profileColumns: [{ name: 'message' }],
        dataView: dataViewMock,
        isEsql: true,
        esql: 'FROM logs | WHERE response == "404"',
        columnsMeta: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string' },
          d: { type: 'string' },
          default_column: { type: 'string' },
        },
      })
    ).toEqual({ columns: [], grid: undefined });
  });

  it('does not use a narrow document-query result set as default columns', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: [],
        dataView: dataViewMock,
        isEsql: true,
        esql: 'FROM logs | KEEP host, message, status',
        columnsMeta: {
          host: { type: 'string' },
          message: { type: 'string' },
          status: { type: 'string' },
        },
      })
    ).toEqual({ columns: [], grid: undefined });
  });

  it('keeps empty columns until ES|QL columnsMeta is available', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: [],
        profileColumns: [{ name: 'Count' }],
        dataView: dataViewMock,
        isEsql: true,
        esql: categorizeQuery,
        columnsMeta: undefined,
      })
    ).toEqual({ columns: [], grid: undefined });
  });

  it('uses profile columns for empty non-ES|QL sessions', () => {
    expect(
      getEmbeddableDisplayColumns({
        autoApplyDiscoverColumnDefaults: true,
        persistedColumns: [],
        profileColumns: [{ name: 'message', width: 100 }, { name: 'extension' }],
        dataView: dataViewMock,
        isEsql: false,
        columnsMeta: undefined,
      })
    ).toEqual({
      columns: ['message', 'extension'],
      grid: {
        columns: {
          message: { width: 100 },
        },
      },
    });
  });
});
