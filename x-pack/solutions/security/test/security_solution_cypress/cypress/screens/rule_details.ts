/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const POPOVER_ACTIONS_TRIGGER_BUTTON =
  '[data-test-subj="rules-details-popover-button-icon"]';

export const EXPORT_RULE_ACTION_BUTTON = '[data-test-subj="rules-details-export-rule"]';

export const ABOUT_INVESTIGATION_NOTES = '[data-test-subj="stepAboutDetailsNoteContent"]';

export const ABOUT_RULE_DESCRIPTION = '[data-test-subj=stepAboutRuleDetailsToggleDescriptionText]';

export const ABOUT_DETAILS =
  '[data-test-subj="aboutRule"] [data-test-subj="listItemColumnStepRuleDescription"]';

export const ADDITIONAL_LOOK_BACK_DETAILS = 'Additional look-back time';

export const INTERVAL_ABBR_VALUE = '[data-test-subj="interval-abbr-value"]';

export const ALERTS_TAB = '[data-test-subj="navigation-alerts"]';

export const CUSTOM_QUERY_DETAILS = 'Custom query';

export const ESQL_QUERY_DETAILS = 'ES|QL query';

export const SAVED_QUERY_NAME_DETAILS = 'Saved query name';

export const SAVED_QUERY_DETAILS = /^Saved query$/;

export const DATA_VIEW_DETAILS = 'Data view';

export const DEFINITION_DETAILS =
  '[data-test-subj=definitionRule] [data-test-subj="listItemColumnStepRuleDescription"]';

export const DETAILS_DESCRIPTION = '.euiDescriptionList__description';

export const DETAILS_TITLE = '.euiDescriptionList__title';

export const EXCEPTIONS_TAB = 'a[data-test-subj="navigation-rule_exceptions"]';

export const EXCEPTIONS_TAB_EXPIRED_FILTER = '[data-test-subj="expired"]';

export const EXCEPTIONS_TAB_ACTIVE_FILTER = '[data-test-subj="active"]';

export const FALSE_POSITIVES_DETAILS = 'False positive examples';

export const INDEX_PATTERNS_DETAILS = 'Index patterns';

export const INVESTIGATION_FIELDS_DETAILS = 'Custom highlighted fields';

export const INDICATOR_INDEX_PATTERNS = 'Indicator index patterns';

export const INDICATOR_INDEX_QUERY = 'Indicator index query';

export const INDICATOR_MAPPING = 'Indicator mapping';

export const INTEGRATION_LINK = '[data-test-subj="integrationLink"]';

export const INTEGRATION_STATUS = '[data-test-subj="statusBadge"]';

export const INVESTIGATION_NOTES_MARKDOWN = 'test markdown';

export const INVESTIGATION_NOTES_TOGGLE = '[data-test-subj="stepAboutDetailsToggle-notes"]';

export const MITRE_ATTACK_DETAILS = 'MITRE ATT&CK';

export const FIELDS_BROWSER_BTN =
  '[data-test-subj="alertsTableIsLoaded"] [data-test-subj="show-field-browser"]';

export const LAST_EXECUTION_STATUS_REFRESH_BUTTON =
  '[data-test-subj="ruleLastExecutionStatusRefreshButton"]';

export const RULE_NAME_HEADER = '[data-test-subj="header-page-title"]';

export const RULE_NAME_OVERRIDE_DETAILS = 'Rule name override';

export const RISK_SCORE_DETAILS = 'Risk score';

export const INDICATOR_PREFIX_OVERRIDE = 'Indicator prefix override';

export const REFERENCE_URLS_DETAILS = 'Reference URLs';

export const EXCEPTION_ITEM_ACTIONS_BUTTON =
  'button[data-test-subj="exceptionItemCardHeader-actionButton"]';

export const REMOVE_EXCEPTION_BTN = '[data-test-subj="exceptionItemCardHeader-actionItem-delete"]';

export const EDIT_EXCEPTION_BTN = '[data-test-subj="exceptionItemCardHeader-actionItem-edit"]';

export const RULE_SWITCH = '[data-test-subj="ruleSwitch"]';

export const RULE_TYPE_DETAILS = 'Rule type';

export const RUNS_EVERY_DETAILS = 'Runs every';

export const SCHEDULE_DETAILS =
  '[data-test-subj=schedule] [data-test-subj="listItemColumnStepRuleDescription"]';

export const SEVERITY_DETAILS = 'Severity';

export const TAGS_DETAILS = 'Tags';

