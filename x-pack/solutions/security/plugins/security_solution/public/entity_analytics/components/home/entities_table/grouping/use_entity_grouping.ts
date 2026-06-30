/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useContext, useEffect, useMemo } from 'react';
import * as uuid from 'uuid';
import {
  type GroupOption,
  type GroupingAggregation,
  type NamedAggregation,
  isNoneGroup,
  getGroupingQuery,
  useGrouping,
} from '@kbn/grouping';
import { parseGroupingQuery, MAX_QUERY_SIZE } from '@kbn/grouping/src';
import { buildEsQuery, type Filter } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';

import dedent from 'dedent';
import type { MappingRuntimeFieldType } from '@elastic/elasticsearch/lib/api/types';
import type { ESBoolQuery } from '../../../../../../common/typed_json';
import { useGlobalFilterQuery } from '../../../../../common/hooks/use_global_filter_query';
import { DataViewContext } from '..';
import type { EntityURLStateResult } from '../hooks/use_entity_url_state';
import { ENTITY_FIELDS, ENTITY_GROUPING_OPTIONS, ENTITY_TYPE_FILTER } from '../constants';
import {
  type EntitiesGroupingAggregation,
  type EntitiesGroupingQuery,
  useFetchGroupedData,
  useFetchTargetMetadata,
} from './use_fetch_grouped_data';
import { createGroupPanelRenderer, createGroupStatsRenderer } from './entity_group_renderer';
import { useHasEntityResolutionLicense } from '../../../../../common/hooks/use_has_entity_resolution_license';

const MAX_GROUPING_LEVELS = 3;

const entitiesUnit = (totalCount: number) =>
  i18n.translate('xpack.securitySolution.entityAnalytics.entitiesTable.unit', {
    values: { totalCount },
    defaultMessage: '{totalCount, plural, =1 {entity} other {entities}}',
  });

const entitiesGroupsUnit = (totalCount: number, _selectedGroup: string, hasNullGroup: boolean) => {
  const groupCount = hasNullGroup ? totalCount - 1 : totalCount;
  return i18n.translate('xpack.securitySolution.entityAnalytics.entitiesTable.groupsUnit', {
    values: { groupCount, formattedGroupCount: groupCount.toLocaleString() },
    defaultMessage: '{formattedGroupCount} {groupCount, plural, =1 {group} other {groups}}',
  });
};

const groupingTitle = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entitiesTable.groupBy',
  { defaultMessage: 'Group entities by' }
);

const getTermAggregation = (key: keyof EntitiesGroupingAggregation, field: string) => ({
  [key]: {
    terms: { field, size: 1 },
  },
});

export const getAggregationsByGroupField = (field: string): NamedAggregation[] => {
  if (isNoneGroup([field])) {
    return [];
  }
  const aggMetrics: NamedAggregation[] = [
    {
      groupByField: {
        cardinality: {
          field,
        },
      },
    },
  ];

  if (field === ENTITY_GROUPING_OPTIONS.ENTITY_TYPE) {
    return [...aggMetrics, getTermAggregation('entityType', ENTITY_FIELDS.ENTITY_TYPE)];
  }

  return aggMetrics;
};

