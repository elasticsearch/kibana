/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const COLLAPSED_ACTION_BTN = '[data-test-subj="euiCollapsedItemActionsButton"]';

export const ELASTIC_RULES_BTN = '[data-test-subj="showElasticRulesFilterButton"]';

export const CUSTOM_RULES_BTN = '[data-test-subj="showCustomRulesFilterButton"]';

export const ENABLED_RULES_BTN = '[data-test-subj="showEnabledRulesFilterButton"]';

export const DISABLED_RULES_BTN = '[data-test-subj="showDisabledRulesFilterButton"]';

export const DELETE_RULE_ACTION_BTN = '[data-test-subj="deleteRuleAction"]';

export const CONFIRM_DELETE_RULE_BTN =
  '[data-test-subj="deleteRulesConfirmationModal"] [data-test-subj="confirmModalConfirmButton"]';

export const EDIT_RULE_ACTION_BTN = '[data-test-subj="editRuleAction"]';

export const DUPLICATE_RULE_ACTION_BTN = '[data-test-subj="duplicateRuleAction"]';

export const MANUAL_RULE_RUN_ACTION_BTN = '[data-test-subj="manualRuleRunAction"]';

export const DUPLICATE_RULE_MENU_PANEL_BTN = '[data-test-subj="rules-details-duplicate-rule"]';
export const CONFIRM_DUPLICATE_RULE = '[data-test-subj="confirmModalConfirmButton"]';

export const DUPLICATE_WITH_EXCEPTIONS_OPTION = '[data-test-subj="withExceptions"] label';

export const DUPLICATE_WITH_EXCEPTIONS_WITHOUT_EXPIRED_OPTION =
  '[data-test-subj="withExceptionsExcludeExpiredExceptions"] label';

export const DUPLICATE_WITHOUT_EXCEPTIONS_OPTION = '[data-test-subj="withoutExceptions"] label';

export const CONFIRM_MANUAL_RULE_RUN_WARNING_BTN =
  '[data-test-subj="bulkActionConfirmationModal"] [data-test-subj="confirmModalConfirmButton"]';

export const CONFIRM_FILL_RULE_GAPS_WARNING_BTN =
  '[data-test-subj="bulkActionConfirmationModal"] [data-test-subj="confirmModalConfirmButton"]';

export const CONFIRM_BULK_MANUAL_RULE_RUN_BTN =
  '[data-test-subj="schedule-bulk-action-modal"] [data-test-subj="confirmModalConfirmButton"]';

export const CONFIRM_BULK_GAP_FILL_BTN =
  '[data-test-subj="schedule-bulk-action-modal"] [data-test-subj="confirmModalConfirmButton"]';

export const RULE_SEARCH_FIELD = '[data-test-subj="ruleSearchField"]';

export const EXPORT_ACTION_BTN = '[data-test-subj="exportRuleAction"]';

export const FIRST_RULE = 0;

export const FOURTH_RULE = 3;

export const INTEGRATIONS_POPOVER = '[data-test-subj="IntegrationsDisplayPopover"]';

export const INTEGRATIONS_POPOVER_TITLE = '[data-test-subj="IntegrationsPopoverTitle"]';

export const ADD_ELASTIC_RULES_BTN = '[data-test-subj="addElasticRulesButton"]';

export const ADD_ELASTIC_RULES_EMPTY_PROMPT_BTN =
  '[data-test-subj="add-elastc-rules-empty-empty-prompt-button"]';

export const INSTALL_ALL_RULES_BUTTON = '[data-test-subj="installAllRulesButton"]';

export const INSTALL_SELECTED_RULES_BUTTON = '[data-test-subj="installSelectedRulesButton"]';

export const UPGRADE_ALL_RULES_BUTTON = '[data-test-subj="upgradeAllRulesButton"]';

export const UPGRADE_SELECTED_RULES_BUTTON = '[data-test-subj="upgradeSelectedRulesButton"]';

