/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useCallback } from 'react';
import {
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButtonEmpty,
  EuiCallOut,
  EuiToolTip,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { MainCategories, PipelineDataFlowHealth, PipelineStats } from '@kbn/siem-readiness';
import {
  CATEGORY_ORDER,
  filterPipelinesByCategories,
  getContinuityDataFlowHealth,
} from '@kbn/siem-readiness';
import { useSiemReadinessApi } from '../../../hooks/use_siem_readiness_api';
import {
  CategoryAccordionTable,
  type CategoryData,
} from '../../components/category_accordion_table';
import type { SiemReadinessTabActiveCategoriesProps } from '../../components/configuration_panel';
import { useSiemReadinessCases } from '../../../hooks/use_siem_readiness_cases';
import { useBasePath } from '../../../../common/lib/kibana';
import { ContinuityWarningPrompt } from './continuity_warning_prompt';
import {
  buildContinuityCaseDescription,
  getContinuityCaseTitle,
  getContinuityCaseTags,
} from './continuity_add_case_details';
import { ViewCasesButton } from '../../components/view_cases_button';
import {
  getFailureRateString,
  isCriticalFailureRateFromString,
} from '../../../hooks/visibility_status_utils';
import { SIEM_READINESS_ACCORDIONS_STORAGE_KEY } from '../../../constants';

const DATA_CONTINUITY_CASE_TAGS = ['siem-readiness', 'data-continuity', 'ingest-pipelines'];

export interface PipelineInfoWithStatus extends PipelineStats, Record<string, unknown> {
  failureRate: string;
  status: 'healthy' | 'critical';
  continuityDataFlowHealth: PipelineDataFlowHealth;
}

const getDocInjectionStatus = (failureRate: string): 'healthy' | 'critical' => {
  return isCriticalFailureRateFromString(failureRate) ? 'critical' : 'healthy';
};

export const getIngestPipelineUrl = (basePath: string, pipelineName: string): string => {
  return `${basePath}/app/management/ingest/ingest_pipelines?pipeline=${encodeURIComponent(
    pipelineName
  )}`;
};

export const ContinuityTab: React.FC<SiemReadinessTabActiveCategoriesProps> = ({
  activeCategories,
}) => {
  const basePath = useBasePath();
  const { openNewCaseFlyout } = useSiemReadinessCases();
  const { getReadinessPipelines, getReadinessCategories } = useSiemReadinessApi();

  const { data: pipelinesData, isLoading: pipelinesLoading } = getReadinessPipelines;
  const { data: categoriesData, isLoading: categoriesLoading } = getReadinessCategories;

  const pipelineItems = pipelinesData?.items;

  // If any pipeline has statsAvailable: false, stats are not available for this environment
  const statsAvailable = pipelineItems ? pipelineItems.every((p) => p.statsAvailable) : true;

  // Build index → all-categories map from the categories API response
  const indexToCategoriesMap = useMemo(() => {
    const map = new Map<string, MainCategories[]>();
    categoriesData?.mainCategoriesMap?.forEach((group) => {
      group.indices.forEach((idx) => {
        const existing = map.get(idx.indexName) ?? [];
        map.set(idx.indexName, [...existing, group.category as MainCategories]);
      });
    });
    return map;
  }, [categoriesData]);

  // Shared filter: same predicate used by the agent tool.
  // Produces the flat list of pipelines that serve at least one categorized SIEM index.
  const filteredPipelineItems = useMemo(
    () => filterPipelinesByCategories(pipelineItems ?? [], categoriesData),
    [pipelineItems, categoriesData]
  );

  // Group filtered pipelines by category (UI-only: adds status fields and respects activeCategories).
  const categorizedPipelines: Array<CategoryData<PipelineInfoWithStatus>> = useMemo(() => {
    if (!filteredPipelineItems.length) return [];

    const categoryPipelinesMap = new Map<string, PipelineInfoWithStatus[]>();

    filteredPipelineItems.forEach((pipeline) => {
      const failureRate = getFailureRateString(pipeline.failedDocsCount, pipeline.docsCount);

      const pipelineWithStats: PipelineInfoWithStatus = {
        ...pipeline,
        failureRate,
        status: getDocInjectionStatus(failureRate),
        continuityDataFlowHealth: getContinuityDataFlowHealth(pipeline),
      };

      const pipelineCategories = new Set<MainCategories>();
      pipeline.indices.forEach((indexName) => {
        (indexToCategoriesMap.get(indexName) ?? []).forEach((cat) => pipelineCategories.add(cat));
      });

      pipelineCategories.forEach((category) => {
        if (activeCategories.includes(category)) {
          const existing = categoryPipelinesMap.get(category) ?? [];
          existing.push(pipelineWithStats);
          categoryPipelinesMap.set(category, existing);
        }
      });
    });

    const result: Array<CategoryData<PipelineInfoWithStatus>> = [];
    activeCategories.forEach((category) => {
      const items = categoryPipelinesMap.get(category);
      if (items) result.push({ category, items });
    });

    return result;
  }, [filteredPipelineItems, indexToCategoriesMap, activeCategories]);

  const hasUnfilteredData = (pipelineItems?.length ?? 0) > 0;

  // Check if any pipeline has failures
  const hasDocCriticalFailures = useMemo(() => {
    return categorizedPipelines.some((category) =>
      category.items.some((pipeline) => pipeline.status === 'critical')
    );
  }, [categorizedPipelines]);

  // Case description
  const caseDescription = useMemo(
    () => buildContinuityCaseDescription(categorizedPipelines, basePath),
    [categorizedPipelines, basePath]
  );

  const handleCreateCase = useCallback(() => {
    openNewCaseFlyout({
      title: getContinuityCaseTitle(),
      description: caseDescription,
      tags: getContinuityCaseTags(),
    });
  }, [openNewCaseFlyout, caseDescription]);

  // Table columns
  const columns: Array<EuiBasicTableColumn<PipelineInfoWithStatus>> = useMemo(
    () => [
      {
        field: 'name',
        name: i18n.translate('xpack.securitySolution.siemReadiness.continuity.column.name', {
          defaultMessage: 'Pipeline Name',
        }),
        sortable: true,
        truncateText: true,
        width: statsAvailable ? '25%' : '70%',
      },
      ...(statsAvailable
        ? [
            {
              field: 'docsCount',
              name: i18n.translate(
                'xpack.securitySolution.siemReadiness.continuity.column.docsIngested',
                { defaultMessage: 'Docs Ingested' }
              ),
              sortable: true,
              render: (docsCount: number) => docsCount.toLocaleString(),
              width: '15%',
            } as EuiBasicTableColumn<PipelineInfoWithStatus>,
            {
              field: 'failedDocsCount',
              name: i18n.translate(
                'xpack.securitySolution.siemReadiness.continuity.column.failedDocs',
                { defaultMessage: 'Failed Docs' }
              ),
              sortable: true,
              render: (failedDocsCount: number) => failedDocsCount.toLocaleString(),
              width: '12%',
            } as EuiBasicTableColumn<PipelineInfoWithStatus>,
            {
              field: 'failureRate',
              name: i18n.translate(
                'xpack.securitySolution.siemReadiness.continuity.column.failureRate',
                { defaultMessage: 'Failure Rate' }
              ),
              sortable: true,
              render: (failureRate: string) => `${failureRate}%`,
              width: '13%',
            } as EuiBasicTableColumn<PipelineInfoWithStatus>,
            {
              field: 'failureRate',
              name: i18n.translate(
                'xpack.securitySolution.siemReadiness.continuity.column.status',
                { defaultMessage: 'Status' }
              ),
              render: (failureRate: string) => {
                const isCritical = isCriticalFailureRateFromString(failureRate);
                return (
                  <EuiBadge color={isCritical ? 'danger' : 'success'}>
                    {isCritical
                      ? i18n.translate(
                          'xpack.securitySolution.siemReadiness.continuity.status.criticalFailureRate',
                          { defaultMessage: 'Critical failure rate' }
                        )
                      : i18n.translate(
                          'xpack.securitySolution.siemReadiness.continuity.status.healthy',
                          { defaultMessage: 'Healthy' }
                        )}
                  </EuiBadge>
                );
              },
              width: '15%',
            } as EuiBasicTableColumn<PipelineInfoWithStatus>,
            {
              field: 'continuityDataFlowHealth',
              name: i18n.translate('xpack.securitySolution.siemReadiness.continuity.column.issue', {
                defaultMessage: 'Issue',
              }),
              sortable: true,
              render: (
                continuityDataFlowHealth: PipelineDataFlowHealth,
                item: PipelineInfoWithStatus
              ) => {
                if (continuityDataFlowHealth === 'silent') {
                  const tooltip =
                    item.silenceMs != null
                      ? i18n.translate(
                          'xpack.securitySolution.siemReadiness.continuity.health.silentTooltip',
                          {
                            defaultMessage: 'No events received for {hours}h',
                            values: { hours: Math.round(item.silenceMs / (60 * 60 * 1000)) },
                          }
                        )
                      : undefined;
                  const badge = (
                    <EuiBadge color="danger">
                      {i18n.translate(
                        'xpack.securitySolution.siemReadiness.continuity.health.silent',
                        { defaultMessage: 'Silent' }
                      )}
                    </EuiBadge>
                  );
                  return tooltip ? <EuiToolTip content={tooltip}>{badge}</EuiToolTip> : badge;
                }
                if (continuityDataFlowHealth === 'volume_drop_critical') {
                  return (
                    <EuiBadge color="danger">
                      {i18n.translate(
                        'xpack.securitySolution.siemReadiness.continuity.health.volumeDropCritical',
                        { defaultMessage: 'Volume drop (critical)' }
                      )}
                    </EuiBadge>
                  );
                }
                if (continuityDataFlowHealth === 'volume_drop_warning') {
                  return (
                    <EuiBadge color="warning">
                      {i18n.translate(
                        'xpack.securitySolution.siemReadiness.continuity.health.volumeDrop',
                        { defaultMessage: 'Volume drop' }
                      )}
                    </EuiBadge>
                  );
                }
                return (
                  <EuiBadge color="success">
                    {i18n.translate(
                      'xpack.securitySolution.siemReadiness.continuity.health.healthy',
                      { defaultMessage: 'Healthy' }
                    )}
                  </EuiBadge>
                );
              },
              width: '20%',
            } as EuiBasicTableColumn<PipelineInfoWithStatus>,
          ]
        : []),
      {
        field: 'name' as const,
        name: i18n.translate('xpack.securitySolution.siemReadiness.continuity.column.actions', {
          defaultMessage: 'Actions',
        }),
        actions: [
          {
            render: (item: PipelineInfoWithStatus) => (
              <EuiButtonEmpty
                size="s"
                href={getIngestPipelineUrl(basePath, item.name)}
                target="_blank"
              >
                {isCriticalFailureRateFromString(item.failureRate)
                  ? i18n.translate(
                      'xpack.securitySolution.siemReadiness.continuity.action.viewFailure',
                      {
                        defaultMessage: 'View Failure',
                      }
                    )
                  : i18n.translate(
                      'xpack.securitySolution.siemReadiness.continuity.action.viewPipeline',
                      {
                        defaultMessage: 'View Pipeline',
                      }
                    )}
              </EuiButtonEmpty>
            ),
          },
        ],
      },
    ],
    [basePath, statsAvailable]
  );

  // Render function for accordion extra action (right side badges/stats)
  const renderExtraAction = (category: CategoryData<PipelineInfoWithStatus>) => {
    const totalPipelines = category.items.length;
    const totalDocs = category.items.reduce((sum, p) => sum + p.docsCount, 0);
    const totalFailed = category.items.reduce((sum, p) => sum + p.failedDocsCount, 0);
    const overallFailureRate = getFailureRateString(totalFailed, totalDocs);
    const isCritical = isCriticalFailureRateFromString(overallFailureRate);

    return (
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        {/* Status */}
        {statsAvailable && (
          <>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {i18n.translate('xpack.securitySolution.siemReadiness.continuity.status.label', {
                  defaultMessage: 'Status:',
                })}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color={isCritical ? 'warning' : 'success'}>
                {isCritical
                  ? i18n.translate(
                      'xpack.securitySolution.siemReadiness.continuity.status.actionsRequired',
                      { defaultMessage: 'Actions required' }
                    )
                  : i18n.translate(
                      'xpack.securitySolution.siemReadiness.continuity.status.healthy',
                      { defaultMessage: 'Healthy' }
                    )}
              </EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {'|'}
              </EuiText>
            </EuiFlexItem>
          </>
        )}
        {/* Pipelines */}
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.securitySolution.siemReadiness.continuity.pipelines.label', {
              defaultMessage: 'Pipelines:',
            })}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">{totalPipelines}</EuiBadge>
        </EuiFlexItem>
        {statsAvailable && (
          <>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {'|'}
              </EuiText>
            </EuiFlexItem>
            {/* Docs Ingested */}
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {i18n.translate(
                  'xpack.securitySolution.siemReadiness.continuity.docsIngested.label',
                  { defaultMessage: 'Docs Ingested:' }
                )}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{totalDocs.toLocaleString()}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {'|'}
              </EuiText>
            </EuiFlexItem>
            {/* Failure Rate */}
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {i18n.translate(
                  'xpack.securitySolution.siemReadiness.continuity.failureRate.label',
                  { defaultMessage: 'Failure Rate:' }
                )}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{`${overallFailureRate}%`}</EuiBadge>
            </EuiFlexItem>
          </>
        )}
      </EuiFlexGroup>
    );
  };

  const isLoading = pipelinesLoading || categoriesLoading;

  if (isLoading) {
    return (
      <>
        <EuiSpacer size="l" />
        <EuiFlexGroup justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
  }

  return (
    <>
      <EuiSpacer size="m" />
      {!statsAvailable && (
        <>
          <EuiCallOut
            announceOnMount
            title={i18n.translate(
              'xpack.securitySolution.siemReadiness.continuity.statsUnavailable.title',
              { defaultMessage: 'Ingestion stats not available' }
            )}
            color="warning"
            iconType="warning"
          >
            <p>
              {i18n.translate(
                'xpack.securitySolution.siemReadiness.continuity.statsUnavailable.body',
                {
                  defaultMessage:
                    'Pipeline ingestion stats (docs ingested, failed docs, failure rate) are not available in serverless mode. Pipelines are listed below for reference.',
                }
              )}
            </p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}
      {statsAvailable && hasDocCriticalFailures && (
        <>
          <ContinuityWarningPrompt />
          <EuiSpacer size="m" />
        </>
      )}
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem>
          <EuiText size="s" color="subdued">
            {i18n.translate('xpack.securitySolution.siemReadiness.continuity.description', {
              defaultMessage:
                'The following table summarizes the stability of your data by tracking ingest pipeline failure rates across log categories.',
            })}
          </EuiText>
        </EuiFlexItem>
        {statsAvailable && hasDocCriticalFailures && (
          <>
            <EuiFlexItem grow={false}>
              <ViewCasesButton caseTagsArray={DATA_CONTINUITY_CASE_TAGS} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                iconSide="right"
                size="s"
                iconType="plusCircle"
                onClick={handleCreateCase}
                data-test-subj="createNewCaseButton"
              >
                {i18n.translate('xpack.securitySolution.siemReadiness.continuity.createCase', {
                  defaultMessage: 'Create new case',
                })}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <CategoryAccordionTable
        categories={categorizedPipelines}
        columns={columns}
        renderExtraAction={renderExtraAction}
        filterField="status"
        defaultFilterValue="all"
        filterOptions={[
          {
            value: 'all',
            label: i18n.translate('xpack.securitySolution.siemReadiness.continuity.filter.all', {
              defaultMessage: 'All',
            }),
          },
          {
            value: 'healthy',
            label: i18n.translate(
              'xpack.securitySolution.siemReadiness.continuity.filter.healthy',
              {
                defaultMessage: 'Healthy',
              }
            ),
          },
          {
            value: 'critical',
            label: i18n.translate(
              'xpack.securitySolution.siemReadiness.continuity.filter.criticalFailureRate',
              {
                defaultMessage: 'Critical failure rate',
              }
            ),
          },
        ]}
        searchField="name"
        searchPlaceholder={i18n.translate(
          'xpack.securitySolution.siemReadiness.continuity.searchPlaceholder',
          { defaultMessage: 'Search pipelines...' }
        )}
        itemName={i18n.translate('xpack.securitySolution.siemReadiness.continuity.itemName', {
          defaultMessage: 'pipelines',
        })}
        defaultSortField="docsCount"
        defaultSortDirection="desc"
        storageKey={SIEM_READINESS_ACCORDIONS_STORAGE_KEY}
        isFilterActive={activeCategories.length < CATEGORY_ORDER.length && hasUnfilteredData}
        hasUnfilteredData={hasUnfilteredData}
      />
    </>
  );
};

ContinuityTab.displayName = 'ContinuityTab';
