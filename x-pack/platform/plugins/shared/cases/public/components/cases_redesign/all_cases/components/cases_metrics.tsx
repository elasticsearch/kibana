/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiLoadingSpinner,
  EuiPanel,
  EuiStat,
  useEuiTheme,
} from '@elastic/eui';
import prettyMilliseconds from 'pretty-ms';
import { CaseStatuses } from '../../../../../common/types/domain';
import { StatusStats } from '../../../status/status_stats';
import { useGetCasesMetrics } from '../../../../containers/use_get_cases_metrics';
import { ATTC_DESCRIPTION, ATTC_STAT, ATTC_STAT_INFO_ARIA_LABEL } from '../translations';

const PRETTY_MS_OPTIONS = { compact: true, verbose: false } as const;
const MTTR_MULTIPLIER = 1000;

const CasesMetricsComponent: React.FC = () => {
  const { euiTheme } = useEuiTheme();
  const { data: { mttr, status } = { mttr: 0 }, isLoading: isCasesMetricsLoading } =
    useGetCasesMetrics();

  const mttrValue = useMemo(
    () => (mttr != null ? prettyMilliseconds(mttr * MTTR_MULTIPLIER, PRETTY_MS_OPTIONS) : '-'),
    [mttr]
  );

  const panelStyles = useMemo(
    () => css`
      border-radius: ${euiTheme.border.radius.medium};
    `,
    [euiTheme.border.radius.medium]
  );

  return (
    <EuiPanel hasBorder paddingSize="m" grow={false} css={panelStyles}>
      <EuiFlexGroup responsive={true} data-test-subj="cases-metrics-stats">
        <EuiFlexItem grow={true}>
          <StatusStats
            dataTestSubj="openStatsHeader"
            caseCount={status?.open ?? 0}
            caseStatus={CaseStatuses.open}
            isLoading={isCasesMetricsLoading}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={true}>
          <StatusStats
            dataTestSubj="inProgressStatsHeader"
            caseCount={status?.inProgress ?? 0}
            caseStatus={CaseStatuses['in-progress']}
            isLoading={isCasesMetricsLoading}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={true}>
          <StatusStats
            dataTestSubj="closedStatsHeader"
            caseCount={status?.closed ?? 0}
            caseStatus={CaseStatuses.closed}
            isLoading={isCasesMetricsLoading}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={true}>
          <EuiStat
            data-test-subj={'mttrStatsHeader'}
            description={
              <>
                {ATTC_STAT}
                &nbsp;
                <EuiIconTip
                  content={ATTC_DESCRIPTION}
                  position="right"
                  aria-label={ATTC_STAT_INFO_ARIA_LABEL}
                />
              </>
            }
            title={
              isCasesMetricsLoading ? (
                <EuiLoadingSpinner data-test-subj={`mttr-stat-loading-spinner`} />
              ) : (
                mttrValue
              )
            }
            titleSize="xs"
            text-align="left"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
CasesMetricsComponent.displayName = 'CasesMetrics';

export const CasesMetrics = React.memo(CasesMetricsComponent);
