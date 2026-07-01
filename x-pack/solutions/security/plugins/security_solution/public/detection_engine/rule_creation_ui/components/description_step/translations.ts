/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const FILTERS_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.filtersLabel',
  {
    defaultMessage: 'Filters',
  }
);

export const QUERY_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.queryLabel',
  {
    defaultMessage: 'Custom query',
  }
);

export const EQL_QUERY_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.eqlQueryLabel',
  {
    defaultMessage: 'EQL query',
  }
);

export const ESQL_QUERY_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.esqlQueryLabel',
  {
    defaultMessage: 'ES|QL query',
  }
);

export const THREAT_QUERY_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.threatQueryLabel',
  {
    defaultMessage: 'Indicator index query',
  }
);

export const SAVED_QUERY_NAME_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.savedIdLabel',
  {
    defaultMessage: 'Saved query name',
  }
);

export const SAVED_QUERY_FILTERS_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.savedQueryFiltersLabel',
  {
    defaultMessage: 'Saved query filters',
  }
);

export const SAVED_QUERY_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.savedQueryLabel',
  {
    defaultMessage: 'Saved query',
  }
);

export const ML_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.mlRuleTypeDescription',
  {
    defaultMessage: 'Machine Learning',
  }
);

export const EQL_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.eqlRuleTypeDescription',
  {
    defaultMessage: 'Event Correlation',
  }
);

export const QUERY_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.queryRuleTypeDescription',
  {
    defaultMessage: 'Query',
  }
);

export const THRESHOLD_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.thresholdRuleTypeDescription',
  {
    defaultMessage: 'Threshold',
  }
);

export const THREAT_MATCH_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.threatMatchRuleTypeDescription',
  {
    defaultMessage: 'Indicator Match',
  }
);

export const NEW_TERMS_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.newTermsRuleTypeDescription',
  {
    defaultMessage: 'New Terms',
  }
);

export const ESQL_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.esqlRuleTypeDescription',
  {
    defaultMessage: 'ES|QL',
  }
);

export const THRESHOLD_RESULTS_ALL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.thresholdResultsAllDescription',
  {
    defaultMessage: 'All results',
  }
);

export const THRESHOLD_RESULTS_AGGREGATED_BY = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.thresholdResultsAggregatedByDescription',
  {
    defaultMessage: 'Results aggregated by',
  }
);

export const THRESHOLD_CARDINALITY = (
  thresholdFieldsGroupedBy: string,
  cardinalityField: string,
  cardinalityValue: string | number
) =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.ruleDescription.thresholdResultsCardinalityDescription',
    {
      defaultMessage:
        '{thresholdFieldsGroupedBy} when unique values count of {cardinalityField} >= {cardinalityValue}',
      values: {
        thresholdFieldsGroupedBy,
        cardinalityField,
        cardinalityValue,
      },
    }
  );

export const EQL_EVENT_CATEGORY_FIELD_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.eqlEventCategoryFieldLabel',
  {
    defaultMessage: 'Event category field',
  }
);

export const EQL_TIEBREAKER_FIELD_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.eqlTiebreakerFieldLabel',
  {
    defaultMessage: 'Tiebreaker field',
  }
);

export const EQL_TIMESTAMP_FIELD_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.eqlTimestampFieldLabel',
  {
    defaultMessage: 'Timestamp field',
  }
);

export const ALERT_SUPPRESSION_PER_RULE_EXECUTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.alertSuppressionPerRuleExecution',
  {
    defaultMessage: 'One rule execution',
  }
);

export const ALERT_SUPPRESSION_SUPPRESS_ON_MISSING_FIELDS = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.alertSuppressionSuppressOnMissingFieldsDescription',
  {
    defaultMessage: 'Suppress and group alerts for events with missing fields',
  }
);

export const ALERT_SUPPRESSION_DO_NOT_SUPPRESS_ON_MISSING_FIELDS = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.alertSuppressionDoNotSuppressOnMissingFieldsDescription',
  {
    defaultMessage: 'Do not suppress alerts for events with missing fields',
  }
);

export const BUILDING_BLOCK_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.buildingBlockLabel',
  {
    defaultMessage: 'Building block',
  }
);

export const BUILDING_BLOCK_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.buildingBlockDescription',
  {
    defaultMessage: 'All generated alerts will be marked as building block alerts',
  }
);

export const ALERT_SUPPRESSION_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.alertSuppressionFieldsLabel',
  {
    defaultMessage: 'Suppress alerts by',
  }
);

export const UNSUPPORTED_MITRE_ID_WARNING = (id: string) =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.ruleDescription.unsupportedMitreIdWarning',
    {
      values: { id },
      defaultMessage:
        '"{id}" is not in the currently supported MITRE ATT&CK\u00AE version. Edit the rule to update its mappings.',
    }
  );
