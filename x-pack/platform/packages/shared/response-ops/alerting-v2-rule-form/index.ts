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
export { RULE_BUILDER_REGISTRY } from './flyout/compose_discover/rule_builder';
export type { BuilderState } from './flyout/compose_discover/rule_builder';

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

export { buildInlineWorkflowYaml } from './actions_form';
export type { ActionDraft } from './actions_form';
