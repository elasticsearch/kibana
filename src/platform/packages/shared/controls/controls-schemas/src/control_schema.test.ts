/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ControlValuesSource } from '@kbn/controls-constants';

import { dataControlSchema } from './control_schema';
import { optionsListDSLControlSchema } from './options_list_schema';
import { rangeSliderControlSchema } from './range_slider_schema';

describe('data control schema legacy compatibility', () => {
  it('defaults missing values_source to field for dataControlSchema', () => {
    expect(
      dataControlSchema.validate({
        data_view_id: 'my-data-view',
        field_name: 'host.name',
      })
    ).toEqual({
      data_view_id: 'my-data-view',
      field_name: 'host.name',
      ignore_validations: false,
      use_global_filters: true,
      values_source: ControlValuesSource.FIELD,
    });
  });

  it('defaults missing values_source to field for optionsListDSLControlSchema', () => {
    expect(
      optionsListDSLControlSchema.validate({
        data_view_id: 'my-data-view',
        field_name: 'host.name',
      })
    ).toMatchObject({
      data_view_id: 'my-data-view',
      field_name: 'host.name',
      values_source: ControlValuesSource.FIELD,
    });
  });

  it('defaults missing values_source to field for rangeSliderControlSchema', () => {
    expect(
      rangeSliderControlSchema.validate({
        data_view_id: 'my-data-view',
        field_name: 'host.name',
      })
    ).toMatchObject({
      data_view_id: 'my-data-view',
      field_name: 'host.name',
      values_source: ControlValuesSource.FIELD,
    });
  });

  it('still validates esql values_source explicitly', () => {
    expect(
      dataControlSchema.validate({
        values_source: ControlValuesSource.ESQL,
        esql_query: 'FROM logs',
      })
    ).toEqual({
      esql_query: 'FROM logs',
      ignore_validations: false,
      use_global_filters: true,
      values_source: ControlValuesSource.ESQL,
    });
  });
});
