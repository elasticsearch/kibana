/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataViewLazy } from '@kbn/data-views-plugin/common';

/**
 * Minimal {@link DataViewLazy} surface used by {@link queryToFields}.
 */
export type DataViewLazyQueryToFields = Pick<DataViewLazy, 'getFields' | 'getSourceFiltering'> & {
  timeFieldName?: string;
};
import {
  fromKueryExpression,
  getFilterField,
  getKqlFieldNames,
  isCombinedFilter,
  isFilter,
  isOfQueryType,
  type Filter,
} from '@kbn/es-query';
import type { SearchRequest } from './fetch';
import type { EsQuerySortValue } from '../..';

const collectFilterFields = (filter: Filter, acc: string[] = []): string[] => {
  if (!isFilter(filter) || filter.meta?.disabled === true) return acc;

  if (isCombinedFilter(filter)) {
    for (const nested of filter.meta.params ?? []) {
      collectFilterFields(nested, acc);
    }

    return acc;
  }

  const field = filter.meta?.key ?? getFilterField(filter);
  if (field) acc.push(field);

  return acc;
};

export async function queryToFields({
  dataView,
  sort,
  request,
}: {
  dataView: DataViewLazyQueryToFields;
  sort?: EsQuerySortValue | EsQuerySortValue[];
  request: SearchRequest;
}) {
  let fields = dataView.timeFieldName ? [dataView.timeFieldName] : [];
  if (sort) {
    const sortArr = Array.isArray(sort) ? sort : [sort];
    fields.push(...sortArr.flatMap((s) => Object.keys(s)));
  }
  for (const query of (request.query ?? []).filter(isOfQueryType)) {
    if (query.query && query.language === 'kuery') {
      const nodes = fromKueryExpression(query.query);
      const queryFields = getKqlFieldNames(nodes);
      fields = fields.concat(queryFields);
    }
  }

  const { filters = [] } = request;
  const requestFilters = typeof filters === 'function' ? filters() : filters;
  fields = fields.concat(requestFilters.flatMap((filter) => collectFilterFields(filter)));

  // if source filtering is enabled, we need to fetch all the fields
  const fieldName =
    dataView.getSourceFiltering() && dataView.getSourceFiltering().excludes.length ? ['*'] : fields;

  if (fieldName.length) {
    return (await dataView.getFields({ fieldName })).getFieldMapSorted();
  }

  // no fields needed to be loaded for query
  return {};
}
