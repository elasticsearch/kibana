/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const VEGA_API_PATH = 'api/vega';

export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
  'elastic-api-version': '2023-10-31',
  'Content-Type': 'application/json',
} as const;

export const VEGA_SPEC_HJSON = { format: 'hjson', value: '{}' } as const;
export const VEGA_SPEC_JSON = {
  format: 'json',
  value: { $schema: 'https://vega.github.io/schema/vega/v5.json' },
} as const;
