/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AS_CODE_DATA_VIEW_SPEC_TYPE } from './constants';
import { dataViewSpecSchema } from './schema_embedded_data_view';
import { RUNTIME_FIELD_COMPOSITE_TYPE } from '../runtime_fields/common';

describe('dataViewSpecSchema field_settings', () => {
  it('accepts indexed field overrides', () => {
    expect(
      dataViewSpecSchema.parse({
        type: AS_CODE_DATA_VIEW_SPEC_TYPE,
        index_pattern: 'logs-*',
        field_settings: {
          bytes_field: { format: { type: 'bytes', params: { pattern: '0,0.[000]b' } } },
          host_name: { custom_label: 'Host', custom_description: 'Hostname field' },
        },
      })
    ).toEqual({
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'logs-*',
      field_settings: {
        bytes_field: { format: { type: 'bytes', params: { pattern: '0,0.[000]b' } } },
        host_name: { custom_label: 'Host', custom_description: 'Hostname field' },
      },
    });
  });

  it('accepts primitive and composite runtime definitions under field_settings', () => {
    const input = {
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'kibana_sample_data_logs',
      time_field: '@timestamp',
      field_settings: {
        agent: {
          custom_label: 'useragent',
          custom_description: 'user agent',
          format: { type: 'string', params: {} },
        },
        foo: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          script: "emit('bar', 1); emit('baz', 'hello');",
          fields: {
            bar: {
              type: 'double' as const,
              custom_label: 'foobar',
              custom_description: 'a foobar field',
              format: { type: 'number', params: {} },
            },
            baz: {
              type: 'keyword' as const,
            },
          },
        },
      },
    };

    expect(dataViewSpecSchema.parse(input)).toEqual(input);
  });
});

describe('dataViewSpecSchema name', () => {
  it('accepts an inline (adhoc) data view spec with a name', () => {
    const input = {
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'logs-*',
      time_field: '@timestamp',
      name: 'My logs',
    };
    expect(dataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('accepts an inline data view spec without a name', () => {
    const input = {
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'logs-*',
    };
    expect(dataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('rejects an empty name', () => {
    expect(() =>
      dataViewSpecSchema.parse({
        type: AS_CODE_DATA_VIEW_SPEC_TYPE,
        index_pattern: 'logs-*',
        name: '',
      })
    ).toThrow();
  });
});

describe('dataViewSpecSchema field_filters', () => {
  it('accepts field_filters as an array of strings', () => {
    const input = {
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'logs-*',
      field_filters: ['field_a', 'field_b'],
    };

    expect(dataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('accepts an empty field_filters array', () => {
    const input = {
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'logs-*',
      field_filters: [],
    };

    expect(dataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('accepts spec without field_filters', () => {
    const input = {
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'logs-*',
    };

    expect(dataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('rejects field_filters with non-string values', () => {
    const input = {
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'logs-*',
      field_filters: [123],
    };

    expect(() => dataViewSpecSchema.parse(input)).toThrow();
  });
});
