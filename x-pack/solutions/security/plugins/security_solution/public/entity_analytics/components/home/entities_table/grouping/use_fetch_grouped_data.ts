/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchRequest, SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import type { IKibanaSearchResponse } from '@kbn/search-types';
import type { GenericBuckets, GroupingQuery, RootAggregation } from '@kbn/grouping/src';
import { useQuery } from '@kbn/react-query';
import { lastValueFrom } from 'rxjs';
import { showErrorToast } from '@kbn/cloud-security-posture';
import { useContext, useMemo } from 'react';
import type { EntityType } from '../../../../../../common/entity_analytics/types';
import { useKibana } from '../../../../../common/lib/kibana';
import { ENTITY_FIELDS, QUERY_KEY_GROUPING_DATA, QUERY_KEY_ENTITY_ANALYTICS } from '../constants';
import { DataViewContext } from '..';

export type EntitiesGroupingQuery = GroupingQuery | SearchRequest;

export interface EntitiesGroupingAggregation {
  entityType?: {
    buckets?: GenericBuckets[];
  };
  resolutionRiskScore?: {
    value: number | null;
  };
  bucketRiskScore?: {
    value: number | null;
  };
}

export interface TargetEntityMetadata {
  name: string;
  type: EntityType;
  riskScore: number | null;
  individualRiskScore: number | null;
}

export type TargetMetadataMap = Map<string, TargetEntityMetadata>;

const EMPTY_TARGET_METADATA: TargetMetadataMap = new Map();

interface TargetEntitySource {
  entity?: {
    id?: string;
    name?: string;
    EngineMetadata?: { Type?: EntityType };
    risk?: {
      calculated_score_norm?: number;
    };
    relationships?: {
      resolution?: {
        risk?: {
          calculated_score_norm?: number;
        };
      };
    };
  };
}

export const parseTargetMetadataHits = (hits: Array<{ _source?: unknown }>): TargetMetadataMap => {
  const result: TargetMetadataMap = new Map();
  for (const hit of hits) {
    const { id, name, EngineMetadata, risk, relationships } =
      (hit._source as TargetEntitySource)?.entity ?? {};
    const type = EngineMetadata?.Type;
    const riskScore = relationships?.resolution?.risk?.calculated_score_norm ?? null;
    const individualRiskScore = risk?.calculated_score_norm ?? null;

    if (id && name && type) {
      result.set(id, { name, type, riskScore, individualRiskScore });
    }
  }
  return result;
};

export type EntitiesRootGroupingAggregation = RootAggregation<EntitiesGroupingAggregation>;

export const getGroupedEntitiesQuery = (query: EntitiesGroupingQuery, indexPattern: string) => {
  return {
    ...query,
    index: indexPattern,
    project_routing: '_alias:_origin',
    ignore_unavailable: true,
    size: 0,
  };
};

const useEntitySearchParams = () => {
  const {
    data: { search: searchService },
    notifications: { toasts },
  } = useKibana().services;

  const { dataView } = useContext(DataViewContext);

  const indexPattern = useMemo(() => dataView?.getIndexPattern(), [dataView]);

  return { searchService, toasts, indexPattern };
};

export const useFetchGroupedData = ({
  query,
  enabled = true,
}: {
  query: EntitiesGroupingQuery;
  enabled: boolean;
}) => {
  const { searchService, toasts, indexPattern } = useEntitySearchParams();

  return useQuery(
    [QUERY_KEY_ENTITY_ANALYTICS, QUERY_KEY_GROUPING_DATA, { query }],
    async () => {
      const {
        rawResponse: { aggregations },
      } = await lastValueFrom(
        searchService.search<
          {},
          IKibanaSearchResponse<SearchResponse<{}, EntitiesRootGroupingAggregation>>
        >({
          params: getGroupedEntitiesQuery(query, indexPattern),
        })
      );

      if (!aggregations) throw new Error('Failed to aggregate by, missing resource id');

      return aggregations;
    },
    {
      onError: (err: Error) => showErrorToast(toasts, err),
      enabled: enabled && !!indexPattern,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
    }
  );
};

const QUERY_KEY_TARGET_METADATA = 'entity-analytics-resolution-target-metadata';

export const useFetchTargetMetadata = (entityIds: string[]): TargetMetadataMap => {
  const { searchService, toasts, indexPattern } = useEntitySearchParams();

  const { data: metadataMap } = useQuery(
    [QUERY_KEY_ENTITY_ANALYTICS, QUERY_KEY_TARGET_METADATA, entityIds],
    async () => {
      const {
        rawResponse: { hits },
      } = await lastValueFrom(
        searchService.search<{}, IKibanaSearchResponse<SearchResponse>>({
          params: {
            index: indexPattern,
            project_routing: '_alias:_origin',
            ignore_unavailable: true,
            size: entityIds.length,
            _source: [
              ENTITY_FIELDS.ENTITY_ID,
              ENTITY_FIELDS.ENTITY_NAME,
              ENTITY_FIELDS.ENTITY_TYPE,
              ENTITY_FIELDS.ENTITY_RISK,
              ENTITY_FIELDS.RESOLUTION_RISK_SCORE,
            ],
            query: {
              bool: {
                filter: [{ terms: { [ENTITY_FIELDS.ENTITY_ID]: entityIds } }],
                must_not: [{ exists: { field: ENTITY_FIELDS.RESOLVED_TO } }],
              },
            },
          },
        })
      );

      return parseTargetMetadataHits(hits.hits);
    },
    {
      onError: (err: Error) => showErrorToast(toasts, err),
      enabled: entityIds.length > 0 && !!indexPattern,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
    }
  );

  return metadataMap ?? EMPTY_TARGET_METADATA;
};
