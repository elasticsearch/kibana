/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { ESQLControlVariable } from '@kbn/esql-types';
import type { Filter, Query, TimeRange } from '../filters';
import type { ProjectRouting } from '../project_routing';

export interface ExecutionContextSearch {
  now?: number;
  filters?: Filter[];
  query?: Query | Query[];
  timeRange?: TimeRange;
  disableWarningToasts?: boolean;
  esqlVariables?: ESQLControlVariable[];
  projectRouting?: ProjectRouting;
  useApproximation?: boolean;
}
