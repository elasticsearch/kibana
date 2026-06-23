/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ControlValuesSource, DEFAULT_DATA_CONTROL_STATE } from './control_constants';

export const MAX_OPTIONS_LIST_REQUEST_SIZE = 1000;

export const DEFAULT_DSL_OPTIONS_LIST_STATE = {
  ...DEFAULT_DATA_CONTROL_STATE,
  values_source: ControlValuesSource.FIELD,
  sort: {
    by: '_count',
    direction: 'desc',
  },
  search_technique: 'wildcard',
  single_select: false,
  exclude: false,
  exists_selected: false,
  run_past_timeout: false,
  selected_options: [] as Array<string | number>,
} as const;

export const DEFAULT_ESQL_OPTIONS_LIST_STATE = {
  single_select: true,
  selected_options: [] as Array<string>,
} as const;
