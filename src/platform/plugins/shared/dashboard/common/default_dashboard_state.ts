/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { DEFAULT_DASHBOARD_OPTIONS } from './constants';
import type { DashboardReadResponseBody } from '../server';

export const DEFAULT_DASHBOARD_STATE: DashboardState = {
  query: { expression: '', language: 'kql' },
  description: '',
  filters: [],
  panels: [],
  pinned_panels: [],
  options: {
    ...DEFAULT_DASHBOARD_OPTIONS,
  },
  title: '',
  tags: [],
};

export function getLastSavedState(readResult?: DashboardReadResponseBody) {
  return {
    ...DEFAULT_DASHBOARD_STATE,
    ...readResult?.data,
  };
}
