/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import moment from 'moment';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiHorizontalRule,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { Chart, BarSeries, Settings, ScaleType } from '@elastic/charts';
import { SecurityPageName } from '@kbn/security-solution-navigation';
import { AssistantIcon } from '@kbn/ai-assistant-icon';
import { useElasticChartsTheme } from '@kbn/charts-theme';
import { css } from '@emotion/react';
import type { DashboardMigrationTranslationStats } from '../../../../../common/siem_migrations/model/dashboard_migration.gen';
import { PanelText } from '../../../../common/components/panel_text';
import { convertTranslationResultIntoText, useResultVisColors } from '../../../common/utils';
import { useGetMigrationTranslationStats } from '../../logic/use_get_migration_translation_stats';
import { CenteredLoadingSpinner } from '../../../../common/components/centered_loading_spinner';
import { SecuritySolutionLinkButton } from '../../../../common/components/links';
import type { DashboardMigrationStats } from '../../types';
import { MigrationTranslationResult } from '../../../../../common/siem_migrations/constants';
import * as i18n from './translations';
import { DashboardMigrationsUploadMissingPanel } from './upload_missing_panel';
import { MigrationsLastError } from '../../../common/components/migration_panels/last_error';
import { MigrationPanelTitle } from '../../../common/components/migration_panels/migration_title';
import { useCompleteBadgeStyles } from '../../../common/hooks/use_complete_status_badge_styles';
import { TotalExecutionTime } from '../../../common/components/total_execution_time';

const headerStyle = css`
  &:hover {
    cursor: pointer;
    text-decoration: underline;
  }
`;

export interface DashboardMigrationResultPanelProps {
  migrationStats: DashboardMigrationStats;
  isCollapsed: boolean;
  onToggleCollapsed: (isCollapsed: boolean) => void;
}

export const DashboardMigrationResultPanel = React.memo<DashboardMigrationResultPanelProps>(
  ({ migrationStats, isCollapsed = false, onToggleCollapsed }) => {
    const { data: translationStats, isLoading: isLoadingTranslationStats } =
      useGetMigrationTranslationStats(migrationStats.id);

    const completeBadgeStyles = useCompleteBadgeStyles();

    const toggleCollapsed = useCallback(() => {
      onToggleCollapsed(!isCollapsed);
    }, [isCollapsed, onToggleCollapsed]);

    return (
      <EuiPanel hasShadow={false} hasBorder paddingSize="none">
        <EuiPanel hasShadow={false} hasBorder={false} paddingSize="m">
          <EuiFlexGroup direction="row" alignItems="center" gutterSize="s">
            <EuiFlexItem onClick={toggleCollapsed} css={headerStyle}>
              <EuiFlexGroup direction="column" alignItems="flexStart" gutterSize="xs">
                <EuiFlexItem grow={false}>
                  <MigrationPanelTitle migrationStats={migrationStats} migrationType="dashboard" />
                </EuiFlexItem>
                <EuiFlexItem>
                  <PanelText size="s" subdued data-test-subj="migrationPanelDescription">
                    <p>
                      {i18n.DASHBOARD_MIGRATION_COMPLETE_DESCRIPTION(
                        moment(migrationStats.created_at).format('MMMM Do YYYY, h:mm:ss a'),
                        moment(migrationStats.last_updated_at).fromNow()
                      )}
                    </p>
                    {migrationStats.last_execution?.total_execution_time_ms && (
                      <TotalExecutionTime
                        migrationType="dashboard"
                        milliseconds={migrationStats.last_execution.total_execution_time_ms}
                      />
                    )}
                  </PanelText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge css={completeBadgeStyles} data-test-subj="migrationCompleteBadge">
                {i18n.DASHBOARD_MIGRATION_COMPLETE_BADGE}
              </EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={
                  isCollapsed ? i18n.DASHBOARD_MIGRATION_EXPAND : i18n.DASHBOARD_MIGRATION_COLLAPSE
                }
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  iconType={isCollapsed ? 'chevronSingleDown' : 'chevronSingleUp'}
                  onClick={toggleCollapsed}
                  aria-label={
                    isCollapsed
                      ? i18n.DASHBOARD_MIGRATION_EXPAND
                      : i18n.DASHBOARD_MIGRATION_COLLAPSE
                  }
                  data-test-subj="collapseButton"
                />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
        <EuiAccordion
          id={migrationStats.id}
          initialIsOpen={!isCollapsed}
          forceState={isCollapsed ? 'closed' : 'open'}
          arrowDisplay={'none'}
        >
          <EuiHorizontalRule margin="none" />
          <EuiPanel hasShadow={false} hasBorder={false} paddingSize="m">
            {migrationStats.last_execution?.error && (
              <>
                <MigrationsLastError
                  message={migrationStats.last_execution.error}
                  migrationType="dashboard"
                />
                <EuiSpacer size="m" />
              </>
            )}
            <EuiFlexGroup direction="column" alignItems="stretch" gutterSize="m">
              <EuiFlexItem grow={false}>
                <EuiFlexGroup direction="row" alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiIcon type={AssistantIcon} size="m" aria-hidden={true} />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <PanelText size="s" semiBold>
                      <p>{i18n.DASHBOARD_MIGRATION_SUMMARY_TITLE}</p>
                    </PanelText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel hasShadow={false} hasBorder paddingSize="m">
                  <EuiFlexGroup direction="column" alignItems="stretch" justifyContent="center">
                    <EuiFlexItem>
                      {isLoadingTranslationStats ? (
                        <CenteredLoadingSpinner />
                      ) : (
                        translationStats && (
                          <>
                            <EuiText size="m" css={{ textAlign: 'center' }}>
                              <b>{i18n.DASHBOARD_MIGRATION_SUMMARY_CHART_TITLE}</b>
                            </EuiText>
                            <TranslationResultsChart translationStats={translationStats} />
                            <TranslationResultsTable translationStats={translationStats} />
                          </>
                        )
                      )}
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup direction="column" alignItems="center">
                        <EuiFlexItem>
                          <SecuritySolutionLinkButton
                            deepLinkId={SecurityPageName.siemMigrationsDashboards}
                            path={migrationStats.id}
                            data-test-subj="viewDashboardsButton"
                          >
                            {i18n.DASHBOARD_MIGRATION_VIEW_TRANSLATED_DASHBOARDS_BUTTON}
                          </SecuritySolutionLinkButton>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>
            <DashboardMigrationsUploadMissingPanel
              migrationStats={migrationStats}
              topSpacerSize="s"
            />
          </EuiPanel>
        </EuiAccordion>
      </EuiPanel>
    );
  }
);
DashboardMigrationResultPanel.displayName = 'MigrationResultPanel';

