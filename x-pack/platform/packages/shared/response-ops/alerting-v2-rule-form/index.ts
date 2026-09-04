/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Compose Discover flyout — stepped Edit Form + Discover Sandbox
export { ComposeDiscoverFlyout } from './flyout/compose_discover';
export type { ComposeDiscoverFlyoutProps } from './flyout/compose_discover';
export type { ComposeDiscoverMode } from './flyout/compose_discover/types';

// Rule Builder registry
export {
  RULE_BUILDER_REGISTRY,
  getRuleBuilderCreateOptions,
  registerRuleBuilder,
  useBuilderState,
} from './flyout/compose_discover/rule_builder';
export type {
  BuilderState,
  BuilderSubmission,
  RuleBuilderCreateOption,
  RuleBuilderCreateOptionItem,
  RuleBuilderDefinition,
  RuleBuilderStepProps,
} from './flyout/compose_discover/rule_builder';

// Compose Discover sandbox — embeddable ES|QL editor + results panel (props-only)
export { QuerySandboxFlyout } from './flyout/compose_discover';
export type { QuerySandboxFlyoutProps, QueryTab } from './flyout/compose_discover';

// Embeddable query sandbox — self-contained ES|QL editor + data fetching + results
export { QuerySandbox } from './flyout/compose_discover';
export type { QuerySandboxProps } from './flyout/compose_discover';

// Constants
export { RULE_FORM_ID, DEFAULT_RULE_NAME } from './form/constants';

// Context - for consumers who need custom integrations
export { RuleFormProvider, useRuleFormServices, useRuleFormMeta } from './form';

// Mappers
export {
  deriveAlertDelayModeFromStateTransition,
  deriveRecoveryDelayModeFromStateTransition,
  mapFormValuesToRuleRequest,
  mapFormValuesToCreateRequest,
  mapFormValuesToUpdateRequest,
  mapRuleResponseToFormValues,
} from './form';

// Field groups — for composing custom form layouts
export { RuleDetailsFieldGroup } from './form';

// Query helpers
export { getBreachQuery, getRecoverQuery } from './form';

// Types
export type {
  FormValues,
  StateTransitionDelayMode,
  RuleFormServices,
  RuleFormMeta,
  RuleFormLayout,
  RuleRequestCommon,
  RuleNotificationsValue,
  RuleQuery,
  ComposedQuery,
  StandaloneQuery,
  RuleKind,
} from './form';

export {
  buildInlineWorkflowYaml,
  buildRuleScopedMatcher,
  InlineWorkflowEditor,
  INLINE_ACTION_STEP_DEFINITIONS,
  getInlineActionStepDefinition,
  getDefaultInlineActionStepDefinition,
  isActionValid,
  isExplicitlyLinkedToRule,
  isRuleScopedCatchAllMatcher,
  summarizeExplicitlyLinkedActionPolicies,
} from './actions_form';
export type {
  ActionDraft,
  LinkedActionPolicySummary,
  InlineActionStepDefinition,
  InlineActionStepType,
  InlineWorkflowActionDraft,
} from './actions_form';
export { useMatchedActionPolicies } from './flyout/compose_discover/compose_discover_form/use_matched_action_policies';
export type { UseMatchedActionPoliciesResult } from './flyout/compose_discover/compose_discover_form/use_matched_action_policies';

// Threshold rule-builder ES|QL parser + types — consumed by the episode trend chart
export { parseThresholdEsql } from './flyout/compose_discover/rule_builder/threshold/parse_esql';
export {
  Aggregation,
  Comparator,
} from './flyout/compose_discover/rule_builder/threshold/form_types';
export type {
  ThresholdFormValues,
  StatDefinition,
  EvaluationDefinition,
  AlertCondition,
  ConditionOperator,
} from './flyout/compose_discover/rule_builder/threshold/form_types';

export {
  resolveDashboardsByIds,
  searchRelatedDashboard,
} from './form/field_groups/search_related_dashboards';
export type {
  Dashboard,
  MissingDashboard,
  ResolveDashboardsResult,
} from './form/field_groups/search_related_dashboards';
export { partitionArtifactsByDashboardType } from './form/field_groups/dashboard_artifact_selection';
export { mapArtifacts } from './form/utils/artifact_mappers';
export type { RuleArtifactPayload } from './form/utils/artifact_mappers';
export { getRunbookContent, getDashboardId } from './form';
export type { RunbookArtifactData, DashboardArtifactData } from './form';

export { composeFormToCreateRequest } from './flyout/compose_discover/compose_mappers';

// Sequence builder
export type { SequenceFormValues, SequenceRule, HopWindow } from './sequence/form_types';
export {
  RULE_DRAG_MIME_TYPE,
  generateStepId,
  DEFAULT_SEQUENCE_FORM_VALUES,
  isSequenceValid,
  totalLookbackSeconds,
  getCommonGroupingFields,
  formatLookbackString,
} from './sequence/form_types';
export { buildSequenceRuleQueryData } from './sequence/build_esql';
export { SequenceNode } from './sequence/sequence_node';
export type { SequenceNodeType } from './sequence/sequence_node';
export { SequenceEdge, WINDOW_OPTIONS } from './sequence/sequence_edge';
export type { SequenceEdgeType } from './sequence/sequence_edge';
export { layoutSequence } from './sequence/layout_sequence';
