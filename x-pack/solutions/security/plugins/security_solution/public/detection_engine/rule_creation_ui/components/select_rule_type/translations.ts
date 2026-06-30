/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const EQL_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.eqlTypeTitle',
  {
    defaultMessage: 'Event Correlation',
  }
);

export const EQL_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.eqlTypeDescription',
  {
    defaultMessage:
      'Use Event Query Language (EQL) to match events, generate sequences, and stack data',
  }
);

export const ESQL_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.esqlTypeTitle',
  {
    defaultMessage: 'ES|QL',
  }
);

export const ESQL_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.esqlTypeDescription',
  {
    defaultMessage:
      'Use Elasticsearch Query Language (ES|QL) to find events and aggregate search results.',
  }
);

export const QUERY_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.queryTypeTitle',
  {
    defaultMessage: 'Custom query',
  }
);

export const QUERY_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.queryTypeDescription',
  {
    defaultMessage: 'Use KQL or Lucene to detect issues across indices.',
  }
);

export const ML_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.mlTypeTitle',
  {
    defaultMessage: 'Machine Learning',
  }
);

export const ML_CPS_SUPPORT_COMING_SOON = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.mlCpsSupportComingSoon',
  {
    defaultMessage: 'CPS support coming soon',
  }
);

export const ML_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.mlTypeDescription',
  {
    defaultMessage: 'Select ML job to detect anomalous activity.',
  }
);

export const THRESHOLD_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.thresholdTypeTitle',
  {
    defaultMessage: 'Threshold',
  }
);

export const THRESHOLD_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.thresholdTypeDescription',
  {
    defaultMessage: 'Aggregate query results to detect when number of matches exceeds threshold.',
  }
);

export const THREAT_MATCH_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.threatMatchTitle',
  {
    defaultMessage: 'Indicator Match',
  }
);

export const THREAT_MATCH_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.threatMatchDescription',
  {
    defaultMessage:
      'Use indicators from intelligence sources to detect matching events and alerts.',
  }
);

export const NEW_TERMS_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.newTermsTitle',
  {
    defaultMessage: 'New Terms',
  }
);

export const NEW_TERMS_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.newTermsDescription',
  {
    defaultMessage: 'Find documents with values appearing for the first time.',
  }
);

export const V2_SECTION_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.v2SectionTitle',
  {
    defaultMessage: 'Next-gen Alerting',
  }
);

export const V2_SECTION_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.v2SectionDescription',
  {
    defaultMessage:
      'Try more performant ES|QL next generation rules.',
  }
);

export const V2_CLASSIC_SECTION_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.v2ClassicSectionTitle',
  {
    defaultMessage: 'Classic rule types',
  }
);

export const V2_ESQL_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.v2EsqlTypeTitle',
  {
    defaultMessage: 'ES|QL',
  }
);

export const V2_ESQL_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.v2EsqlTypeDescription',
  {
    defaultMessage:
      'Write ES|QL queries with episode-based alerts and automatic recovery.',
  }
);

export const V2_THRESHOLD_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.v2ThresholdTypeTitle',
  {
    defaultMessage: 'Threshold',
  }
);

export const V2_THRESHOLD_TYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.stepDefineRule.ruleTypeField.v2ThresholdTypeDescription',
  {
    defaultMessage:
      'Aggregate metrics and alert on thresholds with episode tracking and recovery.',
  }
);
