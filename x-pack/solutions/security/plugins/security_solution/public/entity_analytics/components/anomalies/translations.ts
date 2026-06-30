/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const ENTITY_ANOMALIES_SECTION_TITLE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.sectionTitle',
  { defaultMessage: 'Behavioral anomalies' }
);

export const ENTITY_ANOMALIES_OVERVIEW_TIMEFRAME = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.timeframeLabel',
  { defaultMessage: 'Last 30 days' }
);

export const ENTITY_ANOMALIES_ALL_LINK_TITLE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.allAnomaliesLink',
  { defaultMessage: 'All anomalies' }
);

export const ENTITY_ANOMALIES_ALL_LINK_TOOLTIP = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.allAnomaliesTooltip',
  { defaultMessage: 'Show all behavioral anomalies' }
);

export const ENTITY_ANOMALIES_RECENT_TABLE_TITLE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.recentTableTitle',
  { defaultMessage: 'Recent anomalies' }
);

export const getEntityAnomaliesCountLabel = (count: number) =>
  i18n.translate(
    'xpack.securitySolution.entityAnalytics.entityAnomalies.overview.anomaliesCountLabel',
    {
      defaultMessage: '{count, plural, one {Anomaly} other {Anomalies}}',
      values: { count },
    }
  );

export const ENTITY_ANOMALIES_SWIMLANE_MAX_SCORE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.overview.swimlane.maxAnomalyScore',
  { defaultMessage: 'Max anomaly score' }
);

export const ENTITY_ANOMALIES_SWIMLANE_X_AXIS_LABEL = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.overview.swimlane.xAxis',
  { defaultMessage: 'Date' }
);

export const ENTITY_ANOMALIES_TAB_MANAGE_ML_JOBS = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.manageMlJobs',
  { defaultMessage: 'Manage ML jobs' }
);

export const ENTITY_ANOMALIES_TAB_ATTACK_CHAIN_TITLE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.attackChainTitle',
  { defaultMessage: 'Attack chain' }
);

export const ENTITY_ANOMALY_TIMELINE_TITLE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTimelineTitle',
  { defaultMessage: 'Anomaly timeline' }
);

export const ENTITY_ANOMALY_TABLE_TITLE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTableTitle',
  { defaultMessage: 'Anomalies' }
);

export const ENTITY_ANOMALY_TABLE_CAPTION = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTableCaption',
  { defaultMessage: 'Anomaly records' }
);

export const ENTITY_ANOMALY_TABLE_EXPAND_ROW_TOOLTIP = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.expandRowTooltip',
  { defaultMessage: 'Expand row' }
);

export const ENTITY_ANOMALY_TABLE_COLLAPSE_ROW_TOOLTIP = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.collapseRowTooltip',
  { defaultMessage: 'Collapse row' }
);

export const ENTITY_ANOMALY_TABLE_JOB_COLUMN = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.jobColumn',
  { defaultMessage: 'ML job' }
);

export const ENTITY_ANOMALY_TABLE_TACTIC_COLUMN = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.tacticColumn',
  { defaultMessage: 'Tactic' }
);

export const ENTITY_ANOMALY_TABLE_TACTIC_POPOVER_TITLE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.tacticPopoverTitle',
  { defaultMessage: 'Tactics' }
);

export const ENTITY_ANOMALY_TABLE_TIMESTAMP_COLUMN = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.timestampColumn',
  { defaultMessage: 'Timestamp' }
);

export const ENTITY_ANOMALY_TABLE_BASELINE_COLUMN = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.baselineColumn',
  { defaultMessage: 'Baseline' }
);

export const ENTITY_ANOMALY_TABLE_ANOMALY_COLUMN = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.anomalyColumn',
  { defaultMessage: 'Anomaly' }
);

export const ENTITY_ANOMALY_TABLE_SCORE_COLUMN = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.scoreColumn',
  { defaultMessage: 'Anomaly score' }
);

export const ENTITY_ANOMALY_TABLE_SCORE_COLUMN_TOOLTIP = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.scoreColumnTooltip',
  {
    defaultMessage:
      'A normalized score between 0–100, which indicates the relative significance of the anomaly record results.',
  }
);

export const ENTITY_ANOMALY_TABLE_EXPANDED_ROW_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.expanded.description',
  { defaultMessage: 'Explainer' }
);

export const ENTITY_ANOMALY_TABLE_EXPANDED_ROW_COUNT = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.expanded.count',
  { defaultMessage: 'Count of anomalous events' }
);

export const ENTITY_ANOMALY_TABLE_EXPANDED_ROW_KEY_FIELDS = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.anomalyTable.expanded.keyFields',
  { defaultMessage: 'Key fields' }
);

export const ENTITY_ANOMALY_DATE_RANGE_LAST_15_MINUTES = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.dateRangePicker.last15MinutesLabel',
  { defaultMessage: 'Last 15 minutes' }
);

export const ENTITY_ANOMALY_DATE_RANGE_LAST_30_MINUTES = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.dateRangePicker.last30MinutesLabel',
  { defaultMessage: 'Last 30 minutes' }
);

export const ENTITY_ANOMALY_DATE_RANGE_LAST_1_HOUR = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.dateRangePicker.last1HourLabel',
  { defaultMessage: 'Last 1 hour' }
);

export const ENTITY_ANOMALY_DATE_RANGE_LAST_24_HOURS = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.dateRangePicker.last24HoursLabel',
  { defaultMessage: 'Last 24 hours' }
);

export const ENTITY_ANOMALY_DATE_RANGE_LAST_7_DAYS = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.dateRangePicker.last7DaysLabel',
  { defaultMessage: 'Last 7 days' }
);

export const ENTITY_ANOMALY_DATE_RANGE_LAST_30_DAYS = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.dateRangePicker.last30DaysLabel',
  { defaultMessage: 'Last 30 days' }
);

export const ENTITY_ANOMALY_DATE_RANGE_LAST_90_DAYS = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.dateRangePicker.last90DaysLabel',
  { defaultMessage: 'Last 90 days' }
);

export const ENTITY_ANOMALY_DATE_RANGE_LAST_1_YEAR = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.dateRangePicker.last1YearLabel',
  { defaultMessage: 'Last 1 year' }
);

export const ENTITY_ANOMALY_DATE_RANGE_TOO_OLD_ERROR = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entityAnomalies.tab.dateRangeTooOld',
  {
    defaultMessage:
      'Anomaly data is only available for the past year. Select a more recent start date.',
  }
);