export const getInstallSingleRuleLoadingSpinnerByRuleId = (ruleId: string) => {
  return `[data-test-subj="installSinglePrebuiltRuleButton-loadingSpinner-${ruleId}"]`;
};

export const getUpgradeSingleRuleLoadingSpinnerByRuleId = (ruleId: string) => {
  return `[data-test-subj="upgradeSinglePrebuiltRuleButton-loadingSpinner-${ruleId}"]`;
};

export const GO_BACK_TO_RULES_TABLE_BUTTON = '[data-test-subj="addRulesGoBackToRulesTableBtn"]';

export const RULES_TABLE_REFRESH_INDICATOR = '[data-test-subj="loading-spinner"]';

export const RULES_TABLE_AUTOREFRESH_INDICATOR = '[data-test-subj="loadingRulesInfoProgress"]';

export const RISK_SCORE = '[data-test-subj="riskScore"]';

export const SECOND_RULE = 1;

export const RULE_CHECKBOX = '.euiTableRow .euiCheckbox__input';

export const RULE_NAME = '[data-test-subj="ruleName"]';

export const RULE_LAST_RUN = '[data-test-subj="ruleLastRun"]';

export const RULE_SWITCH = '[data-test-subj="ruleSwitch"]';

export const RULE_SWITCH_LOADER = '[data-test-subj="ruleSwitchLoader"]';

export const RULES_MANAGEMENT_TAB = '[data-test-subj="navigation-management"]';

export const RULES_MONITORING_TAB = '[data-test-subj="navigation-monitoring"]';

export const RULES_UPDATES_TAB = '[data-test-subj="navigation-updates"]';

export const RULES_MANAGEMENT_TABLE = '[data-test-subj="rules-management-table"]';

export const RULES_MONITORING_TABLE = '[data-test-subj="rules-monitoring-table"]';

export const RULES_UPDATES_TABLE = '[data-test-subj="rules-upgrades-table"]';

export const ADD_ELASTIC_RULES_TABLE = '[data-test-subj="add-prebuilt-rules-table"]';

export const RULES_ROW = '.euiTableRow';

export const SEVERITY = '[data-test-subj="severity"]';

export const CREATE_NEW_RULE_BTN = '[data-test-subj="create-new-rule"]';

export const ENABLE_RULE_TOGGLE = '[data-test-subj="ruleSwitch"]';

export const SELECT_ALL_RULES_BTN = '[data-test-subj="selectAllRules"]';

export const RULES_EMPTY_PROMPT = '[data-test-subj="rulesEmptyPrompt"]';

export const MODAL_CONFIRMATION_BTN = '[data-test-subj="confirmModalConfirmButton"]';

export const MODAL_CONFIRMATION_BODY = '[data-test-subj="confirmModalBodyText"]';

export const MODAL_ERROR_BODY = '[data-test-subj="errorModalBody"]';

export const MODAL_CONFIRMATION_CANCEL_BTN = '[data-test-subj="confirmModalCancelButton"]';

export const RULE_DETAILS_DELETE_BTN = '[data-test-subj="rules-details-delete-rule"]';

export const RULE_DETAILS_MANUAL_RULE_RUN_BTN = '[data-test-subj="rules-details-manual-rule-run"]';

export const RULE_DETAILS_REVERT_RULE_BTN = '[data-test-subj="rules-details-revert-rule"]';

export const RULE_DETAILS_REVERT_RULE_TOOLTIP =
  '[data-test-subj="rules-details-revert-rule-tooltip"]';

export const SELECT_ALL_RULES_ON_PAGE_CHECKBOX = '[data-test-subj="checkboxSelectAll"]';

export const RULE_IMPORT_MODAL = '[data-test-subj="rules-import-modal-button"]';

export const RULE_IMPORT_MODAL_BUTTON = '[data-test-subj="import-data-modal-button"]';

export const INPUT_FILE = 'input[type=file]';

export const TOASTER = '[data-test-subj="euiToastHeader__title"]';

export const TOASTER_MESSAGE = '[data-test-subj="errorToastMessage"]';

