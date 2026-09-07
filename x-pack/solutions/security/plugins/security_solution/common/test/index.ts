/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import serverlessRoleDefinitions from '@kbn/es/src/serverless_resources/security_roles.json';
import essRoleDefinitions from './ess_roles.json';

type ServerlessSecurityRoleName = keyof typeof serverlessRoleDefinitions;
type EssSecurityRoleName = keyof typeof essRoleDefinitions;

export const KNOWN_SERVERLESS_ROLE_DEFINITIONS = serverlessRoleDefinitions;
export const KNOWN_ESS_ROLE_DEFINITIONS = essRoleDefinitions;

export type SecurityRoleName = ServerlessSecurityRoleName | EssSecurityRoleName;

export enum ROLES {
  // Serverless roles
  t1_analyst = 't1_analyst',
  t2_analyst = 't2_analyst',
  t3_analyst = 't3_analyst',
  rule_author = 'rule_author',
  soc_manager = 'soc_manager',
  detections_admin = 'detections_admin',
  platform_engineer = 'platform_engineer',
  // ESS roles
  admin = 'admin',
  reader = 'reader',
  hunter = 'hunter',
  hunter_no_actions = 'hunter_no_actions',
  no_risk_engine_privileges = 'no_risk_engine_privileges',
  timeline_none = 'timeline_none',
  notes_none = 'notes_none',
  rules_read_exceptions_all = 'rules_read_exceptions_all',
  rules_read_exceptions_read = 'rules_read_exceptions_read',
  // Rules subfeature roles (V4)
  rules_read_investigation_guide_all = 'rules_read_investigation_guide_all',
  rules_read_custom_highlighted_fields_all = 'rules_read_custom_highlighted_fields_all',
  rules_read_enable_disable_all = 'rules_read_enable_disable_all',
  rules_read_manual_run_all = 'rules_read_manual_run_all',
  rules_read_rules_management_settings_all = 'rules_read_rules_management_settings_all',
  rules_all_enable_disable_none = 'rules_all_enable_disable_none',
  rules_all_exceptions_none = 'rules_all_exceptions_none',
  rules_all_investigation_guide_none = 'rules_all_investigation_guide_none',
  rules_all_custom_highlighted_fields_none = 'rules_all_custom_highlighted_fields_none',
  rules_all_exceptions_all = 'rules_all_exceptions_all',
  rules_all_manual_run_none = 'rules_all_manual_run_none',
  rules_all_rules_management_settings_none = 'rules_all_rules_management_settings_none',
  rules_read_subfeatures_all = 'rules_read_subfeatures_all',
  rules_all_preview_index = 'rules_all_preview_index',
}

/**
 * Provides a map of the commonly used date ranges found under the Quick Menu popover of the
 * super date picker component.
 */
export const DATE_RANGE_OPTION_TO_TEST_SUBJ_MAP = Object.freeze({
  Today: 'superDatePickerCommonlyUsed_Today',
  'This week': 'superDatePickerCommonlyUsed_This_week',
  'Last 15 minutes': 'superDatePickerCommonlyUsed_Last_15 minutes',
  'Last 30 minutes': 'superDatePickerCommonlyUsed_Last_30 minutes',
  'Last 1 hour': 'superDatePickerCommonlyUsed_Last_1 hour',
  'Last 24 hours': 'superDatePickerCommonlyUsed_Last_24 hours',
  'Last 7 days': 'superDatePickerCommonlyUsed_Last_7 days',
  'Last 30 days': 'superDatePickerCommonlyUsed_Last_30 days',
  'Last 90 days': 'superDatePickerCommonlyUsed_Last_90 days',
  'Last 1 year': 'superDatePickerCommonlyUsed_Last_1 year',
});
