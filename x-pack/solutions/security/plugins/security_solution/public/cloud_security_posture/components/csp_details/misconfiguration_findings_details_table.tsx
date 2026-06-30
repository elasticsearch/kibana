/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { Criteria, EuiBasicTableColumn, EuiTableSortingType } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiButtonIcon,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { CspFindingResult } from '@kbn/cloud-security-posture-common';
import { MISCONFIGURATION_STATUS } from '@kbn/cloud-security-posture-common';
import { DistributionBar } from '@kbn/security-solution-distribution-bar';
import type { CspBenchmarkRuleMetadata } from '@kbn/cloud-security-posture-common/schema/rules/latest';
import type { MisconfigurationFindingDetailFields } from '@kbn/cloud-security-posture';
import {
  CspEvaluationBadge,
  MISCONFIGURATION,
  useGetMisconfigurationStatusColor,
  useGetNavigationUrlParams,
  useHasMisconfigurations,
  useMisconfigurationFindings,
} from '@kbn/cloud-security-posture';

import {
  ENTITY_FLYOUT_EXPAND_MISCONFIGURATION_VIEW_VISITS,
  NAV_TO_FINDINGS_BY_HOST_NAME_FROM_ENTITY_FLYOUT,
  NAV_TO_FINDINGS_BY_RULE_NAME_FROM_ENTITY_FLYOUT,
  uiMetricService,
} from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { METRIC_TYPE } from '@kbn/analytics';
import { SecurityPageName } from '@kbn/deeplinks-security';
import type { QueryDslQueryContainer } from '@kbn/data-views-plugin/common/types';
import type { EntityType } from '@kbn/entity-store/public';
import { FF_ENABLE_ENTITY_STORE_V2, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import type { UseCspOptions } from '@kbn/cloud-security-posture-common/types/findings';
import { SecuritySolutionLinkAnchor } from '../../../common/components/links';
import { useUiSetting } from '../../../common/lib/kibana';
import { useEntityFromStore } from '../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import type { CloudPostureEntityIdentifier } from '../entity_insight';

type MisconfigurationSortFieldType =
  | MISCONFIGURATION.RESULT_EVALUATION
  | MISCONFIGURATION.RULE_NAME
  | 'resource'
  | 'rule';

interface MisconfigurationDetailsDistributionBarProps {
  key: string;
  count: number;
  color: string;
  filter: () => void;
  isCurrentFilter: boolean;
  reset: (event: React.MouseEvent<SVGElement, MouseEvent>) => void;
}

const useGetFindingsStats = () => {
  const { getMisconfigurationStatusColor } = useGetMisconfigurationStatusColor();

  const getFindingsStats = (
    passedFindingsStats: number,
    failedFindingsStats: number,
    filterFunction: (filter: string) => void,
    currentFilter: string
  ) => {
    const misconfigurationStats: MisconfigurationDetailsDistributionBarProps[] = [];
    if (passedFindingsStats === 0 && failedFindingsStats === 0) return [];
    if (passedFindingsStats > 0) {
      misconfigurationStats.push({
        key: i18n.translate(
          'xpack.securitySolution.flyout.right.insights.misconfigurations.passedFindingsText',
          {
            defaultMessage: '{count, plural, one {Passed finding} other {Passed findings}}',
            values: { count: passedFindingsStats },
          }
        ),
        count: passedFindingsStats,
        color: getMisconfigurationStatusColor(MISCONFIGURATION_STATUS.PASSED),
        filter: () => {
          filterFunction(MISCONFIGURATION_STATUS.PASSED);
        },
        isCurrentFilter: currentFilter === MISCONFIGURATION_STATUS.PASSED,
        reset: (event: React.MouseEvent<SVGElement, MouseEvent>) => {
          filterFunction('');
          event?.stopPropagation();
        },
      });
    }
    if (failedFindingsStats > 0) {
      misconfigurationStats.push({
        key: i18n.translate(
          'xpack.securitySolution.flyout.right.insights.misconfigurations.failedFindingsText',
          {
            defaultMessage: '{count, plural, one {Failed finding} other {Failed findings}}',
            values: { count: failedFindingsStats },
          }
        ),
        count: failedFindingsStats,
        color: getMisconfigurationStatusColor(MISCONFIGURATION_STATUS.FAILED),
        filter: () => {
          filterFunction(MISCONFIGURATION_STATUS.FAILED);
        },
        isCurrentFilter: currentFilter === MISCONFIGURATION_STATUS.FAILED,
        reset: (event: React.MouseEvent<SVGElement, MouseEvent>) => {
          filterFunction('');
          event?.stopPropagation();
        },
      });
    }
    return misconfigurationStats;
  };

  return { getFindingsStats };
};

const buildMisconfigurationCspOptions = ({
  euidEntityFilter,
  sort,
  enabled,
  pageSize,
  currentFilter,
  includeStatusFilter,
}: {
  euidEntityFilter: QueryDslQueryContainer | undefined;
  sort: UseCspOptions['sort'];
  enabled: boolean;
  pageSize: number;
  currentFilter: string;
  includeStatusFilter: boolean;
}): UseCspOptions => {
  const filters: QueryDslQueryContainer[] = [];
  if (euidEntityFilter) {
    filters.push(euidEntityFilter);
  }
  if (includeStatusFilter && currentFilter) {
    filters.push({
      bool: {
        should: [
          {
            term: {
              'result.evaluation': {
                value: currentFilter,
                case_insensitive: true,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  }
  return {
    query: { bool: { filter: filters } },
    sort: sort ?? [],
    enabled,
    pageSize,
  };
};

/**
 * Insights view displayed in the document details expandable flyout left section
 */
export const MisconfigurationFindingsDetailsTable = memo(
  ({
    field,
    value,
    entityId,
    entityType,
    onShowFinding,
  }: {
    field: CloudPostureEntityIdentifier;
    value: string;
    /** Canonical entity store id (`host.entity.id` / `user.entity.id`); when set with v2 FF, identity fields are loaded from the store for EUID DSL. */
    entityId?: string;
    entityType?: string;
    /** Callback executed after expanding a misconfiguration finding. */
    onShowFinding: (resourceId: string, ruleId: string) => void;
  }) => {
    useEffect(() => {
      uiMetricService.trackUiMetric(
        METRIC_TYPE.COUNT,
        ENTITY_FLYOUT_EXPAND_MISCONFIGURATION_VIEW_VISITS
      );
    }, []);

    const [currentFilter, setCurrentFilter] = useState<string>('');

    const [sortField, setSortField] = useState<MisconfigurationSortFieldType>(
      MISCONFIGURATION.RESULT_EVALUATION
    );
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const sortFieldDirection: { [key: string]: string } = {};
    sortFieldDirection[sortField] = sortDirection;

    const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);

    const { entityRecord, isLoading: isEntityRecordLoading } = useEntityFromStore({
      entityId,
      entityType,
      skip: !entityStoreV2Enabled || !entityId,
    });

    const euidApi = useEntityStoreEuidApi();
    const euidEntityFilter = useMemo(() => {
      if (!euidApi?.euid || entityRecord == null || entityType == null) {
        return undefined;
      }
      return euidApi.euid.dsl.getEuidFilterBasedOnDocument(entityType as EntityType, entityRecord);
    }, [euidApi?.euid, entityType, entityRecord]);

    const cspQueriesEnabled =
      entityRecord !== null && Boolean(euidEntityFilter) && Boolean(euidApi?.euid);

    const { data, isLoading } = useMisconfigurationFindings(
      buildMisconfigurationCspOptions({
        euidEntityFilter,
        sort: [sortFieldDirection],
        enabled: cspQueriesEnabled,
        pageSize: 1,
        currentFilter,
        includeStatusFilter: true,
      })
    );

    const { passedFindings, failedFindings } = useHasMisconfigurations(
      buildMisconfigurationCspOptions({
        euidEntityFilter,
        sort: [],
        enabled: cspQueriesEnabled,
        pageSize: 1,
        currentFilter: '',
        includeStatusFilter: false,
      })
    );

    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    const sorting: EuiTableSortingType<MisconfigurationFindingDetailFields> = {
      sort: {
        field: sortField,
        direction: sortDirection,
      },
    };

    const findingsPagination = (findings: MisconfigurationFindingDetailFields[]) => {
      let pageOfItems;

      if (!pageIndex && !pageSize) {
        pageOfItems = findings;
      } else {
        const startIndex = pageIndex * pageSize;
        pageOfItems = findings?.slice(
          startIndex,
          Math.min(startIndex + pageSize, findings?.length)
        );
      }

      return {
        pageOfItems,
        totalItemCount: findings?.length,
      };
    };

    const { pageOfItems, totalItemCount } = findingsPagination(
      (data?.rows as MisconfigurationFindingDetailFields[]) || []
    );

    const pagination = {
      pageIndex,
      pageSize,
      totalItemCount,
      pageSizeOptions: [10, 25, 100],
    };
    const onTableChange = useCallback(
      ({ page, sort }: Criteria<MisconfigurationFindingDetailFields>) => {
        if (page) {
          const { index, size } = page;
          setPageIndex(index);
          setPageSize(size);
        }
        if (sort) {
          const { field: fieldSort, direction } = sort;
          if (
            fieldSort === MISCONFIGURATION.RESULT_EVALUATION ||
            fieldSort === MISCONFIGURATION.RULE_NAME ||
            fieldSort === 'resource' ||
            fieldSort === 'rule'
          ) {
            setSortField(fieldSort);
            setSortDirection(direction);
          }
        }
      },
      []
    );

    const getNavUrlParams = useGetNavigationUrlParams();

    const getFindingsPageUrl = (name: string, queryField: CloudPostureEntityIdentifier) => {
      return getNavUrlParams({ [queryField]: name }, 'configurations', ['rule.name']);
    };

    const linkWidth = 40;
    const resultWidth = 74;

    const { getFindingsStats } = useGetFindingsStats();
    const misconfigurationStats = getFindingsStats(
      passedFindings,
      failedFindings,
      setCurrentFilter,
      currentFilter
    );

    const columns: Array<EuiBasicTableColumn<MisconfigurationFindingDetailFields>> = [
      {
        field: 'rule',
        name: '',
        width: `${linkWidth}`,
        render: (rule: CspBenchmarkRuleMetadata, finding: MisconfigurationFindingDetailFields) => (
          <EuiToolTip
            content={i18n.translate(
              'xpack.securitySolution.flyout.left.insights.misconfigurations.previewButtonAriaLabel',
              {
                defaultMessage: 'Preview finding details',
              }
            )}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              aria-label={i18n.translate(
                'xpack.securitySolution.flyout.left.insights.misconfigurations.previewButtonAriaLabel',
                {
                  defaultMessage: 'Preview finding details',
                }
              )}
              iconType="maximize"
              onClick={() => {
                uiMetricService.trackUiMetric(
                  METRIC_TYPE.CLICK,
                  NAV_TO_FINDINGS_BY_RULE_NAME_FROM_ENTITY_FLYOUT
                );

                onShowFinding(finding.resource.id, finding.rule.id);
              }}
            />
          </EuiToolTip>
        ),
      },
      {
        field: MISCONFIGURATION.RESULT_EVALUATION,
        render: (result: CspFindingResult['evaluation'] | undefined) => (
          <CspEvaluationBadge type={result} />
        ),
        name: i18n.translate(
          'xpack.securitySolution.flyout.left.insights.misconfigurations.table.resultColumnName',
          {
            defaultMessage: 'Result',
          }
        ),
        width: `${resultWidth}px`,
        sortable: true,
      },
      {
        field: MISCONFIGURATION.RULE_NAME,
        render: (ruleName: CspBenchmarkRuleMetadata['name']) => (
          <EuiText size="s">{ruleName}</EuiText>
        ),
        name: i18n.translate(
          'xpack.securitySolution.flyout.left.insights.misconfigurations.table.ruleColumnName',
          {
            defaultMessage: 'Rule',
          }
        ),
        width: `calc(100% - ${linkWidth + resultWidth}px)`,
        sortable: true,
      },
    ];

    return (
      <>
        <EuiPanel hasShadow={false}>
          <SecuritySolutionLinkAnchor
            deepLinkId={SecurityPageName.cloudSecurityPostureFindings}
            path={`${getFindingsPageUrl(value, field)}`}
            target={'_blank'}
            external={false}
            onClick={() => {
              uiMetricService.trackUiMetric(
                METRIC_TYPE.CLICK,
                NAV_TO_FINDINGS_BY_HOST_NAME_FROM_ENTITY_FLYOUT
              );
            }}
          >
            {i18n.translate(
              'xpack.securitySolution.flyout.left.insights.misconfigurations.tableTitle',
              {
                defaultMessage: 'Misconfigurations ',
              }
            )}
            <EuiIcon type="external" aria-hidden={true} />
          </SecuritySolutionLinkAnchor>
          <EuiSpacer size="xl" />
          <DistributionBar stats={misconfigurationStats} />
          <EuiSpacer size="l" />
          <EuiBasicTable
            items={pageOfItems || []}
            rowHeader="result"
            columns={columns}
            pagination={pagination}
            onChange={onTableChange}
            data-test-subj={'securitySolutionFlyoutMisconfigurationFindingsTable'}
            sorting={sorting}
            loading={
              isLoading || (entityStoreV2Enabled && Boolean(entityId) && isEntityRecordLoading)
            }
            tableCaption={i18n.translate(
              'xpack.securitySolution.flyout.left.insights.misconfigurations.tableCaption',
              {
                defaultMessage: 'Misconfiguration findings',
              }
            )}
          />
        </EuiPanel>
      </>
    );
  }
);

MisconfigurationFindingsDetailsTable.displayName = 'MisconfigurationFindingsDetailsTable';