export const SUCCESS_TOASTER_HEADER =
  '[class*="euiToast--success"] [data-test-subj="euiToastHeader__title"]';

export const TOASTER_BODY = '[data-test-subj="globalToastList"] [data-test-subj="euiToastBody"]';

export const SUCCESS_TOASTER_BODY =
  '[data-test-subj="globalToastList"] [class*="euiToast--success"] [data-test-subj="euiToastBody"]';

export const TOASTER_ERROR_BTN = '[data-test-subj="errorToastBtn"]';

export const TOASTER_CLOSE_ICON = '[data-test-subj="toastCloseButton"]';

export const RULE_IMPORT_OVERWRITE_CHECKBOX = '[id="importDataModalCheckboxLabel"]';

export const RULE_IMPORT_OVERWRITE_EXCEPTIONS_CHECKBOX =
  '[id="importDataModalExceptionsCheckboxLabel"]';

export const RULE_IMPORT_OVERWRITE_CONNECTORS_CHECKBOX =
  '[id="importDataModalActionConnectorsCheckbox"]';

export const RULES_TAGS_POPOVER_BTN = '[data-test-subj="tagsDisplayPopoverButton"]';

export const RULES_TAGS_POPOVER_WRAPPER = '[data-test-subj="tagsDisplayPopoverWrapper"]';

export const RULES_TAGS_FILTER_BTN = '[data-test-subj="tags-filter-popover-button"]';

export const RULES_TAGS_FILTER_POPOVER = '[data-test-subj="tags-filter-popover"]';

export const RULES_SELECTED_TAG = '.euiSelectableListItem[aria-checked="true"]';

export const SELECTED_RULES_NUMBER_LABEL = '[data-test-subj="selectedRules"]';

export const TIMELINE_BOTTOM_BAR = '[data-test-subj="timeline-bottom-bar-container"]';

export const AUTO_REFRESH_POPOVER_TRIGGER_BUTTON = '[data-test-subj="autoRefreshButton"]';

export const REFRESH_RULES_TABLE_BUTTON = '[data-test-subj="refreshRulesAction-linkIcon"]';

export const REFRESH_SETTINGS_SWITCH = '[data-test-subj="refreshSettingsSwitch"]';

export const REFRESH_RULES_STATUS = '[data-test-subj="refreshRulesStatus"]';

export const RULE_EXECUTION_STATUS_BADGE = '[data-test-subj="ruleExecutionStatus"]';

export const EXECUTION_STATUS_FILTER_BUTTON = '[data-test-subj="executionStatusFilterButton"]';

export const EXECUTION_STATUS_FILTER_OPTION = '[data-test-subj="executionStatusFilterOption"]';

export const getInstallSingleRuleButtonByRuleId = (ruleId: string) => {
  return `[data-test-subj="installSinglePrebuiltRuleButton-${ruleId}"]`;
};

export const getUpgradeSingleRuleButtonByRuleId = (ruleId: string) => {
  return `[data-test-subj="upgradeSinglePrebuiltRuleButton-${ruleId}"]`;
};

export const getReviewSingleRuleButtonByRuleId = (ruleId: string) => {
  return `[data-test-subj="reviewSinglePrebuiltRuleButton-${ruleId}"]`;
};

export const NO_RULES_AVAILABLE_FOR_INSTALL_MESSAGE =
  '[data-test-subj="noPrebuiltRulesAvailableForInstall"]';
export const NO_RULES_AVAILABLE_FOR_UPGRADE_MESSAGE =
  '[data-test-subj="noPrebuiltRulesAvailableForUpgrade"]';

export const INSTALL_PREBUILT_RULE_PREVIEW = '[data-test-subj="installPrebuiltRulePreview"]';
export const INSTALL_PREBUILT_RULE_BUTTON =
  '[data-test-subj="installPrebuiltRuleFromFlyoutButton"]';

export const UPDATE_PREBUILT_RULE_PREVIEW = '[data-test-subj="updatePrebuiltRulePreview"]';
export const UPDATE_PREBUILT_RULE_BUTTON = '[data-test-subj="updatePrebuiltRuleFromFlyoutButton"]';