export const buildResolutionGroupingQuery = ({
  filters,
  pageIndex,
  pageSize,
}: {
  filters: ESBoolQuery[];
  pageIndex: number;
  pageSize: number;
}): EntitiesGroupingQuery => ({
  size: 0,
  runtime_mappings: {
    groupByField: {
      type: 'keyword' as MappingRuntimeFieldType,
      script: {
        source: dedent(`
          if (doc.containsKey('${ENTITY_FIELDS.RESOLVED_TO}')
              && !doc['${ENTITY_FIELDS.RESOLVED_TO}'].empty) {
            emit(doc['${ENTITY_FIELDS.RESOLVED_TO}'].value);
          } else if (doc.containsKey('${ENTITY_FIELDS.ENTITY_ID}')
              && !doc['${ENTITY_FIELDS.ENTITY_ID}'].empty) {
            emit(doc['${ENTITY_FIELDS.ENTITY_ID}'].value);
          }
        `),
      },
    },
    bucketRiskScore: {
      type: 'double' as MappingRuntimeFieldType,
      script: {
        source: dedent(`
          if (doc.containsKey('${ENTITY_FIELDS.RESOLVED_TO}')
              && !doc['${ENTITY_FIELDS.RESOLVED_TO}'].empty) {
            return;
          }
          if (doc.containsKey('${ENTITY_FIELDS.RESOLUTION_RISK_SCORE}')
              && !doc['${ENTITY_FIELDS.RESOLUTION_RISK_SCORE}'].empty) {
            emit(doc['${ENTITY_FIELDS.RESOLUTION_RISK_SCORE}'].value);
          } else if (doc.containsKey('${ENTITY_FIELDS.ENTITY_RISK}')
              && !doc['${ENTITY_FIELDS.ENTITY_RISK}'].empty) {
            emit(doc['${ENTITY_FIELDS.ENTITY_RISK}'].value);
          }
        `),
      },
    },
  },
  aggs: {
    groupByFields: {
      terms: {
        field: 'groupByField',
        size: MAX_QUERY_SIZE,
        order: [{ bucketRiskScore: 'desc' as const }, { _count: 'desc' as const }],
      },
      aggs: {
        bucketRiskScore: {
          max: { field: 'bucketRiskScore' },
        },
        resolutionRiskScore: {
          max: { field: ENTITY_FIELDS.RESOLUTION_RISK_SCORE },
        },
        bucket_truncate: {
          bucket_sort: {
            from: pageIndex * pageSize,
            size: pageSize,
          },
        },
      },
    },
    unitsCount: { value_count: { field: 'groupByField' } },
    groupsCount: { cardinality: { field: 'groupByField' } },
  },
  query: {
    bool: {
      filter: filters,
    },
  },
  _source: false,
});

