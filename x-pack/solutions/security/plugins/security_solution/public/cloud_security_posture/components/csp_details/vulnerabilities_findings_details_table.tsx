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
import { DistributionBar } from '@kbn/security-solution-distribution-bar';
import type {
  VulnerabilitiesFindingDetailFields,
  VulnerabilitiesPackage,
} from '@kbn/cloud-security-posture/src/hooks/use_vulnerabilities_findings';
import {
  useVulnerabilitiesFindings,
  VULNERABILITY_FINDING,
} from '@kbn/cloud-security-posture/src/hooks/use_vulnerabilities_findings';
import type { MultiValueCellAction } from '@kbn/cloud-security-posture';
import {
  getVulnerabilityStats,
  CVSScoreBadge,
  SeverityStatusBadge,
  getNormalizedSeverity,
  ActionableBadge,
  MultiValueCellPopover,
  findReferenceLink,
} from '@kbn/cloud-security-posture';
import {
  ENTITY_FLYOUT_EXPAND_VULNERABILITY_VIEW_VISITS,
  NAV_TO_FINDINGS_BY_HOST_NAME_FROM_ENTITY_FLYOUT,
  uiMetricService,
} from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { METRIC_TYPE } from '@kbn/analytics';
import { SecurityPageName } from '@kbn/deeplinks-security';
import { useGetNavigationUrlParams } from '@kbn/cloud-security-posture/src/hooks/use_get_navigation_url_params';
import { useGetSeverityStatusColor } from '@kbn/cloud-security-posture/src/hooks/use_get_severity_status_color';
import { useHasVulnerabilities } from '@kbn/cloud-security-posture/src/hooks/use_has_vulnerabilities';
import { get } from 'lodash/fp';
import type { QueryDslQueryContainer } from '@kbn/data-views-plugin/common/types';