export const TIMELINE_TEMPLATE_DETAILS = 'Timeline template';

export const SUPPRESS_BY_DETAILS = 'Suppress alerts by';

export const SUPPRESS_FOR_DETAILS = 'Suppress alerts for';

export const SUPPRESS_MISSING_FIELD = 'If a suppression field is missing';

export const TIMELINE_FIELD = (field: string) => {
  return `[data-test-subj="formatted-field-${field}"]`;
};

export const removeExternalLinkText = (str: string) =>
  str.replace(/\([^)]*(opens in a new tab or window)[^)]*\)/g, '');

export const DEFINE_RULE_PANEL_PROGRESS =
  '[data-test-subj="defineRule"] [data-test-subj="stepPanelProgress"]';

export const EDIT_RULE_SETTINGS_LINK = '[data-test-subj="editRuleSettingsLink"]';

export const THREAT_TACTIC = '[data-test-subj="threatTacticLink"]';

export const THREAT_TECHNIQUE = '[data-test-subj="threatTechniqueLink"]';

export const THREAT_SUBTECHNIQUE = '[data-test-subj="threatSubtechniqueLink"]';

export const ALERT_SUPPRESSION_INSUFFICIENT_LICENSING_ICON =
  '[data-test-subj="alertSuppressionInsufficientLicensingIcon"]';

export const HIGHLIGHTED_ROWS_IN_TABLE =
  '[data-test-subj="euiDataGridBody"] .alertsTableHighlightedRow';

export const ADDITIONAL_FILTERS_BUTTON = '[data-test-subj="additionalFilters-popover"]';

export const SHOW_BUILDING_BLOCK_ALERTS_CHECKBOX =
  '[data-test-subj="showBuildingBlockAlertsCheckbox"]';

export const MAX_SIGNALS_DETAILS = '[data-test-subj="maxSignalsPropertyValue"]';

export const DESCRIPTION_SETUP_GUIDE_BUTTON = '[data-test-subj="stepAboutDetailsToggle-setup"]';

export const DESCRIPTION_SETUP_GUIDE_CONTENT = '[data-test-subj="stepAboutDetailsSetupContent"]';

export const EXECUTIONS_TAB = 'a[data-test-subj="navigation-execution_results"]';

export const EXECUTION_RESULTS_CONTAINER = `[data-test-subj="executionResultsContainer"]`;

export const EXECUTION_RESULTS_TABLE = `[data-test-subj="executionResultsTable"]`;

export const EXECUTION_DETAILS_FLYOUT = `[data-test-subj="executionDetailsFlyout"]`;

export const EXECUTION_DETAILS_FLYOUT_MESSAGE_SECTION = `[data-test-subj="executionDetailsFlyoutMessageSection"]`;

export const EXECUTION_RESULTS_TABLE_ACTION_VIEW_DETAILS = `[data-test-subj="executionResultsTableActionViewDetails"]`;

// Execution results table cell selectors
export const EXECUTION_RESULTS_TABLE_CELL_STATUS = `[data-test-subj="executionResultsTableCellStatus"]`;
export const EXECUTION_RESULTS_TABLE_CELL_RUN_TYPE = `[data-test-subj="executionResultsTableCellRunType"]`;
export const EXECUTION_RESULTS_TABLE_CELL_TIMESTAMP = `[data-test-subj="executionResultsTableCellTimestamp"]`;
export const EXECUTION_RESULTS_TABLE_CELL_DURATION = `[data-test-subj="executionResultsTableCellDuration"]`;
export const EXECUTION_RESULTS_TABLE_CELL_ALERTS = `[data-test-subj="executionResultsTableCellAlerts"]`;
export const EXECUTION_RESULTS_TABLE_CELL_MESSAGE = `[data-test-subj="executionResultsTableCellMessage"]`;

// Execution details flyout header selectors
export const EXECUTION_DETAILS_FLYOUT_HEADER_STATUS = `[data-test-subj="executionDetailsFlyoutHeaderStatus"]`;
export const EXECUTION_DETAILS_FLYOUT_HEADER_RUN_TYPE = `[data-test-subj="executionDetailsFlyoutHeaderRunType"]`;

