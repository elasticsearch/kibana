/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  FormValues,
  StateTransitionDelayMode,
  RuleNotificationsValue,
  RuleQuery,
  ComposedQuery,
  StandaloneQuery,
  RuleKind,
} from './types';
export { getBreachQuery, getRecoverQuery } from './utils/query_helpers';
export {
  deriveAlertDelayModeFromStateTransition,
  deriveRecoveryDelayModeFromStateTransition,
} from './utils/state_transition_helpers';
export type { RuleFormServices, RuleFormMeta, RuleFormLayout } from './contexts';
export { RuleFormProvider, useRuleFormServices, useRuleFormMeta } from './contexts';
export {
  mapFormValuesToRuleRequest,
  mapFormValuesToCreateRequest,
  mapFormValuesToUpdateRequest,
  mapRuleResponseToFormValues,
} from './utils/rule_request_mappers';
export type { RuleRequestCommon } from './utils/rule_request_mappers';
export { isNonRepresentableRule } from './utils/is_non_representable';

// Field groups — for composing custom form layouts
export { RuleDetailsFieldGroup } from './field_groups/rule_details_field_group';
export { ConditionFieldGroup } from './field_groups/condition_field_group';
export { RuleExecutionFieldGroup } from './field_groups/rule_execution_field_group';

// Fields & components — for composing custom form layouts
export { KindField } from './fields/kind_field';
export { RulePreviewPanel } from './fields/rule_preview_panel';
export { DurationInput } from './fields/duration_input';
export type { DurationInputProps } from './fields/duration_input';
export { SubmissionButtons } from './components/submission_buttons';
export type { SubmissionButtonsProps } from './components/submission_buttons';
export { ErrorCallOut } from './error_callout';

// Hooks
export { useFormDefaults } from './hooks/use_form_defaults';

// Constants
export { RULE_FORM_ID, DEFAULT_RULE_NAME } from './constants';
