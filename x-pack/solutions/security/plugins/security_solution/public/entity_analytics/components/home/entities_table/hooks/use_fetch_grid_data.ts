/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useInfiniteQuery } from '@kbn/react-query';
import { lastValueFrom } from 'rxjs';
import { number } from 'io-ts';
import type * as estypes from '@elastic/elasticsearch/lib/api/types';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { EsHitRecord } from '@kbn/discover-utils/types';
import { showErrorToast } from '@kbn/cloud-security-posture';
import type { IKibanaSearchResponse, IKibanaSearchRequest } from '@kbn/search-types';
import type { BaseEsQuery } from '@kbn/cloud-security-posture';
import { useContext, useMemo } from 'react';
import { useKibana } from '../../../../../common/lib/kibana';
import {
  ENTITY_FIELDS,
  ENTITY_TYPE_FILTER,
  MAX_ENTITIES_TO_LOAD,
  QUERY_KEY_GRID_DATA,
  QUERY_KEY_ENTITY_ANALYTICS,
} from '../constants';
import { getRuntimeMappingsFromSort, getMultiFieldsSort } from './fetch_utils';
import { DataViewContext } from '..';

interface UseEntitiesOptions extends BaseEsQuery {
  sort: string[][];
  enabled: boolean;
  pageSize: number;
}

const ENTITY_TABLE_RUNTIME_MAPPING_FIELDS: string[] = [
  ENTITY_FIELDS.ENTITY_ID,
  ENTITY_FIELDS.ENTITY_NAME,
];

export const getEntitiesQuery = (
  { query, sort }: UseEntitiesOptions,
  pageParam: unknown,
  indexPattern?: string
) => {
  if (!indexPattern) {
    throw new Error('Index pattern is required');
  }

  return {
    index: [indexPattern],
    project_routing: '_alias:_origin',
    sort: getMultiFieldsSort(sort),
    runtime_mappings: getRuntimeMappingsFromSort(ENTITY_TABLE_RUNTIME_MAPPING_FIELDS, sort),
    size: MAX_ENTITIES_TO_LOAD,
    ignore_unavailable: true,
    query: {
      ...query,
      bool: {
        ...query?.bool,
        filter: [...(query?.bool?.filter ?? []), ENTITY_TYPE_FILTER],
      },
    },
    ...(pageParam ? { from: pageParam } : {}),
  };
};

interface Entity {
  '@timestamp': string;
  name: string;
  risk: number;
  criticality: string;
  category: string;
}

type LatestEntitiesRequest = IKibanaSearchRequest<estypes.SearchRequest>;
type LatestEntitiesResponse = IKibanaSearchResponse<estypes.SearchResponse<Entity, never>>;

export const buildInspectData = (queryParams: object, rawResponse: object) => ({
  dsl: [JSON.stringify(queryParams)],
  response: [JSON.stringify(rawResponse, null, 2)],
});

export function useFetchGridData(options: UseEntitiesOptions) {
  const {
    data,
    notifications: { toasts },
  } = useKibana().services;

  const { dataView } = useContext(DataViewContext);

  const dataViewIndexPattern = useMemo(() => {
    return dataView?.getIndexPattern();
  }, [dataView]);

  return useInfiniteQuery(
    [QUERY_KEY_ENTITY_ANALYTICS, QUERY_KEY_GRID_DATA, { params: options }],
    async ({ pageParam }) => {
      const queryParams = getEntitiesQuery(options, pageParam, dataViewIndexPattern);
      const {
        rawResponse,
        rawResponse: { hits },
      } = await lastValueFrom(
        data.search.search<LatestEntitiesRequest, LatestEntitiesResponse>({
          params: queryParams as LatestEntitiesRequest['params'],
        })
      );

      return {
        page: hits.hits.map((hit) => buildDataTableRecord(hit as EsHitRecord)),
        total: number.is(hits.total) ? hits.total : 0,
        inspect: buildInspectData(queryParams, rawResponse),
      };
    },
    {
      enabled: options.enabled && !!dataViewIndexPattern,
      keepPreviousData: true,
      onError: (err: Error) => showErrorToast(toasts, err),
      getNextPageParam: (lastPage, allPages) => {
        if (lastPage.page.length < options.pageSize) {
          return undefined;
        }
        return allPages.length * options.pageSize;
      },
    }
  );
}
