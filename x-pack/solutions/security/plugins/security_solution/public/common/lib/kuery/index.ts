/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataViewBase, EsQueryConfig, Filter, Query } from '@kbn/es-query';
import {
  buildEsQuery,
  FilterStateStore,
  fromKueryExpression,
  toElasticsearchQuery,
} from '@kbn/es-query';
import { get, isEmpty } from 'lodash/fp';
import memoizeOne from 'memoize-one';
import type { DataView } from '@kbn/data-plugin/common';
import { prepareKQLParam } from '../../../../common/utils/kql';
import type { BrowserFields } from '../../../../common/search_strategy';
import type { DataProvider, DataProvidersAnd } from '../../../../common/types';
import { DataProviderTypeEnum } from '../../../../common/api/timeline';
import { EXISTS_OPERATOR } from '../../../../common/types/timeline';

export type PrimitiveOrArrayOfPrimitives =
  | string
  | number
  | boolean
  | Array<string | number | boolean>;

export interface CombineQueries {
  config: EsQueryConfig;
  dataProviders: DataProvider[];
  dataView: DataView;
  browserFields: BrowserFields;
  filters: Filter[];
  kqlQuery: Query;
  kqlMode: string;
}

export const convertKueryToElasticSearchQuery = (
  kueryExpression: string,
  indexPattern?: DataViewBase
) => {
  try {
    return kueryExpression
      ? JSON.stringify(toElasticsearchQuery(fromKueryExpression(kueryExpression), indexPattern))
      : '';
  } catch (err) {
    return '';
  }
};

export const isNumber = (value: PrimitiveOrArrayOfPrimitives): value is number =>
  !isNaN(Number(value));

export const convertDateFieldToQuery = (field: string, value: PrimitiveOrArrayOfPrimitives) =>
  `${field}: ${isNumber(value) ? value : new Date(value.toString()).valueOf()}`;

export const getBaseFields = memoizeOne((browserFields: BrowserFields): string[] => {
  const baseFields = get('base', browserFields);
  if (baseFields != null && baseFields.fields != null) {
    return Object.keys(baseFields.fields);
  }
  return [];
});

export const getBrowserFieldPath = (field: string, browserFields: BrowserFields) => {
  const splitFields = field.split('.');
  const baseFields = getBaseFields(browserFields);
  if (baseFields.includes(field)) {
    return ['base', 'fields', field];
  }
  return [splitFields[0], 'fields', field];
};

export const getFieldEsTypes = (field: string, browserFields: BrowserFields): string[] => {
  const pathBrowserField = getBrowserFieldPath(field, browserFields);
  const browserField = get(pathBrowserField, browserFields);
  if (browserField != null) {
    return browserField.esTypes;
  }
  return [];
};

export const checkIfFieldTypeIsDate = (field: string, browserFields: BrowserFields) => {
  const pathBrowserField = getBrowserFieldPath(field, browserFields);
  const browserField = get(pathBrowserField, browserFields);
  if (browserField != null && browserField.type === 'date') {
    return true;
  }
  return false;
};

const formatNestedFieldValue = (
  value: PrimitiveOrArrayOfPrimitives,
  browserField: { type?: string }
): string => {
  if (browserField.type === 'date') {
    return `"${value}"`;
  }
  if (Array.isArray(value)) {
    return `(${value.map((item) => prepareKQLParam(item)).join(' OR ')})`;
  }
  return prepareKQLParam(value);
};

export const convertNestedFieldToQuery = (
  field: string,
  value: PrimitiveOrArrayOfPrimitives,
  browserFields: BrowserFields
) => {
  const pathBrowserField = getBrowserFieldPath(field, browserFields);
  const browserField = get(pathBrowserField, browserFields);
  const nestedPath = browserField.subType.nested.path;
  const key = field.replace(`${nestedPath}.`, '');
  return `${nestedPath}: { ${key}: ${formatNestedFieldValue(value, browserField)} }`;
};

export const convertNestedFieldToExistQuery = (field: string, browserFields: BrowserFields) => {
  const pathBrowserField = getBrowserFieldPath(field, browserFields);
  const browserField = get(pathBrowserField, browserFields);
  const nestedPath = browserField.subType.nested.path;
  const key = field.replace(`${nestedPath}.`, '');
  return `${nestedPath}: { ${key}: * }`;
};

export const checkIfFieldTypeIsNested = (field: string, browserFields: BrowserFields) => {
  const pathBrowserField = getBrowserFieldPath(field, browserFields);
  const browserField = get(pathBrowserField, browserFields);
  if (browserField != null && browserField.subType && browserField.subType.nested) {
    return true;
  }
  return false;
};

