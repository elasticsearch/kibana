/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expectPrettyError } from '@kbn/zod-helpers/v4';
import { RUNTIME_FIELD_COMPOSITE_TYPE } from '../runtime_fields/common';
import { savedDataViewSpecSchema } from './schema_saved_data_view';

describe('savedDataViewSpecSchema', () => {
  it('accepts a minimal spec', () => {
    const input = {
      index_pattern: 'logs-*',
    };

    expect(savedDataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('accepts indexed field overrides with popularity', () => {
    const input = {
      index_pattern: 'logs-*',
      time_field: '@timestamp',
      field_settings: {
        bytes_field: {
          popularity: 10,
          format: { type: 'bytes', params: { pattern: '0,0.[000]b' } },
        },
        host_name: {
          popularity: 0,
          custom_label: 'Host',
          custom_description: 'Hostname field',
        },
      },
    };

    expect(savedDataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('accepts primitive and composite runtime definitions with popularity', () => {
    const input = {
      index_pattern: 'kibana_sample_data_logs',
      time_field: '@timestamp',
      field_settings: {
        foo: {
          type: 'keyword' as const,
          script: 'some script',
          popularity: 10,
        },
        bar: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          script: "emit('a', 'hello');",
          fields: {
            a: {
              type: 'keyword' as const,
              popularity: 10,
            },
          },
        },
      },
    };

    expect(savedDataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('rejects popularity below 0 for indexed field overrides', () => {
    const input = {
      index_pattern: 'logs-*',
      field_settings: {
        bytes_field: {
          popularity: -1,
        },
      },
    };

    expectPrettyError(savedDataViewSpecSchema.safeParse(input)).toMatchInlineSnapshot(`
      "✖ Too small: expected number to be >=0
        → at field_settings.bytes_field.popularity"
    `);
  });

  it('accepts field_filters as an array of strings', () => {
    const input = {
      index_pattern: 'logs-*',
      field_filters: ['field_a', 'field_b'],
    };

    expect(savedDataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('accepts an empty field_filters array', () => {
    const input = {
      index_pattern: 'logs-*',
      field_filters: [],
    };

    expect(savedDataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('accepts spec without field_filters', () => {
    const input = {
      index_pattern: 'logs-*',
    };

    expect(savedDataViewSpecSchema.parse(input)).toEqual(input);
  });

  it('rejects field_filters with non-string values', () => {
    const input = {
      index_pattern: 'logs-*',
      field_filters: [123],
    };

    expect(() => savedDataViewSpecSchema.parse(input)).toThrow();
  });

  it('rejects an empty field_settings key', () => {
    const input = {
      index_pattern: 'logs-*',
      field_settings: {
        '': { popularity: 0 },
      },
    };

    expectPrettyError(savedDataViewSpecSchema.safeParse(input)).toMatchInlineSnapshot(`
      "✖ Invalid key in record
        → at field_settings."
    `);
  });
});
