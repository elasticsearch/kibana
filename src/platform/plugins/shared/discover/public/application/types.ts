/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { SearchResponseWarning } from '@kbn/search-response-warnings';
import type { EsqlSource } from '@kbn/data-source';

export enum FetchStatus {
  UNINITIALIZED = 'uninitialized',
  LOADING = 'loading',
  LOADING_MORE = 'loading_more',
  PARTIAL = 'partial',
  COMPLETE = 'complete',
  ERROR = 'error',
}

export interface RecordsFetchResponse {
  records: DataTableRecord[];
  dataSource?: EsqlSource;
  esqlHeaderWarning?: string;
  interceptedWarnings?: SearchResponseWarning[];
  approximationApplied?: boolean;
}

export interface SidebarToggleState {
  isCollapsed: boolean;
  toggle: undefined | ((isCollapsed: boolean) => void);
}