import type { EntityType } from '@kbn/entity-store/public';
import { FF_ENABLE_ENTITY_STORE_V2, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import type { UseCspOptions } from '@kbn/cloud-security-posture-common/types/findings';
import { SecuritySolutionLinkAnchor } from '../../../common/components/links';
import { useUiSetting } from '../../../common/lib/kibana';
import { useEntityFromStore } from '../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import type { CloudPostureEntityIdentifier } from '../entity_insight';

type VulnerabilitySortFieldType =
  | 'score'
  | 'vulnerability'
  | 'resource'
  | VULNERABILITY_FINDING.SEVERITY
  | VULNERABILITY_FINDING.ID
  | VULNERABILITY_FINDING.PACKAGE_NAME
  | VULNERABILITY_FINDING.TITLE
  | 'event'
  | VULNERABILITY_FINDING.PACKAGE_VERSION;

const EMPTY_VALUE = '-';

const buildVulnerabilityCspOptions = ({
  euidEntityFilter,
  sort,
  enabled,
  pageSize,
  currentFilter,
  includeSeverityFilter,
}: {
  euidEntityFilter: QueryDslQueryContainer | undefined;
  sort: UseCspOptions['sort'];
  enabled: boolean;
  pageSize: number;
  currentFilter: string;
  includeSeverityFilter: boolean;
}): UseCspOptions => {
  const filters: QueryDslQueryContainer[] = [];
  if (euidEntityFilter) {
    filters.push(euidEntityFilter);
  }
  if (includeSeverityFilter && currentFilter) {
    filters.push({
      bool: {
        should: [
          {
            term: {
              'vulnerability.severity': {
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

export const VulnerabilitiesFindingsDetailsTable = memo(
  ({
    identityField,
    value,
    entityId,
    entityType,
    onShowVulnerability,
  }: {
    identityField: CloudPostureEntityIdentifier;
    value: string;
    entityId?: string;
    entityType?: string;
    /** Callback executed after expanding a vulnerability finding. */
    onShowVulnerability: (params: {
      vulnerabilityId: string;
      resourceId: string;
      packageName: string;
      packageVersion: string;
      eventId: string;
    }) => void;
  }) => {
    const { getSeverityStatusColor } = useGetSeverityStatusColor();

    useEffect(() => {
      uiMetricService.trackUiMetric(
        METRIC_TYPE.COUNT,
        ENTITY_FLYOUT_EXPAND_VULNERABILITY_VIEW_VISITS
      );
    }, []);

    const [currentFilter, setCurrentFilter] = useState<string>('');
    const [sortField, setSortField] = useState<VulnerabilitySortFieldType>(
      VULNERABILITY_FINDING.SEVERITY
    );
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const sortFieldDirection: { [key: string]: string } = {};
    sortFieldDirection[sortField === 'score' ? 'vulnerability.score.base' : sortField] =
      sortDirection;

    const sorting: EuiTableSortingType<VulnerabilitiesFindingDetailFields> = {
      sort: {
        field: sortField,
        direction: sortDirection,
      },
    };

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

    const { data, isLoading } = useVulnerabilitiesFindings(
      buildVulnerabilityCspOptions({
        euidEntityFilter,
        sort: [sortFieldDirection],
        enabled: cspQueriesEnabled,
        pageSize: 1,
        currentFilter,
        includeSeverityFilter: true,
      })
    );

    const { counts } = useHasVulnerabilities(
      buildVulnerabilityCspOptions({
        euidEntityFilter,
        sort: [],
        enabled: cspQueriesEnabled,
        pageSize: 1,
        currentFilter: '',
        includeSeverityFilter: false,
      })
    );

    const { critical = 0, high = 0, medium = 0, low = 0, none = 0 } = counts || {};

    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    const findingsPagination = (findings: VulnerabilitiesFindingDetailFields[]) => {
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

    const { pageOfItems, totalItemCount } = findingsPagination(data?.rows || []);

    const pagination = {
      pageIndex,
      pageSize,
      totalItemCount,
      pageSizeOptions: [10, 25, 100],
    };

    const onTableChange = ({ page, sort }: Criteria<VulnerabilitiesFindingDetailFields>) => {
      if (page) {
        const { index, size } = page;
        setPageIndex(index);
        setPageSize(size);
      }
      if (sort) {
        const { field: fieldSort, direction } = sort;
        setSortField(fieldSort);
        setSortDirection(direction);
      }
    };

    const getNavUrlParams: ReturnType<typeof useGetNavigationUrlParams> =
      useGetNavigationUrlParams();

    const getVulnerabilityUrl = (name: string, queryField: CloudPostureEntityIdentifier) => {
      return getNavUrlParams({ [queryField]: name }, 'vulnerabilities');
    };

    const vulnerabilityStats = getVulnerabilityStats(
      {
        critical,
        high,
        medium,
        low,
        none,
      },
      getSeverityStatusColor,
      setCurrentFilter,
      currentFilter
    );

    const renderItem = useCallback(
      (item: string, i: number, field: string, object: VulnerabilitiesFindingDetailFields) => {
        const references = Array.isArray(object.vulnerability.reference)
          ? object.vulnerability.reference
          : [object.vulnerability.reference];

        const url = findReferenceLink(references, item);

        const actions: MultiValueCellAction[] = [
          ...(field === 'vulnerability.id' && url
            ? [
                {
                  onClick: () => window.open(url, '_blank'),
                  iconType: 'external',
                  ariaLabel: i18n.translate(
                    'xpack.securitySolution.vulnerabilities.findingsDetailsTable.openUrlInWindow',
                    {
                      defaultMessage: 'Open URL in window',
                    }
                  ),
                  title: i18n.translate(
                    'xpack.securitySolution.vulnerabilities.findingsDetailsTable.openUrlInWindow',
                    {
                      defaultMessage: 'Open URL in window',
                    }
                  ),
                },
              ]
            : []),
        ];

        return <ActionableBadge key={`${item}-${i}`} item={item} index={i} actions={actions} />;
      },
      []
    );

    const renderMultiValueCell = (field: string, finding: VulnerabilitiesFindingDetailFields) => {
      const cellValue = get(field, finding);
      if (!Array.isArray(cellValue)) {
        return <EuiText size="s">{cellValue || EMPTY_VALUE}</EuiText>;
      }

      return (
        <MultiValueCellPopover<VulnerabilitiesFindingDetailFields>
          items={cellValue}
          field={field}
          object={finding}
          renderItem={renderItem}
          firstItemRenderer={(item) => <EuiText size="s">{item}</EuiText>}
        />
      );
    };

    const columns: Array<EuiBasicTableColumn<VulnerabilitiesFindingDetailFields>> = [
      {
        field: 'vulnerability',
        name: '',
        width: '5%',
        render: (
          vulnerability: VulnerabilitiesPackage,
          finding: VulnerabilitiesFindingDetailFields
        ) => (
          <EuiToolTip
            content={i18n.translate(
              'xpack.securitySolution.flyout.left.insights.vulnerability.table.previewDetailsButtonTooltip',
              {
                defaultMessage: 'Preview vulnerability details',
              }
            )}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              iconType="maximize"
              onClick={() => {
                const vulnerabilityId = Array.isArray(vulnerability?.id)
                  ? vulnerability.id[0]
                  : vulnerability?.id;
                onShowVulnerability({
                  vulnerabilityId: vulnerabilityId ?? '',
                  resourceId: finding?.resource?.id ?? '',
                  packageName: finding?.[VULNERABILITY_FINDING.PACKAGE_NAME],
                  packageVersion: finding?.[VULNERABILITY_FINDING.PACKAGE_VERSION],
                  eventId: finding?.event?.id ?? '',
                });
              }}
              aria-label={i18n.translate(
                'xpack.securitySolution.flyout.left.insights.vulnerability.table.previewDetailsButtonAriaLabel',
                {
                  defaultMessage: 'Preview vulnerability details',
                }
              )}
            />
          </EuiToolTip>
        ),
      },
      {
        field: 'score',
        render: (score: { version?: string; base?: number }) => (
          <EuiText size="s">
            <CVSScoreBadge version={score?.version} score={score?.base} />
          </EuiText>
        ),
        name: i18n.translate(
          'xpack.securitySolution.flyout.left.insights.vulnerability.table.cvssColumnName',
          { defaultMessage: 'CVSS' }
        ),
        width: '10%',
        sortable: true,
      },
      {
        field: VULNERABILITY_FINDING.TITLE,
        render: (title: string) => {
          if (Array.isArray(title)) {
            return <EuiText size="s">{title.join(', ')}</EuiText>;
          }

          return <EuiText size="s">{title || EMPTY_VALUE}</EuiText>;
        },
        name: i18n.translate(
          'xpack.securitySolution.flyout.left.insights.vulnerability.table.vulnerabilityTitleColumnName',
          { defaultMessage: 'Vulnerability Title' }
        ),
        width: '25%',
        sortable: true,
      },
      {
        field: VULNERABILITY_FINDING.ID,
        render: (id: string, finding: VulnerabilitiesFindingDetailFields) =>
          renderMultiValueCell(VULNERABILITY_FINDING.ID, finding),
        name: i18n.translate(
          'xpack.securitySolution.flyout.left.insights.vulnerability.table.vulnerabilityIdColumnName',
          { defaultMessage: 'CVE ID' }
        ),
        width: '20%',
        sortable: true,
      },
      {
        field: VULNERABILITY_FINDING.SEVERITY,
        render: (severity: string) => (
          <>
            <EuiText size="s">
              <SeverityStatusBadge severity={getNormalizedSeverity(severity)} />
            </EuiText>
          </>
        ),
        name: i18n.translate(
          'xpack.securitySolution.flyout.left.insights.vulnerability.table.severityColumnName',
          { defaultMessage: 'Severity' }
        ),
        width: '10%',
        sortable: true,
      },
      {
        field: VULNERABILITY_FINDING.PACKAGE_NAME,
        render: (packageName: string, finding: VulnerabilitiesFindingDetailFields) =>
          renderMultiValueCell(VULNERABILITY_FINDING.PACKAGE_NAME, finding),
        name: i18n.translate(
          'xpack.securitySolution.flyout.left.insights.vulnerability.table.packageColumnName',
          { defaultMessage: 'Package' }
        ),
        width: '30%',
        sortable: true,
      },
    ];

    return (
      <>
        <EuiPanel hasShadow={false}>
          <SecuritySolutionLinkAnchor
            deepLinkId={SecurityPageName.cloudSecurityPostureFindings}
            path={`${getVulnerabilityUrl(value, identityField)}`}
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
              'xpack.securitySolution.flyout.left.insights.vulnerability.tableTitle',
              {
                defaultMessage: 'Vulnerability ',
              }
            )}
            <EuiIcon type="external" aria-hidden={true} />
          </SecuritySolutionLinkAnchor>
          <EuiSpacer size="xl" />
          <DistributionBar stats={vulnerabilityStats} />
          <EuiSpacer size="l" />
          <EuiBasicTable
            items={pageOfItems || []}
            rowHeader="result"
            columns={columns}
            pagination={pagination}
            onChange={onTableChange}
            data-test-subj={'securitySolutionFlyoutVulnerabilitiesFindingsTable'}
            sorting={sorting}
            loading={
              isLoading || (entityStoreV2Enabled && Boolean(entityId) && isEntityRecordLoading)
            }
            tableCaption={i18n.translate(
              'xpack.securitySolution.flyout.left.insights.vulnerability.findingsTableCaption',
              {
                defaultMessage: 'List of vulnerability findings',
              }
            )}
          />
        </EuiPanel>
      </>
    );
  }
);

VulnerabilitiesFindingsDetailsTable.displayName = 'VulnerabilitiesFindingsDetailsTable';
