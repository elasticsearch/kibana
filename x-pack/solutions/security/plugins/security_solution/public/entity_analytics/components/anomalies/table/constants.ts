/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import type { TableRow } from './types';

export const truncatedAnchorCss = css`
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const PAGE_SIZE_OPTIONS = [10, 25, 50];

export type TableSortField = 'timestamp' | 'record_score' | 'job_id';
export type TableSortDirection = 'asc' | 'desc';

export const SORT_FIELD_TO_TABLE: Record<TableSortField, keyof TableRow> = {
  timestamp: 'timestamp',
  record_score: 'anomalyScore',
  job_id: 'jobDisplayName',
};

export const SORT_FIELD_TO_API: Partial<Record<keyof TableRow, TableSortField>> = {
  timestamp: 'timestamp',
  anomalyScore: 'record_score',
  jobDisplayName: 'job_id',
};

export const DEFAULT_TABLE_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
export const DEFAULT_SORT_FIELD: TableSortField = 'timestamp';
export const DEFAULT_SORT_DIRECTION: TableSortDirection = 'desc';
