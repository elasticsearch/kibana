/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiTitle } from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { DataView } from '@kbn/data-views-plugin/public';
import { RiskSeverity, EMPTY_SEVERITY_COUNT } from '../../../../common/search_strategy';
import { useSpaceId } from '../../../common/hooks/use_space_id';
import { RiskScoreDonutChart } from '../risk_score_donut_chart';
import { ENTITY_RISK_LEVEL_FIELD, RiskLevelBreakdownTable } from './risk_level_breakdown_table';
import { useKibana } from '../../../common/lib/kibana';
import { useRiskLevelsEsqlQuery } from '../watchlists/components/hooks/use_risk_levels_esql_query';
import { esqlRecordsToSeverityCount, type EsqlSeverityRecord } from '../../common/utils';
import { useGlobalTime } from '../../../common/containers/use_global_time';
import { useQueryInspector } from '../../../common/components/page/manage_query';
import { InspectButton, InspectButtonContainer } from '../../../common/components/inspect';

const ENTITY_RISK_LEVEL_QUERY_ID = 'entity-risk-level-query';

interface DynamicRiskLevelPanelProps {
  watchlistId?: string;
  /**
   * The ad-hoc entity store data view used to resolve the field spec for
   * `entity.risk.calculated_level` when rendering inline cell actions.
   */
  entityDataView?: DataView;
}

export const DynamicRiskLevelPanel: React.FC<DynamicRiskLevelPanelProps> = ({
  watchlistId,
  entityDataView,
}) => {
  const spaceId = useSpaceId();
  const { filterManager } = useKibana().services.data.query;
  const { setQuery, deleteQuery } = useGlobalTime();

  const riskLevelsStats = useRiskLevelsEsqlQuery({
    watchlistId: watchlistId ?? '',
    skip: false,
    spaceId: spaceId ?? '',
    // The Entity Analytics home page intentionally hides the global date
    // picker, so risk levels are shown across the entire entities-latest
    // index to keep the chart aligned with the entities table below it.
    applyGlobalTimeFilter: false,
  });

  const severityCount = useMemo(
    () =>
      esqlRecordsToSeverityCount((riskLevelsStats.records ?? []) as EsqlSeverityRecord[]) ??
      EMPTY_SEVERITY_COUNT,
    [riskLevelsStats.records]
  );

  const loading = riskLevelsStats.isLoading;

  useQueryInspector({
    queryId: ENTITY_RISK_LEVEL_QUERY_ID,
    inspect: riskLevelsStats.inspect,
    loading,
    refetch: riskLevelsStats.refetch,
    setQuery,
    deleteQuery,
  });

  const handlePartitionClick = useCallback(
    (level: RiskSeverity) => {
      const filter =
        level === RiskSeverity.Unknown
          ? {
              meta: {
                alias: i18n.translate(
                  'xpack.securitySolution.entityAnalytics.dynamicRiskLevel.unknownFilterAlias',
                  { defaultMessage: 'Risk level: Unknown' }
                ),
                index: entityDataView?.id,
                key: ENTITY_RISK_LEVEL_FIELD,
                disabled: false,
                negate: false,
              },
              query: {
                bool: {
                  should: [
                    { match_phrase: { [ENTITY_RISK_LEVEL_FIELD]: level } },
                    { bool: { must_not: { exists: { field: ENTITY_RISK_LEVEL_FIELD } } } },
                  ],
                  minimum_should_match: 1,
                },
              },
            }
          : {
              meta: {
                alias: null,
                disabled: false,
                negate: false,
              },
              query: { match_phrase: { [ENTITY_RISK_LEVEL_FIELD]: level } },
            };
      filterManager.addFilters([filter]);
    },
    [filterManager, entityDataView?.id]
  );

  const title = i18n.translate(
    'xpack.securitySolution.entityAnalytics.dynamicRiskLevel.entityTitle',
    { defaultMessage: 'Entity risk levels' }
  );

  return (
    <InspectButtonContainer>
      <EuiFlexGroup direction="column" gutterSize="m" css={{ height: '100%' }}>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" css={{ minHeight: 40 }}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="s">
                <h3>{title}</h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <InspectButton queryId={ENTITY_RISK_LEVEL_QUERY_ID} title={title} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="none">
            <EuiFlexItem grow={3}>
              <RiskLevelBreakdownTable
                severityCount={severityCount}
                loading={loading}
                entityDataView={entityDataView}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={2}>
              <RiskScoreDonutChart
                showLegend={false}
                severityCount={severityCount}
                onPartitionClick={handlePartitionClick}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </InspectButtonContainer>
  );
};
