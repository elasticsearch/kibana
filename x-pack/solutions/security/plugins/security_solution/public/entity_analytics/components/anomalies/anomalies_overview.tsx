/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { css } from '@emotion/react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { getAbbreviatedNumber } from '@kbn/cloud-security-posture-common';
import type {
  AnomalyOverviewHit,
  GetAnomalyOverviewResponse,
} from '../../../../common/api/entity_analytics';
import type { EntityDetailsPath } from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import { EntityDetailsLeftPanelTab } from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import { ExpandablePanel } from '../../../flyout_v2/shared/components/expandable_panel';
import { MitreAttackChain } from './mitre/components/mitre_attack_chain';
import {
  ENTITY_ANOMALIES_ALL_LINK_TOOLTIP,
  ENTITY_ANOMALIES_ALL_LINK_TITLE,
  ENTITY_ANOMALIES_RECENT_TABLE_TITLE,
  getEntityAnomaliesCountLabel,
  ENTITY_ANOMALY_TABLE_JOB_COLUMN,
  ENTITY_ANOMALY_TABLE_TIMESTAMP_COLUMN,
  ENTITY_ANOMALY_TABLE_ANOMALY_COLUMN,
} from './translations';
import { AnomalyJobName } from './table/anomaly_job_name';
import { AnomalyTimestamp } from './table/anomaly_timestamp';
import { truncatedAnchorCss } from './table/constants';
import {
  ANOMALIES_SECTION_EXPANDABLE_PANEL_TEST_ID,
  ANOMALIES_RECENT_TABLE_TEST_ID,
} from './test_ids';

const RECENT_TABLE_OTHER_COLUMN_WIDTH = '35.71%';
const RECENT_TABLE_ANOMALY_COLUMN_WIDTH = '28.57%';

interface AnomaliesOverviewProps {
  data: GetAnomalyOverviewResponse;
  isPreviewMode?: boolean;
  openDetailsPanel: (path: EntityDetailsPath) => void;
}

export const AnomaliesOverview: React.FC<AnomaliesOverviewProps> = ({
  data,
  isPreviewMode,
  openDetailsPanel,
}) => {
  const { euiTheme } = useEuiTheme();

  const uniqueTactics = useMemo(() => Object.keys(data.tacticCounts), [data.tacticCounts]);
  const totalAnomaliesCount = data.totalAnomaliesCount;

  const goToAnomaliesTab = useCallback(
    () => openDetailsPanel({ tab: EntityDetailsLeftPanelTab.ANOMALIES }),
    [openDetailsPanel]
  );

  const recentAnomaliesColumns: Array<EuiBasicTableColumn<AnomalyOverviewHit>> = useMemo(
    () => [
      {
        name: ENTITY_ANOMALY_TABLE_JOB_COLUMN,
        field: 'jobName',
        width: RECENT_TABLE_OTHER_COLUMN_WIDTH,
        render: (_: string, item: AnomalyOverviewHit) => (
          <AnomalyJobName
            jobId={item.jobId}
            jobName={item.jobName ?? item.jobId}
            recordId={item.recordId}
            timeRange={{
              from: new Date(data.from).toISOString(),
              to: new Date(data.to).toISOString(),
            }}
          />
        ),
      },
      {
        name: ENTITY_ANOMALY_TABLE_TIMESTAMP_COLUMN,
        field: 'timestamp',
        width: RECENT_TABLE_OTHER_COLUMN_WIDTH,
        render: (timestamp: string) => <AnomalyTimestamp timestamp={timestamp} />,
      },
      {
        name: ENTITY_ANOMALY_TABLE_ANOMALY_COLUMN,
        width: RECENT_TABLE_ANOMALY_COLUMN_WIDTH,
        render: (item: AnomalyOverviewHit) => (
          <EuiToolTip content={item.anomalousValue} anchorProps={{ css: truncatedAnchorCss }}>
            <EuiText size="xs" component="span" tabIndex={0}>
              {item.anomalousValue}
            </EuiText>
          </EuiToolTip>
        ),
      },
    ],
    [data.from, data.to]
  );

  const link = useMemo(
    () => ({
      callback: goToAnomaliesTab,
      tooltip: ENTITY_ANOMALIES_ALL_LINK_TOOLTIP,
    }),
    [goToAnomaliesTab]
  );

  const statCellCss = css`
    min-width: 72px;
  `;

  return (
    <ExpandablePanel
      data-test-subj={ANOMALIES_SECTION_EXPANDABLE_PANEL_TEST_ID}
      header={{
        iconType: !isPreviewMode ? 'chevronLimitLeft' : undefined,
        title: (
          <EuiText
            size="xs"
            css={{
              fontWeight: euiTheme.font.weight.bold,
            }}
          >
            {ENTITY_ANOMALIES_ALL_LINK_TITLE}
          </EuiText>
        ),
        link,
      }}
    >
      <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false} css={statCellCss}>
          <EuiFlexGroup direction="column" gutterSize="none">
            <EuiFlexItem>
              <EuiTitle size="s">
                <h3>{getAbbreviatedNumber(totalAnomaliesCount)}</h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText
                size="xs"
                css={css`
                  font-weight: ${euiTheme.font.weight.semiBold};
                `}
              >
                {getEntityAnomaliesCountLabel(totalAnomaliesCount)}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem
          css={css`
            flex: 1;
            min-width: 0;
          `}
        >
          <MitreAttackChain
            triggeredTactics={uniqueTactics}
            anomalyCountByTactic={data.tacticCounts}
            showLabels={false}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiHorizontalRule margin="m" />
      <EuiTitle size="xxs">
        <h4>{ENTITY_ANOMALIES_RECENT_TABLE_TITLE}</h4>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiBasicTable
        tableCaption={ENTITY_ANOMALIES_RECENT_TABLE_TITLE}
        data-test-subj={ANOMALIES_RECENT_TABLE_TEST_ID}
        items={data.recentAnomalies}
        columns={recentAnomaliesColumns}
        compressed
      />
    </ExpandablePanel>
  );
};
