/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const PAGE_TITLE = i18n.translate('xpack.securitySolution.rulesV2.pageTitle', {
  defaultMessage: 'Rules v2',
});

export const CREATE_RULE = i18n.translate('xpack.securitySolution.rulesV2.createRule', {
  defaultMessage: 'Create v2 rule',
});

export const EDIT_RULE = i18n.translate('xpack.securitySolution.rulesV2.editRule', {
  defaultMessage: 'Edit rule',
});

export const VIEW_RULE = i18n.translate('xpack.securitySolution.rulesV2.viewRule', {
  defaultMessage: 'Rule details',
});

export const BACK_TO_RULES = i18n.translate('xpack.securitySolution.rulesV2.backToRules', {
  defaultMessage: 'Back to rules',
});

export const SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.rulesV2.searchPlaceholder',
  { defaultMessage: 'Search rules' }
);

export const LOAD_ERROR = i18n.translate('xpack.securitySolution.rulesV2.loadError', {
  defaultMessage: 'Failed to load rules',
});

export const RULE_LOAD_ERROR = i18n.translate('xpack.securitySolution.rulesV2.ruleLoadError', {
  defaultMessage: 'Failed to load rule',
});

export const RULE_TYPE_ESQL = i18n.translate('xpack.securitySolution.rulesV2.ruleType.esql', {
  defaultMessage: 'ES|QL',
});

export const RULE_TYPE_ESQL_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.rulesV2.ruleType.esqlDescription',
  { defaultMessage: 'Write a custom ES|QL query to define your detection logic.' }
);

export const RULE_TYPE_THRESHOLD = i18n.translate(
  'xpack.securitySolution.rulesV2.ruleType.threshold',
  { defaultMessage: 'Threshold' }
);

export const RULE_TYPE_THRESHOLD_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.rulesV2.ruleType.thresholdDescription',
  {
    defaultMessage:
      'Aggregate query results to detect when the number of matches exceeds a threshold.',
  }
);

export const RULE_TYPE_LABEL = i18n.translate('xpack.securitySolution.rulesV2.ruleTypeLabel', {
  defaultMessage: 'Rule type',
});

export const INDEX_PATTERNS_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.indexPatternsLabel',
  { defaultMessage: 'Index patterns' }
);

export const INDEX_PATTERNS_HELP = i18n.translate(
  'xpack.securitySolution.rulesV2.indexPatternsHelp',
  { defaultMessage: 'Specify the indices to query for this rule.' }
);

export const FILTER_QUERY_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.filterQueryLabel',
  { defaultMessage: 'Filter query' }
);

export const FILTER_QUERY_HELP = i18n.translate('xpack.securitySolution.rulesV2.filterQueryHelp', {
  defaultMessage:
    'Optional ES|QL WHERE clause to filter data before aggregation (e.g. status >= 400 AND service.name == "api").',
});

export const THRESHOLD_LABEL = i18n.translate('xpack.securitySolution.rulesV2.thresholdLabel', {
  defaultMessage: 'Threshold',
});

export const SUPPRESSION_LABEL = i18n.translate('xpack.securitySolution.rulesV2.suppressionLabel', {
  defaultMessage: 'Suppression',
});

export const SUPPRESSION_FIELDS_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.suppressionFieldsLabel',
  { defaultMessage: 'Suppress alerts by' }
);

export const SUPPRESSION_FIELDS_HELP = i18n.translate(
  'xpack.securitySolution.rulesV2.suppressionFieldsHelp',
  {
    defaultMessage:
      'Fields to group and suppress alerts by. These map to the threshold group-by and ES|QL GROUP BY clause.',
  }
);

export const THRESHOLD_GROUP_BY_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.thresholdGroupByLabel',
  { defaultMessage: 'Group by' }
);

export const THRESHOLD_GROUP_BY_HELP = i18n.translate(
  'xpack.securitySolution.rulesV2.thresholdGroupByHelp',
  { defaultMessage: "Select fields to group by. Fields are joined together with 'AND'" }
);

