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
  useEuiTheme,
} from '@elastic/eui';
import { Chart, BarSeries, Settings, ScaleType } from '@elastic/charts';
import { useKibanaIsDarkMode } from '@kbn/react-kibana-context-theme';
import { SecurityPageName } from '@kbn/security-solution-navigation';
import { AssistantIcon } from '@kbn/ai-assistant-icon';
import { useElasticChartsTheme } from '@kbn/charts-theme';
import { css } from '@emotion/react';
import { PanelText } from '../../../../common/components/panel_text';
import { convertTranslationResultIntoText, useResultVisColors } from '../../../common/utils';
import type { RuleMigrationTranslationStats } from '../../../../../common/siem_migrations/model/rule_migration.gen';
import { useGetMigrationTranslationStats } from '../../logic/use_get_migration_translation_stats';
import { CenteredLoadingSpinner } from '../../../../common/components/centered_loading_spinner';
import { SecuritySolutionLinkButton } from '../../../../common/components/links';
import type { RuleMigrationStats } from '../../types';
import { MigrationTranslationResult } from '../../../../../common/siem_migrations/constants';
import * as i18n from './translations';
import { RuleMigrationsUploadMissingPanel } from './upload_missing_panel';
import { MigrationsLastError } from '../../../common/components/migration_panels/last_error';
import { MigrationPanelTitle } from '../../../common/components/migration_panels/migration_title';
import { TotalExecutionTime } from '../../../common/components/total_execution_time';

const headerStyle = css`
  &:hover {
    cursor: pointer;
    text-decoration: underline;
  }
`;

const useCompleteBadgeStyles = () => {
  const { euiTheme } = useEuiTheme();
  const isDarkMode = useKibanaIsDarkMode();
  return css`
    background-color: ${isDarkMode
      ? euiTheme.colors.success
      : euiTheme.colors.backgroundBaseSuccess};
    color: ${isDarkMode ? euiTheme.colors.plainDark : euiTheme.colors.textSuccess};
    text-decoration: none;
  `;
};

export interface RuleMigrationResultPanelProps {
  migrationStats: RuleMigrationStats;
  isCollapsed: boolean;
  onToggleCollapsed: (isCollapsed: boolean) => void;
}

export const RuleMigrationResultPanel = React.memo<RuleMigrationResultPanelProps>(
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
                  <MigrationPanelTitle migrationStats={migrationStats} migrationType="rule" />
                </EuiFlexItem>
                <EuiFlexItem>
                  <PanelText size="s" subdued>
                    <p>
                      {i18n.RULE_MIGRATION_COMPLETE_DESCRIPTION(
                        moment(migrationStats.created_at).format('MMMM Do YYYY, h:mm:ss a'),
                        moment(migrationStats.last_updated_at).fromNow()
                      )}
                    </p>
                    {migrationStats.last_execution?.total_execution_time_ms && (
                      <TotalExecutionTime
                        migrationType="rule"
                        milliseconds={migrationStats.last_execution.total_execution_time_ms}
                      />
                    )}
                  </PanelText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge css={completeBadgeStyles}>{i18n.RULE_MIGRATION_COMPLETE_BADGE}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={isCollapsed ? i18n.RULE_MIGRATION_EXPAND : i18n.RULE_MIGRATION_COLLAPSE}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  iconType={isCollapsed ? 'chevronSingleDown' : 'chevronSingleUp'}
                  onClick={toggleCollapsed}
                  aria-label={
                    isCollapsed ? i18n.RULE_MIGRATION_EXPAND : i18n.RULE_MIGRATION_COLLAPSE
                  }
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
                  migrationType="rule"
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
                      <p>{i18n.RULE_MIGRATION_SUMMARY_TITLE}</p>
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
                              <b>{i18n.RULE_MIGRATION_SUMMARY_CHART_TITLE}</b>
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
                            deepLinkId={SecurityPageName.siemMigrationsRules}
                            path={migrationStats.id}
                          >
                            {i18n.RULE_MIGRATION_VIEW_TRANSLATED_RULES_BUTTON}
                          </SecuritySolutionLinkButton>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>
            <RuleMigrationsUploadMissingPanel migrationStats={migrationStats} topSpacerSize="s" />
          </EuiPanel>
        </EuiAccordion>
      </EuiPanel>
    );
  }
);
RuleMigrationResultPanel.displayName = 'MigrationResultPanel';