const TranslationResultsChart = React.memo<{
  translationStats: DashboardMigrationTranslationStats;
}>(({ translationStats }) => {
  const baseTheme = useElasticChartsTheme();
  const translationResultColors = useResultVisColors();
  const data = [
    {
      category: i18n.DASHBOARD_MIGRATION_TABLE_COLUMN_STATUS,
      type: convertTranslationResultIntoText(MigrationTranslationResult.FULL),
      value: translationStats.dashboards.success.result.full,
    },
    {
      category: i18n.DASHBOARD_MIGRATION_TABLE_COLUMN_STATUS,
      type: convertTranslationResultIntoText(MigrationTranslationResult.PARTIAL),
      value: translationStats.dashboards.success.result.partial,
    },
    {
      category: i18n.DASHBOARD_MIGRATION_TABLE_COLUMN_STATUS,
      type: convertTranslationResultIntoText(MigrationTranslationResult.UNTRANSLATABLE),
      value: translationStats.dashboards.success.result.untranslatable,
    },
    {
      category: i18n.DASHBOARD_MIGRATION_TABLE_COLUMN_STATUS,
      type: i18n.DASHBOARD_MIGRATION_TRANSLATION_FAILED,
      value: translationStats.dashboards.failed,
    },
  ];

  const colors = [
    translationResultColors[MigrationTranslationResult.FULL],
    translationResultColors[MigrationTranslationResult.PARTIAL],
    translationResultColors[MigrationTranslationResult.UNTRANSLATABLE],
    translationResultColors.error,
  ];

  return (
    <Chart size={{ height: 130 }} data-test-subj="translationResultsChart">
      <Settings showLegend={false} rotation={90} baseTheme={baseTheme} />
      <BarSeries
        id="results"
        name={i18n.DASHBOARD_MIGRATION_TABLE_COLUMN_STATUS}
        data={data}
        xAccessor="category"
        yAccessors={['value']}
        splitSeriesAccessors={['type']}
        stackAccessors={['category']}
        xScaleType={ScaleType.Ordinal}
        yScaleType={ScaleType.Linear}
        color={colors}
      />
    </Chart>
  );
});
TranslationResultsChart.displayName = 'TranslationResultsChart';

interface TranslationResultsTableItem {
  title: string;
  value: number;
  color: string;
}

const columns: Array<EuiBasicTableColumn<TranslationResultsTableItem>> = [
  {
    field: 'title',
    name: i18n.DASHBOARD_MIGRATION_TABLE_COLUMN_STATUS,
    render: (title: string, { color }) => (
      <EuiHealth color={color} textSize="xs">
        <span data-test-subj={`translationStatus-${title}`}>{title} </span>
      </EuiHealth>
    ),
  },
  {
    field: 'value',
    name: i18n.DASHBOARD_MIGRATION_TABLE_COLUMN_DASHBOARDS,
    align: 'right',
    render: (value: string, { title }) => (
      <EuiText size="xs" data-test-subj={`translationStatusCount-${title}`}>
        {value}
      </EuiText>
    ),
  },
];

const TranslationResultsTable = React.memo<{
  translationStats: DashboardMigrationTranslationStats;
}>(({ translationStats }) => {
  const translationResultColors = useResultVisColors();
  const items = useMemo<TranslationResultsTableItem[]>(
    () => [
      {
        title: convertTranslationResultIntoText(MigrationTranslationResult.FULL),
        value: translationStats.dashboards.success.result.full,
        color: translationResultColors[MigrationTranslationResult.FULL],
      },
      {
        title: convertTranslationResultIntoText(MigrationTranslationResult.PARTIAL),
        value: translationStats.dashboards.success.result.partial,
        color: translationResultColors[MigrationTranslationResult.PARTIAL],
      },
      {
        title: convertTranslationResultIntoText(MigrationTranslationResult.UNTRANSLATABLE),
        value: translationStats.dashboards.success.result.untranslatable,
        color: translationResultColors[MigrationTranslationResult.UNTRANSLATABLE],
      },
      {
        title: i18n.DASHBOARD_MIGRATION_TRANSLATION_FAILED,
        value: translationStats.dashboards.failed,
        color: translationResultColors.error,
      },
    ],
    [translationStats, translationResultColors]
  );

  return (
    <EuiBasicTable
      data-test-subj="translatedResultsTable"
      items={items}
      columns={columns}
      compressed
      tableCaption={i18n.DASHBOARD_MIGRATION_SUMMARY_TITLE}
    />
  );
});
TranslationResultsTable.displayName = 'TranslationResultsTable';