export const FLYOUT_CLOSE_BTN = '[data-test-subj="euiFlyoutCloseButton"]';

export const AUTHOR_PROPERTY_TITLE = '[data-test-subj="authorPropertyTitle"]';
export const AUTHOR_PROPERTY_VALUE_ITEM = '[data-test-subj="authorPropertyValueItem"]';

export const BUILDING_BLOCK_TITLE = '[data-test-subj="buildingBlockPropertyTitle"]';
export const BUILDING_BLOCK_VALUE = '[data-test-subj="buildingBlockPropertyValue"]';

export const SEVERITY_TITLE = '[data-test-subj="severityPropertyTitle"]';
export const SEVERITY_VALUE = '[data-test-subj="severityPropertyValue"]';

export const SEVERITY_MAPPING_TITLE = '[data-test-subj="severityOverridePropertyTitle"]';
export const SEVERITY_MAPPING_VALUE_FIELD = '[data-test-subj="severityOverrideField"]';
export const SEVERITY_MAPPING_VALUE_VALUE = '[data-test-subj="severityOverrideValue"]';
export const SEVERITY_MAPPING_VALUE_SEVERITY = '[data-test-subj="severityOverrideSeverity"]';

export const RISK_SCORE_TITLE = '[data-test-subj="riskScorePropertyTitle"]';
export const RISK_SCORE_VALUE = '[data-test-subj="riskScorePropertyValue"]';

export const RISK_SCORE_MAPPING_TITLE = '[data-test-subj="riskScoreOverridePropertyTitle"]';
export const RISK_SCORE_MAPPING_VALUE_FIELD_NAME =
  '[data-test-subj="riskScoreOverridePropertyFieldName"]';
export const RISK_SCORE_MAPPING_VALUE_OVERRIDE_NAME =
  '[data-test-subj="riskScoreOverridePropertyOverride"]';

export const REFERENCES_TITLE = '[data-test-subj="referencesPropertyTitle"]';
export const REFERENCES_VALUE_ITEM = '[data-test-subj="urlsDescriptionReferenceLinkItem"]';

export const FALSE_POSITIVES_TITLE = '[data-test-subj="falsePositivesPropertyTitle"]';
export const FALSE_POSITIVES_VALUE_ITEM = '[data-test-subj="falsePositivesPropertyValueItem"]';

export const INVESTIGATION_FIELDS_TITLE = '[data-test-subj="investigationFieldsPropertyTitle"]';
export const INVESTIGATION_FIELDS_VALUE_ITEM =
  '[data-test-subj="investigationFieldsPropertyValueItem"]';

export const LICENSE_TITLE = '[data-test-subj="licensePropertyTitle"]';
export const LICENSE_VALUE = '[data-test-subj="licensePropertyValue"]';

export const RULE_NAME_OVERRIDE_TITLE = '[data-test-subj="ruleNameOverridePropertyTitle"]';
export const RULE_NAME_OVERRIDE_VALUE = '[data-test-subj="ruleNameOverridePropertyValue"]';

export const THREAT_TITLE = '[data-test-subj="threatPropertyTitle"]';
export const THREAT_TACTIC = '[data-test-subj="threatTacticLink"]';

export const TIMESTAMP_OVERRIDE_TITLE = '[data-test-subj="timestampOverridePropertyTitle"]';
export const TIMESTAMP_OVERRIDE_VALUE = '[data-test-subj="timestampOverridePropertyValue"]';

export const TAGS_PROPERTY_TITLE = '[data-test-subj="tagsPropertyTitle"]';
export const TAGS_PROPERTY_VALUE_ITEM = '[data-test-subj="tagsPropertyValueItem"]';

export const RELATED_INTEGRATIONS_TITLE = '[data-test-subj="relatedIntegrationsPropertyTitle"]';
export const RELATED_INTEGRATIONS_VALUE = '[data-test-subj^="relatedIntegrationsPropertyValue"]';

