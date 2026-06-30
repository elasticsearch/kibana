/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export * from './spec/lib/build_fields_zod_validator';
export * from './spec/lib/build_step_schema_for_agent';
export * from './spec/lib/generate_yaml_schema_from_connectors';
export * from './spec/lib/get_workflow_json_schema';
export { getElasticsearchConnectors } from './spec/elasticsearch';
export { getKibanaConnectors } from './spec/kibana';
export { resolveKibanaStepTypeAlias } from './spec/kibana/aliases';
export * from './spec/schema';
export { builtInStepDefinitions, getBuiltInStepDefinition } from './spec/builtin_step_definitions';
export type { BuiltInStepDefinition } from './spec/builtin_step_definitions';
export {
  builtInTriggerDefinitions,
  getBuiltInTriggerDefinition,
} from './spec/builtin_trigger_definitions';
export {
  builtinWorkflowInputDefinitions,
  builtinWorkflowInputDefinitionRefValuesForZod,
  KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX,
  mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema,
} from './spec/builtin_workflow_input_definitions';
export type {
  BaseTriggerDefinition,
  TriggerDocumentation,
} from './spec/builtin_trigger_definitions';
export {
  WORKFLOW_EXAMPLES,
  WORKFLOW_EXAMPLE_IDS,
  getWorkflowExamples,
  getWorkflowExample,
  getWorkflowExamplesDir,
} from './spec/examples';
export type { WorkflowExampleEntry } from './spec/examples';
export { StepCategory, StepCategories } from './spec/step_definition_types';
export type { BaseStepDefinition, StepDocumentation } from './spec/step_definition_types';
export * from './spec/deprecated_step_metadata';
export * from './types/latest';
export * from './types/utils';
export * from './common/constants';
export * from './common/workflows_events';
export type * from './common/event_trigger_replay';
export * from './common/well_known_trigger_sources';
export type { WorkflowExecutionEventDispatchMetadata } from './common/workflow_execution_schedule_metadata';
export * from './common/privileges';
export * from './common/utils';
export * from './common/step_types';
export * from './definition';
export * from './graph_layout';
export * from './common/elasticsearch_request_builder';
export * from './common/kibana_request_builder';
export * from './server/constants';
export * from './server/repositories/workflow_repository';

// Trigger schemas
export {
  AlertRuleTriggerSchema,
  ScheduledTriggerSchema,
  SCHEDULED_INTERVAL_ERROR,
  SCHEDULED_INTERVAL_PATTERN,
  ManualTriggerSchema,
  TriggerSchema,
  getTriggerSchema,
  TriggerTypes,
  WORKFLOW_EVENTS_VALUES_SET,
  WorkflowEventsSchema,
  type TriggerType,
  type WorkflowEventsValue,
} from './spec/schema/triggers';

// Export specific types that are commonly used
export type { BuiltInStepType } from './spec/schema';