export const THRESHOLD_VALUE_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.thresholdValueLabel',
  { defaultMessage: 'Threshold' }
);

export const THRESHOLD_VALUE_HELP = i18n.translate(
  'xpack.securitySolution.rulesV2.thresholdValueHelp',
  { defaultMessage: 'Minimum count of documents required to trigger an alert.' }
);

export const CARDINALITY_FIELD_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.cardinalityFieldLabel',
  { defaultMessage: 'Count' }
);

export const CARDINALITY_FIELD_HELP = i18n.translate(
  'xpack.securitySolution.rulesV2.cardinalityFieldHelp',
  { defaultMessage: 'Select a field to check cardinality' }
);

export const CARDINALITY_VALUE_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.cardinalityValueLabel',
  { defaultMessage: 'Unique values' }
);

export const THRESHOLD_FIELD_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.rulesV2.thresholdFieldPlaceholder',
  { defaultMessage: 'All results' }
);

export const TIMESTAMP_OVERRIDE_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.timestampOverrideLabel',
  { defaultMessage: 'Timestamp override' }
);

export const TIMESTAMP_OVERRIDE_HELP = i18n.translate(
  'xpack.securitySolution.rulesV2.timestampOverrideHelp',
  {
    defaultMessage:
      'Use a different timestamp field instead of @timestamp for ordering. Falls back to @timestamp when the override field is missing.',
  }
);

export const GENERATED_QUERY_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.generatedQueryLabel',
  { defaultMessage: 'Generated ES|QL query' }
);

export const VIEW_QUERY_LABEL = i18n.translate('xpack.securitySolution.rulesV2.viewQueryLabel', {
  defaultMessage: 'ES|QL query',
});

export const VIEW_SCHEDULE_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.viewScheduleLabel',
  { defaultMessage: 'Schedule' }
);

export const VIEW_DESCRIPTION_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.viewDescriptionLabel',
  { defaultMessage: 'Description' }
);

export const VIEW_GROUPING_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.viewGroupingLabel',
  { defaultMessage: 'Suppression fields' }
);

export const VIEW_TIME_FIELD_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.viewTimeFieldLabel',
  { defaultMessage: 'Time field' }
);

export const TAB_OVERVIEW = i18n.translate('xpack.securitySolution.rulesV2.tabOverview', {
  defaultMessage: 'Overview',
});

export const TAB_ALERTS = i18n.translate('xpack.securitySolution.rulesV2.tabAlerts', {
  defaultMessage: 'Alerts',
});

export const DETECTION_FIELDS_ACCORDION = i18n.translate(
  'xpack.securitySolution.rulesV2.detectionFieldsAccordion',
  { defaultMessage: 'Advanced detection settings' }
);

export const THREAT_LABEL = i18n.translate('xpack.securitySolution.rulesV2.threatLabel', {
  defaultMessage: 'MITRE ATT&CK\u2122 threats',
});

export const THREAT_HELP = i18n.translate('xpack.securitySolution.rulesV2.threatHelp', {
  defaultMessage: 'Map this rule to MITRE ATT&CK tactics, techniques, and subtechniques.',
});

export const NOTE_LABEL = i18n.translate('xpack.securitySolution.rulesV2.noteLabel', {
  defaultMessage: 'Investigation guide',
});

export const NOTE_HELP = i18n.translate('xpack.securitySolution.rulesV2.noteHelp', {
  defaultMessage: 'Markdown-formatted investigation guide for analysts responding to alerts.',
});

export const SETUP_LABEL = i18n.translate('xpack.securitySolution.rulesV2.setupLabel', {
  defaultMessage: 'Setup guide',
});

export const SETUP_HELP = i18n.translate('xpack.securitySolution.rulesV2.setupHelp', {
  defaultMessage: 'Markdown-formatted prerequisite and setup instructions.',
});

export const RELATED_INTEGRATIONS_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.relatedIntegrationsLabel',
  { defaultMessage: 'Related integrations' }
);