export const REQUIRED_FIELDS_PROPERTY_TITLE = '[data-test-subj="requiredFieldsPropertyTitle"]';
export const REQUIRED_FIELDS_PROPERTY_VALUE_ITEM =
  '[data-test-subj="requiredFieldsPropertyValueItem"]';

export const TIMELINE_TEMPLATE_TITLE = '[data-test-subj="timelineTemplatePropertyTitle"]';
export const TIMELINE_TEMPLATE_VALUE = '[data-test-subj="timelineTemplatePropertyValue"]';

export const INTERVAL_TITLE = '[data-test-subj="intervalPropertyTitle"]';
export const INTERVAL_VALUE = '[data-test-subj="intervalPropertyValue"]';

export const LOOK_BACK_TITLE = '[data-test-subj="lookBackPropertyTitle"]';
export const LOOK_BACK_VALUE = '[data-test-subj^="lookBackPropertyValue"]';

export const INDEX_TITLE = '[data-test-subj="indexPropertyTitle"]';
export const INDEX_VALUE_ITEM = '[data-test-subj="indexPropertyValueItem"]';

export const CUSTOM_QUERY_TITLE = '[data-test-subj="customQueryPropertyTitle"]';
export const CUSTOM_QUERY_VALUE = '[data-test-subj="customQueryPropertyValue"]';

export const FILTERS_TITLE = '[data-test-subj="filtersPropertyTitle"]';
export const FILTERS_VALUE_ITEM =
  '[data-test-subj="filtersPropertyValue"] [data-test-subj*="filter-badge-"]';

export const ALERT_SUPPRESSION_GROUP_BY_TITLE =
  '[data-test-subj="alertSuppressionGroupByPropertyTitle"]';
export const ALERT_SUPPRESSION_GROUP_BY_VALUE_ITEM =
  '[data-test-subj="alertSuppressionGroupByPropertyValueItem"]';

export const ALERT_SUPPRESSION_DURATION_TITLE =
  '[data-test-subj="alertSuppressionDurationPropertyTitle"]';
export const ALERT_SUPPRESSION_DURATION_VALUE =
  '[data-test-subj="alertSuppressionDurationPropertyValue"]';

export const ALERT_SUPPRESSION_MISSING_FIELD_TITLE =
  '[data-test-subj="alertSuppressionMissingFieldPropertyTitle"]';
export const ALERT_SUPPRESSION_MISSING_FIELD_VALUE =
  '[data-test-subj="alertSuppressionMissingFieldsPropertyValue"]';

export const DATA_VIEW_ID_TITLE = '[data-test-subj="dataViewIdPropertyTitle"]';
export const DATA_VIEW_ID_VALUE = '[data-test-subj="dataViewIdPropertyValue"]';

export const DATA_VIEW_INDEX_PATTERN_TITLE = '[data-test-subj="dataViewIndexPatternPropertyTitle"]';
export const DATA_VIEW_INDEX_PATTERN_VALUE = '[data-test-subj="dataViewIndexPatternPropertyValue"]';

export const SAVED_QUERY_CONTENT_TITLE = '[data-test-subj="savedQueryContentPropertyTitle"]';
export const SAVED_QUERY_CONTENT_VALUE = '[data-test-subj="savedQueryContentPropertyValue"]';

export const SAVED_QUERY_FILTERS_TITLE = '[data-test-subj="savedQueryFiltersPropertyTitle"]';
export const SAVED_QUERY_FILTERS_VALUE =
  '[data-test-subj="savedQueryFiltersPropertyValue"] [data-test-subj*="filter-badge-"]';

export const SAVED_QUERY_NAME_TITLE = '[data-test-subj="savedQueryNamePropertyTitle"]';
export const SAVED_QUERY_NAME_VALUE = '[data-test-subj="savedQueryNamePropertyValue"]';

export const ANOMALY_THRESHOLD_TITLE = '[data-test-subj="anomalyThresholdPropertyTitle"]';
export const ANOMALY_THRESHOLD_VALUE = '[data-test-subj="anomalyThresholdPropertyValue"]';

