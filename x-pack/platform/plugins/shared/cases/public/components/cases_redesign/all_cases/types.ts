/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type * as rt from 'io-ts';
import type { FilterOptions, QueryParams, SortOrder } from '../../../../common/ui';
import type { AllCasesURLQueryParamsRt } from '../../all_cases/schema';

export const CASES_TABLE_PER_PAGE_VALUES = [10, 25, 50, 100];

export interface EuiBasicTableSortTypes {
  field: string;
  direction: SortOrder;
}

export interface EuiBasicTableOnChange {
  page?: {
    index: number;
    size: number;
  };
  sort?: EuiBasicTableSortTypes;
}
export interface Solution {
  id: string;
  label: string;
  iconType: string;
}

export interface CasesColumnSelection {
  field: string;
  name: string;
  isChecked: boolean;
}

type SupportedFilterOptionsInURL = Pick<
  FilterOptions,
  'search' | 'severity' | 'status' | 'tags' | 'assignees' | 'category'
>;

export interface AllCasesTableState {
  filterOptions: FilterOptions;
  queryParams: QueryParams;
}

export interface AllCasesURLState {
  filterOptions: Partial<SupportedFilterOptionsInURL> &
    Partial<Pick<FilterOptions, 'customFields'>>;
  queryParams: Partial<QueryParams>;
}

export type AllCasesURLQueryParams = rt.TypeOf<typeof AllCasesURLQueryParamsRt>;
