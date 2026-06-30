/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowsSearchParams } from '@kbn/workflows';
import { WORKFLOWS_TABLE_INITIAL_PAGE_SIZE } from '../../features/workflow_list/constants';

const isWorkflowSortField = (
  value: string | undefined | null
): value is NonNullable<WorkflowsSearchParams['sortField']> =>
  value === 'name' || value === 'enabled';

const isWorkflowSortOrder = (
  value: string | undefined | null
): value is NonNullable<WorkflowsSearchParams['sortOrder']> => value === 'asc' || value === 'desc';

const isManagedFilter = (
  value: string | undefined | null
): value is NonNullable<WorkflowsSearchParams['managed']> =>
  value === 'all' || value === 'managed' || value === 'unmanaged';

const getPositiveIntegerParam = (
  params: URLSearchParams,
  name: string,
  defaultValue: number
): number => {
  const value = Number(params.get(name));
  return Number.isInteger(value) && value > 0 ? value : defaultValue;
};

const getStringArrayParam = (params: URLSearchParams, name: string): string[] | undefined => {
  const values = params.getAll(name).filter((value) => value !== '');
  return values.length > 0 ? values : undefined;
};

export const parseBooleanFilterValue = (value: string | number | boolean): boolean | undefined => {
  const normalizedValue = String(value).trim().toLowerCase();

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  return undefined;
};

const getBooleanArrayParam = (
  params: URLSearchParams,
  name: string
): WorkflowsSearchParams['enabled'] => {
  const values = params
    .getAll(name)
    .map(parseBooleanFilterValue)
    .filter((value): value is boolean => value !== undefined);

  return values.length > 0 ? values : undefined;
};

const appendStringArrayParam = (
  params: URLSearchParams,
  name: string,
  values: string[] | undefined
): void => {
  values?.filter((value) => value !== '').forEach((value) => params.append(name, value));
};

export const parseWorkflowsUrlSearchParams = (searchString: string): WorkflowsSearchParams => {
  const params = new URLSearchParams(searchString);
  const query = params.get('query') ?? '';
  const enabled = getBooleanArrayParam(params, 'enabled');
  const createdBy = getStringArrayParam(params, 'createdBy');
  const tags = getStringArrayParam(params, 'tags');
  const sortField = params.get('sortField');
  const sortOrder = params.get('sortOrder');
  const managed = params.get('managed');

  return {
    size: getPositiveIntegerParam(params, 'size', WORKFLOWS_TABLE_INITIAL_PAGE_SIZE),
    page: getPositiveIntegerParam(params, 'page', 1),
    query,
    ...(enabled ? { enabled } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(tags ? { tags } : {}),
    ...(isWorkflowSortField(sortField) ? { sortField } : {}),
    ...(isWorkflowSortField(sortField) && isWorkflowSortOrder(sortOrder) ? { sortOrder } : {}),
    ...(isManagedFilter(managed) ? { managed } : {}),
  };
};

export const serializeWorkflowsUrlSearchParams = (search: WorkflowsSearchParams): string => {
  const params = new URLSearchParams();

  if (search.query) {
    params.set('query', search.query);
  }

  if (search.page && search.page !== 1) {
    params.set('page', String(search.page));
  }

  if (search.size && search.size !== WORKFLOWS_TABLE_INITIAL_PAGE_SIZE) {
    params.set('size', String(search.size));
  }

  search.enabled?.forEach((enabled) => params.append('enabled', String(enabled)));
  appendStringArrayParam(params, 'createdBy', search.createdBy);
  appendStringArrayParam(params, 'tags', search.tags);

  if (isWorkflowSortField(search.sortField)) {
    params.set('sortField', search.sortField);

    if (isWorkflowSortOrder(search.sortOrder)) {
      params.set('sortOrder', search.sortOrder);
    }
  }

  if (isManagedFilter(search.managed) && search.managed !== 'unmanaged') {
    params.set('managed', search.managed);
  }

  return params.toString();
};