export const RELATED_INTEGRATIONS_HELP = i18n.translate(
  'xpack.securitySolution.rulesV2.relatedIntegrationsHelp',
  {
    defaultMessage:
      'Elastic integrations that provide the data this rule queries. Format: package:version (e.g. endpoint:8.0.0).',
  }
);

export const INVESTIGATION_FIELDS_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.investigationFieldsLabel',
  { defaultMessage: 'Custom highlighted fields' }
);

export const INVESTIGATION_FIELDS_HELP = i18n.translate(
  'xpack.securitySolution.rulesV2.investigationFieldsHelp',
  { defaultMessage: 'Fields highlighted in the alert detail flyout for faster investigation.' }
);

export const REFERENCES_LABEL = i18n.translate('xpack.securitySolution.rulesV2.referencesLabel', {
  defaultMessage: 'Reference URLs',
});

export const REFERENCES_HELP = i18n.translate('xpack.securitySolution.rulesV2.referencesHelp', {
  defaultMessage: 'External URLs such as documentation, blogs, or threat intelligence reports.',
});

export const ADD_REFERENCE = i18n.translate('xpack.securitySolution.rulesV2.addReference', {
  defaultMessage: 'Add reference URL',
});

export const ADD_INTEGRATION = i18n.translate('xpack.securitySolution.rulesV2.addIntegration', {
  defaultMessage: 'Add integration',
});

export const TACTIC_LABEL = i18n.translate('xpack.securitySolution.rulesV2.tacticLabel', {
  defaultMessage: 'Tactic',
});

export const TECHNIQUE_LABEL = i18n.translate('xpack.securitySolution.rulesV2.techniqueLabel', {
  defaultMessage: 'Technique',
});

export const SUBTECHNIQUE_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.subtechniqueLabel',
  { defaultMessage: 'Subtechnique' }
);

export const TACTIC_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.rulesV2.tacticPlaceholder',
  { defaultMessage: 'Select a tactic ...' }
);

export const TECHNIQUE_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.rulesV2.techniquePlaceholder',
  { defaultMessage: 'Select a technique ...' }
);

export const SUBTECHNIQUE_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.rulesV2.subtechniquePlaceholder',
  { defaultMessage: 'Select a subtechnique ...' }
);

export const ADD_TACTIC = i18n.translate('xpack.securitySolution.rulesV2.addTactic', {
  defaultMessage: 'Add tactic',
});

export const ADD_TECHNIQUE = i18n.translate('xpack.securitySolution.rulesV2.addTechnique', {
  defaultMessage: 'Add technique',
});

export const ADD_SUBTECHNIQUE = i18n.translate('xpack.securitySolution.rulesV2.addSubtechnique', {
  defaultMessage: 'Add subtechnique',
});

export const ENABLE_RULE = i18n.translate('xpack.securitySolution.rulesV2.enableRule', {
  defaultMessage: 'Enable rule',
});

export const DISABLE_RULE = i18n.translate('xpack.securitySolution.rulesV2.disableRule', {
  defaultMessage: 'Disable rule',
});

export const SUPPRESSION_DURATION_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.suppressionDurationLabel',
  { defaultMessage: 'Suppression window' }
);

export const SUPPRESSION_DURATION_HELP = i18n.translate(
  'xpack.securitySolution.rulesV2.suppressionDurationHelp',
  {
    defaultMessage:
      'Max episode duration anchored to the first event. After this window, a new episode starts. E.g. "1h", "30m".',
  }
);

export const VIEW_SUPPRESSION_DURATION_LABEL = i18n.translate(
  'xpack.securitySolution.rulesV2.viewSuppressionDurationLabel',
  { defaultMessage: 'Suppression window' }
);

export const BACK_TO_V1_CREATION = i18n.translate(
  'xpack.securitySolution.rulesV2.backToV1Creation',
  { defaultMessage: 'Back to classic rule creation' }
);
