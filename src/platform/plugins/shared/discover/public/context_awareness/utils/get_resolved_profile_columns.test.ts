/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fieldList } from '@kbn/data-views-plugin/common';
import { buildDataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { dataViewWithTimefieldMock } from '../../__mocks__/data_view_with_timefield';
import { getResolvedProfileColumns } from './get_resolved_profile_columns';

const emptyDataView = buildDataViewMock({
  name: 'emptyDataView',
  fields: fieldList(),
});

describe('getResolvedProfileColumns', () => {
  it('retains profile column order and valid widths', () => {
    expect(
      getResolvedProfileColumns({
        profileColumns: [
          { name: 'message', width: 100 },
          { name: 'extension', width: 200 },
        ],
        fallbackColumns: ['bytes'],
        dataView: dataViewWithTimefieldMock,
      })
    ).toEqual({
      columns: ['message', 'extension', 'bytes'],
      grid: {
        columns: {
          message: { width: 100 },
          extension: { width: 200 },
        },
      },
    });
  });

  it('drops unavailable fields and keeps _source', () => {
    expect(
      getResolvedProfileColumns({
        profileColumns: [{ name: 'message', width: 100 }, { name: '_source' }],
        fallbackColumns: ['missing'],
        dataView: dataViewWithTimefieldMock,
      })
    ).toEqual({
      columns: ['message', '_source'],
      grid: {
        columns: {
          message: { width: 100 },
        },
      },
    });
  });

  it('validates against ES|QL result names', () => {
    expect(
      getResolvedProfileColumns({
        profileColumns: [
          { name: 'foo', width: 300 },
          { name: 'bar', width: 400 },
        ],
        fallbackColumns: ['messsage', 'bytes'],
        dataView: emptyDataView,
        esqlQueryColumns: [{ name: 'foo' }, { name: 'bar' }],
      })
    ).toEqual({
      columns: ['foo', 'bar'],
      grid: {
        columns: {
          foo: { width: 300 },
        },
      },
    });
  });

  it('returns empty columns when nothing is valid', () => {
    expect(
      getResolvedProfileColumns({
        profileColumns: [{ name: 'missing' }],
        dataView: emptyDataView,
      })
    ).toEqual({
      columns: [],
      grid: undefined,
    });
  });
});