const buildQueryMatch = (
  dataProvider: DataProvider | DataProvidersAnd,
  browserFields: BrowserFields
) =>
  `${dataProvider.excluded ? 'NOT ' : ''}${
    dataProvider.queryMatch.operator !== EXISTS_OPERATOR &&
    dataProvider.type !== DataProviderTypeEnum.template
      ? checkIfFieldTypeIsNested(dataProvider.queryMatch.field, browserFields)
        ? convertNestedFieldToQuery(
            dataProvider.queryMatch.field,
            dataProvider.queryMatch.value,
            browserFields
          )
        : checkIfFieldTypeIsDate(dataProvider.queryMatch.field, browserFields)
        ? convertDateFieldToQuery(dataProvider.queryMatch.field, dataProvider.queryMatch.value)
        : `${dataProvider.queryMatch.field} : ${
            Array.isArray(dataProvider.queryMatch.value)
              ? `(${dataProvider.queryMatch.value
                  .map((item) => prepareKQLParam(item))
                  .join(' OR ')})`
              : prepareKQLParam(dataProvider.queryMatch.value)
          }`
      : checkIfFieldTypeIsNested(dataProvider.queryMatch.field, browserFields)
      ? convertNestedFieldToExistQuery(dataProvider.queryMatch.field, browserFields)
      : `${dataProvider.queryMatch.field} ${EXISTS_OPERATOR}`
  }`.trim();

export const buildGlobalQuery = (dataProviders: DataProvider[], browserFields: BrowserFields) =>
  dataProviders
    .reduce((queries: string[], dataProvider: DataProvider) => {
      const flatDataProviders = [dataProvider, ...dataProvider.and];
      const activeDataProviders = flatDataProviders.filter(
        (flatDataProvider) => flatDataProvider.enabled
      );

      if (!activeDataProviders.length) return queries;

      const activeDataProvidersQueries = activeDataProviders.map((activeDataProvider) =>
        buildQueryMatch(activeDataProvider, browserFields)
      );

      const activeDataProvidersQueryMatch = activeDataProvidersQueries.join(' and ');

      return [...queries, activeDataProvidersQueryMatch];
    }, [])
    .filter((queriesItem) => !isEmpty(queriesItem))
    .reduce((globalQuery: string, queryMatch: string, index: number, queries: string[]) => {
      if (queries.length <= 1) return queryMatch;

      return !index ? `(${queryMatch})` : `${globalQuery} or (${queryMatch})`;
    }, '');

export const buildTimeRangeFilter = (from: string, to: string): Filter =>
  ({
    range: {
      '@timestamp': {
        gte: from,
        lt: to,
        format: 'strict_date_optional_time',
      },
    },
    meta: {
      type: 'range',
      disabled: false,
      negate: false,
      alias: null,
      key: '@timestamp',
      params: {
        gte: from,
        lt: to,
        format: 'strict_date_optional_time',
      },
    },
    $state: {
      store: FilterStateStore.APP_STATE,
    },
  } as Filter);

export const isDataProviderEmpty = (dataProviders: DataProvider[]) => {
  return isEmpty(dataProviders) || isEmpty(dataProviders.filter((d) => d.enabled === true));
};

export const convertToBuildEsQuery = ({
  config,
  dataView,
  queries,
  filters,
}: {
  config: EsQueryConfig;
  dataView: DataView;
  queries: Query[];
  filters: Filter[];
}): [string, undefined] | [undefined, Error] => {
  try {
    return [
      JSON.stringify(
        buildEsQuery(
          dataView,
          queries,
          filters.filter((f) => f.meta.disabled === false),
          {
            nestedIgnoreUnmapped: true, // by default, prevent shard failures when unmapped `nested` fields are queried: https://github.com/elastic/kibana/issues/130340
            ...config,
            dateFormatTZ: undefined,
          }
        )
      ),
      undefined,
    ];
  } catch (error) {
    return [undefined, error];
  }
};

export interface CombinedQuery {
  filterQuery: string | undefined;
  kqlError: Error | undefined;
  baseKqlQuery: Query;
}

export const combineQueries = ({
  config,
  dataProviders = [],
  dataView,
  browserFields,
  filters = [],
  kqlQuery,
  kqlMode,
}: CombineQueries): CombinedQuery | null => {
  const kuery: Query = { query: '', language: kqlQuery.language };
  if (isDataProviderEmpty(dataProviders) && isEmpty(kqlQuery.query) && isEmpty(filters)) {
    return null;
  } else if (isDataProviderEmpty(dataProviders) && isEmpty(kqlQuery.query) && !isEmpty(filters)) {
    const [filterQuery, kqlError] = convertToBuildEsQuery({
      config,
      queries: [kuery],
      dataView,
      filters,
    });

    return {
      filterQuery,
      kqlError,
      baseKqlQuery: kuery,
    };
  }

  const operatorKqlQuery = kqlMode === 'filter' ? 'and' : 'or';

  const postpend = (q: string) => `${!isEmpty(q) ? `(${q})` : ''}`;

  const globalQuery = buildGlobalQuery(dataProviders, browserFields); // based on Data Providers

  const querySuffix = postpend(kqlQuery.query as string); // based on Unified Search bar

  const queryPrefix = globalQuery ? `(${globalQuery})` : '';

  const queryOperator = queryPrefix && querySuffix ? operatorKqlQuery : '';

  kuery.query = `(${queryPrefix} ${queryOperator} ${querySuffix})`;

  const [filterQuery, kqlError] = convertToBuildEsQuery({
    config,
    queries: [kuery],
    dataView,
    filters,
  });

  return {
    filterQuery,
    kqlError,
    baseKqlQuery: kuery,
  };
};