export const useEntityGrouping = ({
  state,
  groupFilters = [],
  selectedGroup,
  tableId,
  groupingId,
}: {
  state: EntityURLStateResult;
  groupFilters?: Filter[];
  selectedGroup?: string;
  /** Forwarded to `createGroupPanelRenderer` so resolution group flyouts open in the right scope. */
  tableId: string;
  /**
   * Identifier used by `@kbn/grouping` to persist the active grouping
   * selection. Required so independent mounts (e.g. the cases attachments
   * accordion) pass their own and grouping state doesn't leak between tables.
   */
  groupingId: string;
}) => {
  const { query, setUrlQuery, pageSize, pageIndex } = state;
  const { dataView, dataViewIsLoading } = useContext(DataViewContext);
  const { filterQuery: globalFilterQuery } = useGlobalFilterQuery();
  const hasResolutionLicense = useHasEntityResolutionLicense();

  const defaultGroupingOptions = useMemo<GroupOption[]>(() => {
    const resolutionOption: GroupOption = {
      label: i18n.translate(
        'xpack.securitySolution.entityAnalytics.entitiesTable.groupBy.resolution',
        { defaultMessage: 'Resolution' }
      ),
      key: ENTITY_GROUPING_OPTIONS.RESOLUTION,
    };
    const entityTypeOption: GroupOption = {
      label: i18n.translate(
        'xpack.securitySolution.entityAnalytics.entitiesTable.groupBy.entityType',
        { defaultMessage: 'Entity type' }
      ),
      key: ENTITY_GROUPING_OPTIONS.ENTITY_TYPE,
    };
    if (hasResolutionLicense) {
      return [resolutionOption, entityTypeOption];
    }
    return [entityTypeOption];
  }, [hasResolutionLicense]);

  const initialGroupings = useMemo(
    () => ({
      groupById: {
        [groupingId]: {
          activeGroups: hasResolutionLicense
            ? [ENTITY_GROUPING_OPTIONS.RESOLUTION]
            : [ENTITY_GROUPING_OPTIONS.NONE],
          options: defaultGroupingOptions,
        },
      },
    }),
    [defaultGroupingOptions, hasResolutionLicense, groupingId]
  );

  const additionalFilters = buildEsQuery(dataView, [], groupFilters);
  const isResolutionGrouping = selectedGroup === ENTITY_GROUPING_OPTIONS.RESOLUTION;
  const uniqueValue = useMemo(() => `${selectedGroup}-${uuid.v4()}`, [selectedGroup]);

  const groupingQuery = useMemo(() => {
    const allFilters = [
      ...(query ? [query] : []),
      additionalFilters,
      ENTITY_TYPE_FILTER,
      ...(globalFilterQuery ? [globalFilterQuery] : []),
    ];

    if (isResolutionGrouping) {
      return buildResolutionGroupingQuery({
        filters: allFilters,
        pageIndex,
        pageSize,
      });
    }

    const currentGroup = selectedGroup || ENTITY_GROUPING_OPTIONS.ENTITY_TYPE;
    return {
      ...getGroupingQuery({
        additionalFilters: allFilters,
        groupByField: currentGroup,
        uniqueValue,
        pageNumber: pageIndex * pageSize,
        size: pageSize,
        sort: [{ groupByField: { order: 'desc' } }],
        statsAggregations: getAggregationsByGroupField(currentGroup),
        rootAggregations: [
          {
            ...(!isNoneGroup([currentGroup]) && {
              nullGroupItems: { missing: { field: currentGroup } },
            }),
          },
        ],
      }),
      runtime_mappings: {
        groupByField: {
          type: 'keyword' as MappingRuntimeFieldType,
          script: {
            source: dedent(`
          def groupValues = [];
          if (doc.containsKey(params['selectedGroup']) && !doc[params['selectedGroup']].empty) {
            groupValues = doc[params['selectedGroup']];
          }
          boolean treatAsUndefined = false;
          int count = groupValues.size();
          treatAsUndefined = (count == 0 || count > 100);
          if (treatAsUndefined) {
            emit(params['uniqueValue']);
          } else {
            emit(groupValues.join(params['uniqueValue']));
          }
        `),
            params: {
              selectedGroup: currentGroup,
              uniqueValue,
            },
          },
        },
      },
    };
  }, [
    selectedGroup,
    isResolutionGrouping,
    uniqueValue,
    additionalFilters,
    query,
    pageIndex,
    pageSize,
    globalFilterQuery,
  ]);

  const { data, isFetching } = useFetchGroupedData({
    query: groupingQuery,
    enabled: !!selectedGroup && !isNoneGroup([selectedGroup]),
  });

  const groupData = useMemo(
    () =>
      parseGroupingQuery(
        selectedGroup || ENTITY_GROUPING_OPTIONS.ENTITY_TYPE,
        uniqueValue,
        data as GroupingAggregation<EntitiesGroupingAggregation>
      ),
    [data, selectedGroup, uniqueValue]
  );

  const targetEntityIds = useMemo(() => {
    if (!isResolutionGrouping || !('groupByFields' in groupData)) return [];
    const buckets = groupData.groupByFields?.buckets;
    if (!buckets) return [];
    return buckets.map((bucket) => String(bucket.key_as_string ?? bucket.key));
  }, [groupData, isResolutionGrouping]);

  const targetMetadata = useFetchTargetMetadata(targetEntityIds);

  const groupPanelRenderer = useMemo(
    () => createGroupPanelRenderer(targetMetadata, tableId),
    [targetMetadata, tableId]
  );

  const groupStatsRenderer = useMemo(
    () => createGroupStatsRenderer(targetMetadata),
    [targetMetadata]
  );

  const grouping = useGrouping({
    componentProps: {
      unit: entitiesUnit,
      groupPanelRenderer,
      getGroupStats: groupStatsRenderer,
      groupsUnit: entitiesGroupsUnit,
    },
    defaultGroupingOptions,
    initialGroupings,
    fields: dataViewIsLoading ? [] : dataView.fields,
    groupingId,
    maxGroupingLevels: MAX_GROUPING_LEVELS,
    title: groupingTitle,
    onGroupChange: ({ groupByFields }) => {
      setUrlQuery({
        groupBy: groupByFields,
      });
    },
  });

  useEffect(() => {
    const currentGroups = grouping.selectedGroups;
    if (!hasResolutionLicense && currentGroups.includes(ENTITY_GROUPING_OPTIONS.RESOLUTION)) {
      const filtered = currentGroups.filter((g) => g !== ENTITY_GROUPING_OPTIONS.RESOLUTION);
      const newGroups = filtered.length > 0 ? filtered : [ENTITY_GROUPING_OPTIONS.NONE];
      grouping.setSelectedGroups(newGroups);
      setUrlQuery({ groupBy: newGroups });
    }
  }, [hasResolutionLicense, grouping, setUrlQuery]);

  const isNoneSelected = isNoneGroup(grouping.selectedGroups);

  const isEmptyResults =
    !isFetching && 'unitsCount' in groupData && groupData.unitsCount?.value === 0;

  return {
    groupData,
    grouping,
    isFetching,
    selectedGroup,
    isGroupSelected: !isNoneSelected,
    isEmptyResults,
  };
};