export const MACHINE_LEARNING_JOB_TITLE = '[data-test-subj="mlJobPropertyTitle"]';
export const MACHINE_LEARNING_JOB_VALUE = '[data-test-subj="machineLearningJob"]';

export const THRESHOLD_TITLE = '[data-test-subj="thresholdPropertyTitle"]';
export const THRESHOLD_VALUE = '[data-test-subj="thresholdPropertyValue"]';

export const EQL_QUERY_TITLE = '[data-test-subj="eqlQueryPropertyTitle"]';
export const EQL_QUERY_VALUE = '[data-test-subj="eqlQueryPropertyValue"]';

export const THREAT_INDEX_TITLE = '[data-test-subj="threatIndexPropertyTitle"]';
export const THREAT_INDEX_VALUE_ITEM = '[data-test-subj="threatIndexPropertyValueItem"]';

export const THREAT_MAPPING_TITLE = '[data-test-subj="threatMappingPropertyTitle"]';
export const THREAT_MAPPING_VALUE = '[data-test-subj="threatMappingPropertyValue"]';

export const THREAT_FILTERS_TITLE = '[data-test-subj="threatFiltersPropertyTitle"]';
export const THREAT_FILTERS_VALUE_ITEM =
  '[data-test-subj="threatFiltersPropertyValue"] [data-test-subj*="filter-badge-"]';

export const THREAT_QUERY_TITLE = '[data-test-subj="threatQueryPropertyTitle"]';
export const THREAT_QUERY_VALUE = '[data-test-subj="threatQueryPropertyValue"]';

export const NEW_TERMS_FIELDS_TITLE = '[data-test-subj="newTermsFieldsPropertyTitle"]';
export const NEW_TERMS_FIELDS_VALUE_ITEM = '[data-test-subj="newTermsFieldsPropertyValueItem"]';

export const NEW_TERMS_WINDOW_SIZE_TITLE = '[data-test-subj="newTermsWindowSizePropertyTitle"]';
export const NEW_TERMS_WINDOW_SIZE_VALUE = '[data-test-subj^="newTermsWindowSizePropertyValue"]';

export const ESQL_QUERY_TITLE = '[data-test-subj="esqlQueryPropertyTitle"]';
export const ESQL_QUERY_VALUE = '[data-test-subj="esqlQueryPropertyValue"]';

export const PER_FIELD_DIFF_WRAPPER = '[data-test-subj="ruleUpgradePerFieldDiffWrapper"]';
export const FIELD_UPGRADE_WRAPPER = (fieldName: string) =>
  `[data-test-subj="${fieldName}-upgradeWrapper"]`;
export const PER_FIELD_DIFF_DEFINITION_SECTION = '[data-test-subj="perFieldDiffDefinitionSection"]';

export const PER_FIELD_EDIT_BUTTON = '[data-test-subj="prebuilt-rule-upgrade-flyout-field-edit"]';

export const PER_FIELD_CANCEL_BUTTON =
  '[data-test-subj="prebuilt-rule-upgrade-flyout-field-cancel"]';

export const PER_FIELD_ACCEPT_BUTTON =
  '[data-test-subj="prebuilt-rule-upgrade-flyout-field-accept"]';

export const PER_FIELD_SAVE_BUTTON = '[data-test-subj="prebuilt-rule-upgrade-flyout-field-save"]';

export const MODIFIED_RULE_BADGE = '[data-test-subj="upgradeRulesTableModifiedColumnBadge"]';

export const CONFLICTS_MODAL_UPGRADE_CONFLICT_FREE_RULES =
  '[data-test-subj="conflicts-modal-upgrade-conflict-free-rules"]';

export const CONFLICTS_MODAL_UPGRADE_RULES_WITH_CONFLICTS =
  '[data-test-subj="conflicts-modal-upgrade-rules-with-solvable-conflicts"]';

export const CONFLICTS_MODAL_CANCEL = '[data-test-subj="conflicts-modal-cancel"]';