const TranslationResultsChart = React.memo<{
  translationStats: RuleMigrationTranslationStats;
}>(({ translationStats }) => {
  const baseTheme = useElasticChartsTheme();
  const translationResultColors = useResultVisColors();
  const data = [
    {
      category: i18n.RULE_MIGRATION_TABLE_COLUMN_STATUS,
      type: convertTranslationResultIntoText(MigrationTranslationResult.FULL),
      value: translationStats.rules.success.result.full,
    },
    {
      category: i18n.RULE_MIGRATION_TABLE_COLUMN_STATUS,
      type: convertTranslationResultIntoText(MigrationTranslationResult.PARTIAL),
      value: translationStats.rules.success.result.partial,
    },
    {
      category: i18n.RULE_MIGRATION_TABLE_COLUMN_STATUS,
      type: convertTranslationResultIntoText(MigrationTranslationResult.UNTRANSLATABLE),
      value: translationStats.rules.success.result.untranslatable,
    },
    {
      category: i18n.RULE_MIGRATION_TABLE_COLUMN_STATUS,
      type: i18n.RULE_MIGRATION_TRANSLATION_FAILED,
      value: translationStats.rules.failed,
    },
  ];

  const colors = [
    translationResultColors[MigrationTranslationResult.FULL],
    translationResultColors[MigrationTranslationResult.PARTIAL],
    translationResultColors[MigrationTranslationResult.UNTRANSLATABLE],
    translationResultColors.error,
  ];

  return (
    <Chart size={{ height: 130 }}>
      <Settings showLegend={false} rotation={90} baseTheme={baseTheme} />
      <BarSeries
        id="results"
        name={i18n.RULE_MIGRATION_TABLE_COLUMN_STATUS}
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
    name: i18n.RULE_MIGRATION_TABLE_COLUMN_STATUS,
    render: (title: string, { color }) => (
      <EuiHealth color={color} textSize="xs">
        <span data-test-subj={`translationStatus-${title}`}>{title} </span>
      </EuiHealth>
    ),
  },
  {
    field: 'value',
    name: i18n.RULE_MIGRATION_TABLE_COLUMN_RULES,
    align: 'right',
    render: (value: string, { title }) => (
      <EuiText size="xs" data-test-subj={`translationStatusCount-${title}`}>
        {value}
      </EuiText>
    ),
  },
];

const TranslationResultsTable = React.memo<{
  translationStats: RuleMigrationTranslationStats;
}>(({ translationStats }) => {
  const translationResultColors = useResultVisColors();
  const items = useMemo<TranslationResultsTableItem[]>(
    () => [
      {
        title: convertTranslationResultIntoText(MigrationTranslationResult.FULL),
        value: translationStats.rules.success.result.full,
        color: translationResultColors[MigrationTranslationResult.FULL],
      },
      {
        title: convertTranslationResultIntoText(MigrationTranslationResult.PARTIAL),
        value: translationStats.rules.success.result.partial,
        color: translationResultColors[MigrationTranslationResult.PARTIAL],
      },
      {
        title: convertTranslationResultIntoText(MigrationTranslationResult.UNTRANSLATABLE),
        value: translationStats.rules.success.result.untranslatable,
        color: translationResultColors[MigrationTranslationResult.UNTRANSLATABLE],
      },
      {
        title: i18n.RULE_MIGRATION_TRANSLATION_FAILED,
        value: translationStats.rules.failed,
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
      tableCaption={i18n.RULE_MIGRATION_SUMMARY_TITLE}
      compressed
    />
  );
});
TranslationResultsTable.displayName = 'TranslationResultsTable';