// Execution details flyout field value selectors
export const EXECUTION_DETAILS_FLYOUT_ALERT_COUNT = `[data-test-subj="executionDetailsFlyoutAlertCount"]`;
export const EXECUTION_DETAILS_FLYOUT_CANDIDATE_COUNT = `[data-test-subj="executionDetailsFlyoutCandidateCount"]`;
export const EXECUTION_DETAILS_FLYOUT_MATCHED_INDICES = `[data-test-subj="executionDetailsFlyoutMatchedIndices"]`;
export const EXECUTION_DETAILS_FLYOUT_FROZEN_INDICES = `[data-test-subj="executionDetailsFlyoutFrozenIndices"]`;
export const EXECUTION_DETAILS_FLYOUT_GAP_DURATION = `[data-test-subj="executionDetailsFlyoutGapDuration"]`;
export const EXECUTION_DETAILS_FLYOUT_SCHEDULING_DELAY = `[data-test-subj="executionDetailsFlyoutSchedulingDelay"]`;
export const EXECUTION_DETAILS_FLYOUT_EXECUTION_DURATION = `[data-test-subj="executionDetailsFlyoutExecutionDuration"]`;
export const EXECUTION_DETAILS_FLYOUT_SEARCH_DURATION = `[data-test-subj="executionDetailsFlyoutSearchDuration"]`;
export const EXECUTION_DETAILS_FLYOUT_INDEX_DURATION = `[data-test-subj="executionDetailsFlyoutIndexDuration"]`;

export const EXECUTION_RUN_TYPE_FILTER = `[data-test-subj="ExecutionRunTypeFilter"]`;

export const EXECUTION_RUN_TYPE_FILTER_ITEM = `[data-test-subj="ExecutionRunTypeFilter-item"]`;

export const RULE_BACKFILLS_INFO_HEADEAR =
  '[data-test-subj="rule-backfills-info"] [data-test-subj="header-section"]';

export const RULE_BACKFILLS_TABLE = '[data-test-subj="rule-backfills-table"]';

export const RULE_BACKFILLS_COLUMN_ERROR = '[data-test-subj="rule-backfills-column-error"]';
export const RULE_BACKFILLS_COLUMN_PENDING = '[data-test-subj="rule-backfills-column-pending"]';
export const RULE_BACKFILLS_COLUMN_RUNNING = '[data-test-subj="rule-backfills-column-running"]';
export const RULE_BACKFILLS_COLUMN_COMPLETED = '[data-test-subj="rule-backfills-column-completed"]';
export const RULE_BACKFILLS_COLUMN_TOTAL = '[data-test-subj="rule-backfills-column-total"]';
export const RULE_BACKFILLS_DELETE_BUTTON = '[data-test-subj="rule-backfills-delete-button"]';
export const RULE_BACKFILLS_DELETE_MODAL = '[data-test-subj="rule-backfills-delete-modal"]';
export const RULE_BACKFILL_DELETE_MODAL_CONFIRM_BUTTON = `${RULE_BACKFILLS_DELETE_MODAL} [data-test-subj="confirmModalConfirmButton"]`;

// Rule gaps selectors
export const RULE_GAPS_INFO = '[data-test-subj="rule-gaps-info"]';
export const RULE_GAPS_TABLE = '[data-test-subj="rule-gaps-table"]';
export const RULE_GAPS_STATUS_FILTER = '[data-test-subj="rule-gaps-status-filter"]';
export const RULE_GAPS_DATE_FILTER_OPTION = `[data-test-subj="rule-gaps-status-filter-item"]`;
export const RULE_GAPS_FILL_BUTTON =
  '[data-test-subj="rule-gaps-table"] [data-test-subj="rule-gaps-fill-gap-button"]';
export const RULE_GAPS_DATE_PICKER = '[data-test-subj="rule-gaps-date-picker"]';
export const RULE_GAPS_DATE_PICKER_APPLY_REFRESH = `${RULE_GAPS_DATE_PICKER} .euiSuperUpdateButton`;
export const RULE_FILL_ALL_GAPS_BUTTON = '[data-test-subj="fill-rule-gaps-button"]';
export const MODIFIED_PREBUILT_RULE_BADGE = '[data-test-subj="modified-prebuilt-rule-badge"]';
export const MODIFIED_PREBUILT_RULE_BADGE_NO_BASE_VERSION =
  '[data-test-subj="modified-prebuilt-rule-badge-no-base-version"]';
export const MODIFIED_PREBUILT_RULE_PER_FIELD_BADGE = (fieldName: string) =>
  `[data-test-subj="modified-prebuilt-rule-per-field-${fieldName}-badge"]`;
export const RULE_CUSTOMIZATIONS_DIFF_FLYOUT = '[data-test-subj="ruleCustomizationsDiffFlyout"]';
