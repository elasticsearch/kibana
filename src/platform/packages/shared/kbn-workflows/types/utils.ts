/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ConnectorContractUnion,
  DynamicConnectorContract,
  EsWorkflowCreate,
  HttpMethod,
  InternalConnectorContract,
  StepStabilityLevel,
  WorkflowStepExecutionDto,
} from './v1';
import { ExecutionStatus, KNOWN_HTTP_METHODS, TerminalExecutionStatuses } from './v1';
import { getBuiltInStepDefinition } from '../spec/builtin_step_definitions';
import type {
  BuiltInStepProperty,
  BuiltInStepType,
  ElasticsearchStep,
  ForEachStep,
  IfStep,
  KibanaStep,
  MergeStep,
  ParallelStep,
  Step,
  SwitchStep,
  WaitStep,
  WhileStep,
  WorkflowYaml,
} from '../spec/schema';
import { BuiltInStepProperties, BuiltInStepTypes } from '../spec/schema';
import type { TriggerType } from '../spec/schema/triggers';
import { TriggerTypes } from '../spec/schema/triggers';

export function transformWorkflowYamlJsontoEsWorkflow(
  workflowDefinition: WorkflowYaml
): EsWorkflowCreate {
  // TODO: handle merge, if, foreach, etc.

  return {
    name: workflowDefinition.name,
    description: workflowDefinition.description,
    tags: workflowDefinition.tags ?? [],
    enabled: workflowDefinition.enabled,
    definition: workflowDefinition,
    valid: true,
  };
}

export function isInProgressStatus(status: ExecutionStatus) {
  return (
    status === ExecutionStatus.RUNNING ||
    status === ExecutionStatus.PENDING ||
    status === ExecutionStatus.QUEUED ||
    status === ExecutionStatus.WAITING ||
    status === ExecutionStatus.WAITING_FOR_INPUT ||
    status === ExecutionStatus.WAITING_FOR_CHILD
  );
}

export function isDangerousStatus(status: ExecutionStatus) {
  return status === ExecutionStatus.FAILED || status === ExecutionStatus.CANCELLED;
}

export function isTerminalStatus(status: ExecutionStatus) {
  return TerminalExecutionStatuses.includes(status);
}

export function isFailedBeforeSteps(
  status: ExecutionStatus,
  stepExecutions: WorkflowStepExecutionDto[]
) {
  return status === ExecutionStatus.FAILED && stepExecutions.length === 0;
}

// Type guards for steps types
export const isWaitStep = (step: Step): step is WaitStep => step.type === 'wait';
export const isElasticsearchStep = (step: Step): step is ElasticsearchStep =>
  step.type === 'elasticsearch';
export const isKibanaStep = (step: Step): step is KibanaStep => step.type === 'kibana';
export const isForeachStep = (step: Step): step is ForEachStep => step.type === 'foreach';
export const isWhileStep = (step: Step): step is WhileStep => step.type === 'while';
export const isIfStep = (step: Step): step is IfStep => step.type === 'if';
export const isParallelStep = (step: Step): step is ParallelStep => step.type === 'parallel';
export const isMergeStep = (step: Step): step is MergeStep => step.type === 'merge';
export const isSwitchStep = (step: Step): step is SwitchStep => step.type === 'switch';
export const isBuiltInStepType = (type: string): type is BuiltInStepType =>
  BuiltInStepTypes.includes(type as BuiltInStepType);
export const isTriggerType = (type: string): type is TriggerType =>
  TriggerTypes.includes(type as TriggerType);

export const isInternalConnector = (
  connector: ConnectorContractUnion
): connector is InternalConnectorContract => 'methods' in connector;

export const isDynamicConnector = (
  connector: ConnectorContractUnion
): connector is DynamicConnectorContract => 'actionTypeId' in connector;

export const isHttpMethod = (method: string): method is HttpMethod =>
  KNOWN_HTTP_METHODS.includes(method as HttpMethod);

export const isBuiltInStepProperty = (property: string): property is BuiltInStepProperty =>
  BuiltInStepProperties.includes(property as BuiltInStepProperty);

export const getBuiltInStepStability = (type: string): StepStabilityLevel | undefined =>
  getBuiltInStepDefinition(type)?.stability;
