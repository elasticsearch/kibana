/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { graphlib } from '@dagrejs/dagre';
import { omit } from 'lodash';
import { DEFAULT_WAIT_FOR_APPROVAL_TIMEOUT } from '../../common/wait_for_approval';
import { DEFAULT_LOOP_MAX_ITERATIONS } from '../../spec/schema';
import type {
  BaseStep,
  DataSetStep,
  ElasticsearchStep,
  ForEachStep,
  IfStep,
  KibanaStep,
  LoopBreakStep,
  LoopContinueStep,
  LoopStepProps,
  MaxIterations,
  StepWithForeach,
  StepWithIfCondition,
  StepWithOnFailure,
  SwitchStep,
  TimeoutProp,
  WaitForApprovalStep,
  WaitForInputStep,
  WaitStep,
  WhileStep,
  WorkflowExecuteAsyncStep,
  WorkflowExecuteStep,
  WorkflowFailStep,
  WorkflowOnFailure,
  WorkflowOutputStep,
  WorkflowRetry,
  WorkflowSettings,
  WorkflowYaml,
} from '../../spec/schema';
import type {
  EnterCaseBranchNode,
  EnterConditionBranchNode,
  EnterContinueNode,
  EnterDefaultBranchNode,
  EnterFallbackPathNode,
  EnterForeachNode,
  EnterIfNode,
  EnterNormalPathNode,
  EnterRetryNode,
  EnterSwitchNode,
  EnterTimeoutZoneNode,
  EnterTryBlockNode,
  EnterWhileNode,
  ExitCaseBranchNode,
  ExitConditionBranchNode,
  ExitContinueNode,
  ExitDefaultBranchNode,
  ExitFallbackPathNode,
  ExitForeachNode,
  ExitIfNode,
  ExitNormalPathNode,
  ExitRetryNode,
  ExitSwitchNode,
  ExitTimeoutZoneNode,
  ExitTryBlockNode,
  ExitWhileNode,
  GraphNodeUnion,
  LoopBreakNode,
  LoopContinueNode,
  LoopEnterNode,
  WaitForApprovalGraphNode,
  WaitForInputGraphNode,
  WorkflowGraphType,
  WorkflowOutputGraphNode,
} from '../types';
import { isLoopEnterNode } from '../types';
import { createTypedGraph } from '../workflow_graph/create_typed_graph';

const flowControlStepTypes = new Set([
  'if',
  'foreach',
  'while',
  'loop.break',
  'loop.continue',
  'switch',
]);
const disallowedWorkflowLevelOnFailureSteps = new Set(['wait']);

/** Context used during the graph construction to keep track of settings and avoid cycles */
interface GraphBuildContext {
  /** Workflow settings to be used during nodes construction */
  settings: WorkflowSettings | undefined;

  /**
   * Stack of nodes to keep track of the current position in the graph and avoid cycles
   */
  stack: GraphNodeUnion[];

  /** Used to construct predictable unique node IDs */
  parentKey: string;
}

function getStepId(node: BaseStep, context: GraphBuildContext): string {
  // TODO: This is a workaround for the fact that some steps do not have an `id` field.
  // We should ensure that all steps have an `id` field in the future - either explicitly set or generated from name.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeId = (node as any).id || node.name;
  const parts: string[] = [];

  if (context.parentKey) {
    parts.push(context.parentKey);
  }

  parts.push(nodeId);

  return parts.join('_');
}

function visitAbstractStep(originalStep: BaseStep, context: GraphBuildContext): WorkflowGraphType {
  const currentStep = originalStep;
  if ((currentStep as StepWithOnFailure)['on-failure']) {
    const stepLevelOnFailureGraph = handleStepLevelOnFailure(currentStep, context);

    if (stepLevelOnFailureGraph) {
      return stepLevelOnFailureGraph;
    }
  }

  if (context.settings?.['on-failure']) {
    const workflowLevelOnFailureGraph = handleWorkflowLevelOnFailure(currentStep, context);

    if (workflowLevelOnFailureGraph) {
      return workflowLevelOnFailureGraph;
    }
  }

  return visitTypedAbstractStep(currentStep, context);
}

function tryVisitHitlWaitStep(
  currentStep: BaseStep,
  context: GraphBuildContext
): WorkflowGraphType | undefined {
  if (currentStep.type === 'waitForInput') {
    return visitWaitForInputStep(currentStep as WaitForInputStep, context);
  }

  if (currentStep.type === 'waitForApproval') {
    return visitWaitForApprovalStep(currentStep as WaitForApprovalStep, context);
  }

  return undefined;
}

function visitTypedAbstractStep(
  currentStep: BaseStep,
  context: GraphBuildContext
): WorkflowGraphType {
  if ((currentStep as StepWithIfCondition).if) {
    return createIfGraphForIfStepLevel(currentStep as StepWithIfCondition, context);
  }

  if (currentStep.type === 'if') {
    return createIfGraph(getStepId(currentStep, context), currentStep as IfStep, context);
  }

  if (currentStep.type === 'switch') {
    return createSwitchGraph(getStepId(currentStep, context), currentStep as SwitchStep, context);
  }

  if (currentStep.type === 'loop.break') {
    return visitLoopBreakStep(currentStep as LoopBreakStep, context);
  }

  if (currentStep.type === 'loop.continue') {
    return visitLoopContinueStep(currentStep as LoopContinueStep, context);
  }

  // HITL wait steps are not wrapped in enter-timeout-zone nodes. waitForApproval
  // schedules its approval deadline via handleExecutionDelay; waitForInput has no step timeout.
  const hitlWaitGraph = tryVisitHitlWaitStep(currentStep, context);
  if (hitlWaitGraph) {
    return hitlWaitGraph;
  }

  if ((currentStep as TimeoutProp).timeout) {
    const step = currentStep as BaseStep & TimeoutProp;
    return handleTimeout(
      getStepId(step, context),
      'step_level_timeout',
      step.timeout as string,
      visitAbstractStep(omit(step, ['timeout']) as BaseStep, context),
      context
    );
  }

  if (currentStep.type === 'foreach') {
    return createForeachGraph(getStepId(currentStep, context), currentStep as ForEachStep, context);
  }

  if (currentStep.type === 'while') {
    return createWhileGraph(getStepId(currentStep, context), currentStep as WhileStep, context);
  }

  if ((currentStep as StepWithForeach).foreach) {
    return createForeachGraphForStepWithForeach(currentStep as StepWithForeach, context);
  }

  if (currentStep.type === 'wait') {
    return visitWaitStep(currentStep as WaitStep, context);
  }

  if (currentStep.type === 'data.set') {
    return visitDataSetStep(currentStep as DataSetStep, context);
  }

  if (currentStep.type?.startsWith('elasticsearch.')) {
    return visitElasticsearchStep(currentStep as ElasticsearchStep, context);
  }

  if (currentStep.type?.startsWith('kibana.')) {
    return visitKibanaStep(currentStep as KibanaStep, context);
  }

  if (currentStep.type === 'workflow.execute') {
    return visitWorkflowExecuteStep(currentStep as WorkflowExecuteStep, context);
  }

  if (currentStep.type === 'workflow.executeAsync') {
    return visitWorkflowExecuteAsyncStep(currentStep as WorkflowExecuteAsyncStep, context);
  }

  if (currentStep.type === 'workflow.output') {
    return visitWorkflowOutputStep(currentStep, context);
  }

  if (currentStep.type === 'workflow.fail') {
    const transformedStep: WorkflowOutputStep = {
      ...currentStep,
      type: 'workflow.output',
      status: 'failed',
      with: (currentStep as WorkflowFailStep).with ?? {},
    };
    return visitWorkflowOutputStep(transformedStep, context);
  }

  return visitAtomicStep(currentStep, context);
}

type LeafNodeType =
  | 'atomic'
  | 'wait'
  | 'data.set'
  | 'workflow.execute'
  | 'workflow.executeAsync'
  | `elasticsearch.${string}`
  | `kibana.${string}`;

function createLeafStepGraph(
  currentStep: BaseStep,
  context: GraphBuildContext,
  nodeType: LeafNodeType
): WorkflowGraphType {
  const stepId = getStepId(currentStep, context);
  const graph = createTypedGraph({ directed: true });
  graph.setNode(stepId, {
    id: stepId,
    type: nodeType,
    stepId,
    stepType: currentStep.type,
    configuration: { ...currentStep },
  });
  return graph;
}

export function visitWaitStep(
  currentStep: WaitStep,
  context: GraphBuildContext
): WorkflowGraphType {
  return createLeafStepGraph(currentStep, context, 'wait');
}

export function visitWaitForInputStep(
  currentStep: WaitForInputStep,
  context: GraphBuildContext
): WorkflowGraphType {
  const stepId = getStepId(currentStep, context);
  const graph = createTypedGraph({ directed: true });
  const waitForInputNode: WaitForInputGraphNode = {
    id: stepId,
    type: 'waitForInput',
    stepId,
    stepType: currentStep.type,
    configuration: {
      ...currentStep,
    },
  };
  graph.setNode(waitForInputNode.id, waitForInputNode);

  return graph;
}

export function visitWaitForApprovalStep(
  currentStep: WaitForApprovalStep,
  context: GraphBuildContext
): WorkflowGraphType {
  const stepId = getStepId(currentStep, context);
  const graph = createTypedGraph({ directed: true });
  const waitForApprovalNode: WaitForApprovalGraphNode = {
    id: stepId,
    type: 'waitForApproval',
    stepId,
    stepType: currentStep.type,
    configuration: {
      ...currentStep,
      timeout: currentStep.timeout ?? DEFAULT_WAIT_FOR_APPROVAL_TIMEOUT,
    },
  };
  graph.setNode(waitForApprovalNode.id, waitForApprovalNode);

  return graph;
}

export function visitDataSetStep(
  currentStep: DataSetStep,
  context: GraphBuildContext
): WorkflowGraphType {
  return createLeafStepGraph(currentStep, context, 'data.set');
}

function assertElasticsearchType(type: string): asserts type is `elasticsearch.${string}` {
  if (!type.startsWith('elasticsearch.')) {
    throw new Error(`Expected elasticsearch step type, got: ${type}`);
  }
}

function assertKibanaType(type: string): asserts type is `kibana.${string}` {
  if (!type.startsWith('kibana.')) {
    throw new Error(`Expected kibana step type, got: ${type}`);
  }
}

export function visitElasticsearchStep(
  currentStep: ElasticsearchStep,
  context: GraphBuildContext
): WorkflowGraphType {
  assertElasticsearchType(currentStep.type);
  return createLeafStepGraph(currentStep, context, currentStep.type);
}

export function visitKibanaStep(
  currentStep: KibanaStep,
  context: GraphBuildContext
): WorkflowGraphType {
  assertKibanaType(currentStep.type);
  return createLeafStepGraph(currentStep, context, currentStep.type);
}

export function visitWorkflowExecuteStep(
  currentStep: WorkflowExecuteStep,
  context: GraphBuildContext
): WorkflowGraphType {
  return createLeafStepGraph(currentStep, context, 'workflow.execute');
}

export function visitWorkflowExecuteAsyncStep(
  currentStep: WorkflowExecuteAsyncStep,
  context: GraphBuildContext
): WorkflowGraphType {
  return createLeafStepGraph(currentStep, context, 'workflow.executeAsync');
}

export function visitWorkflowOutputStep(
  currentStep: BaseStep,
  context: GraphBuildContext
): WorkflowGraphType {
  const stepId = getStepId(currentStep, context);
  const graph = createTypedGraph({ directed: true });
  const workflowOutputNode: WorkflowOutputGraphNode = {
    id: stepId,
    type: 'workflow.output',
    stepId,
    stepType: 'workflow.output',
    configuration: currentStep as WorkflowOutputStep,
  };
  graph.setNode(workflowOutputNode.id, workflowOutputNode);
  return graph;
}

export function visitAtomicStep(
  currentStep: BaseStep,
  context: GraphBuildContext
): WorkflowGraphType {
  return createLeafStepGraph(currentStep, context, 'atomic');
}

function createIfGraph(
  stepId: string,
  ifStep: IfStep,
  context: GraphBuildContext
): WorkflowGraphType {
  const graph = createTypedGraph({ directed: true });
  const enterConditionNodeId = `enterCondition_${stepId}`;
  const exitConditionNodeId = `exitCondition_${stepId}`;
  const ifElseStep = ifStep as IfStep;
  const trueSteps: BaseStep[] = ifElseStep.steps || [];
  const falseSteps: BaseStep[] = ifElseStep.else || [];

  const conditionNode: EnterIfNode = {
    id: enterConditionNodeId,
    exitNodeId: exitConditionNodeId,
    type: 'enter-if',
    stepId,
    stepType: ifStep.type,
    configuration: {
      ...omit(ifElseStep, ['steps', 'else']), // No need to include them as they will be represented in the graph
    },
  };
  context.stack.push(conditionNode);
  const exitConditionNode: ExitIfNode = {
    type: 'exit-if',
    id: exitConditionNodeId,
    stepId,
    stepType: ifStep.type,
    startNodeId: enterConditionNodeId,
  };
  const enterThenBranchNode: EnterConditionBranchNode = {
    id: `enterThen_${stepId}`,
    type: 'enter-then-branch',
    condition: ifElseStep.condition,
    stepId,
    stepType: ifStep.type,
  };

  graph.setNode(enterThenBranchNode.id, enterThenBranchNode);
  graph.setEdge(enterConditionNodeId, enterThenBranchNode.id);

  const exitThenBranchNode: ExitConditionBranchNode = {
    id: `exitThen_${stepId}`,
    type: 'exit-then-branch',
    stepType: ifStep.type,
    startNodeId: enterThenBranchNode.id,
    stepId,
  };
  const thenGraph = createStepsSequence(trueSteps, context);
  insertGraphBetweenNodes(graph, thenGraph, enterThenBranchNode.id, exitThenBranchNode.id);
  graph.setNode(exitThenBranchNode.id, exitThenBranchNode);
  graph.setEdge(exitThenBranchNode.id, exitConditionNode.id);

  if (falseSteps?.length > 0) {
    const enterElseBranchNode: EnterConditionBranchNode = {
      id: `enterElse_${stepId}`,
      type: 'enter-else-branch',
      stepId,
      stepType: ifStep.type,
    };
    graph.setNode(enterElseBranchNode.id, enterElseBranchNode);
    graph.setEdge(enterConditionNodeId, enterElseBranchNode.id);
    const exitElseBranchNode: ExitConditionBranchNode = {
      id: `exitElse_${stepId}`,
      type: 'exit-else-branch',
      startNodeId: enterElseBranchNode.id,
      stepId,
      stepType: ifStep.type,
    };
    const elseGraph = createStepsSequence(falseSteps, context);
    insertGraphBetweenNodes(graph, elseGraph, enterElseBranchNode.id, exitElseBranchNode.id);
    graph.setNode(exitElseBranchNode.id, exitElseBranchNode);
    graph.setEdge(exitElseBranchNode.id, exitConditionNode.id);
  }

  graph.setNode(exitConditionNode.id, exitConditionNode);
  graph.setNode(enterConditionNodeId, conditionNode);

  context.stack.pop();
  return graph;
}

function createIfGraphForIfStepLevel(
  stepWithIfCondition: StepWithIfCondition,
  context: GraphBuildContext
) {
  const stepId = getStepId(stepWithIfCondition as BaseStep, context);
  const generatedStepId = `if_${stepId}`;
  const ifStep: IfStep = {
    name: generatedStepId,
    type: 'if',
    condition: stepWithIfCondition.if,
    steps: [omit(stepWithIfCondition, ['if'])],
  } as IfStep;
  return createIfGraph(generatedStepId, ifStep, context);
}

function createSwitchGraph(
  stepId: string,
  switchStep: SwitchStep,
  context: GraphBuildContext
): WorkflowGraphType {
  const graph = createTypedGraph({ directed: true });
  const enterSwitchNodeId = `enterSwitch_${stepId}`;
  const exitSwitchNodeId = `exitSwitch_${stepId}`;

  const enterSwitchNode: EnterSwitchNode = {
    id: enterSwitchNodeId,
    type: 'enter-switch',
    stepId,
    stepType: switchStep.type,
    exitNodeId: exitSwitchNodeId,
    templateDependencies: (switchStep.cases ?? []).map(({ match }) => match),
    configuration: {
      ...omit(switchStep, ['cases', 'default']),
    },
  };
  context.stack.push(enterSwitchNode);
  graph.setNode(enterSwitchNodeId, enterSwitchNode);

  const exitSwitchNode: ExitSwitchNode = {
    type: 'exit-switch',
    id: exitSwitchNodeId,
    stepId,
    stepType: switchStep.type,
    startNodeId: enterSwitchNodeId,
  };
  graph.setNode(exitSwitchNodeId, exitSwitchNode);

  const cases = switchStep.cases || [];
  for (let i = 0; i < cases.length; i++) {
    const caseItem = cases[i];
    const enterCaseId = `enterCase_${stepId}_${i}`;
    const exitCaseId = `exitCase_${stepId}_${i}`;

    const enterCaseNode: EnterCaseBranchNode = {
      id: enterCaseId,
      type: 'enter-case-branch',
      match: caseItem.match,
      index: i,
      stepId,
      stepType: switchStep.type,
    };
    graph.setNode(enterCaseId, enterCaseNode);
    graph.setEdge(enterSwitchNodeId, enterCaseId);

    const exitCaseNode: ExitCaseBranchNode = {
      id: exitCaseId,
      type: 'exit-case-branch',
      startNodeId: enterCaseId,
      stepId,
      stepType: switchStep.type,
    };

    const caseGraph = createStepsSequence(caseItem.steps || [], context);
    insertGraphBetweenNodes(graph, caseGraph, enterCaseId, exitCaseId);
    graph.setNode(exitCaseId, exitCaseNode);
    graph.setEdge(exitCaseId, exitSwitchNodeId);
  }

  if (switchStep.default?.length) {
    const enterDefaultId = `enterDefault_${stepId}`;
    const exitDefaultId = `exitDefault_${stepId}`;

    const enterDefaultNode: EnterDefaultBranchNode = {
      id: enterDefaultId,
      type: 'enter-default-branch',
      stepId,
      stepType: switchStep.type,
    };
    graph.setNode(enterDefaultId, enterDefaultNode);
    graph.setEdge(enterSwitchNodeId, enterDefaultId);

    const exitDefaultNode: ExitDefaultBranchNode = {
      id: exitDefaultId,
      type: 'exit-default-branch',
      startNodeId: enterDefaultId,
      stepId,
      stepType: switchStep.type,
    };

    const defaultGraph = createStepsSequence(switchStep.default, context);
    insertGraphBetweenNodes(graph, defaultGraph, enterDefaultId, exitDefaultId);
    graph.setNode(exitDefaultId, exitDefaultNode);
    graph.setEdge(exitDefaultId, exitSwitchNodeId);
  }

  context.stack.pop();
  return graph;
}

function applyOnFailure(
  stepId: string,
  innerGraph: WorkflowGraphType,
  onFailureConfiguration: WorkflowOnFailure,
  context: GraphBuildContext
): WorkflowGraphType {
  let graph = innerGraph;

  if (onFailureConfiguration.retry) {
    graph = createRetry(stepId, graph, onFailureConfiguration.retry);
  }

  if (onFailureConfiguration.fallback?.length) {
    graph = createFallback(stepId, graph, onFailureConfiguration.fallback, context);
  }

  // Here we can statically determine that 'continue' is needed if "continue" is boolean.
  // If condition is a string (expression), we need to evaluate it at runtime, so we always create the continue node.
  if (
    typeof onFailureConfiguration.continue === 'string' ||
    onFailureConfiguration.continue === true
  ) {
    graph = createContinue(stepId, onFailureConfiguration.continue, graph);
  }

  return graph;
}

function applyIterationGuardrails(
  stepId: string,
  innerGraph: WorkflowGraphType,
  loopStep: LoopStepProps,
  context: GraphBuildContext
): WorkflowGraphType {
  let graph = innerGraph;

  const iterationTimeout = loopStep['iteration-timeout'];
  if (iterationTimeout) {
    graph = handleTimeout(
      `iteration_${stepId}`,
      'step_level_timeout',
      iterationTimeout,
      graph,
      context
    );
  }

  const iterationOnFailure = loopStep['iteration-on-failure'];
  if (iterationOnFailure) {
    graph = applyOnFailure(`iteration_${stepId}`, graph, iterationOnFailure, context);
  }

  return graph;
}

function visitOnFailure(
  currentStep: BaseStep,
  onFailureConfiguration: WorkflowOnFailure,
  context: GraphBuildContext
): WorkflowGraphType {
  const stepId = getStepId(currentStep, context);
  const onFailureGraphNode: GraphNodeUnion = {
    id: `onFailure_${stepId}`,
    type: 'on-failure',
    stepId,
    stepType: 'on-failure',
  };

  context.stack.push(onFailureGraphNode);
  const graph = createStepsSequence(
    [
      {
        ...currentStep,
        'on-failure': undefined, // Remove 'on-failure' to avoid infinite recursion
      } as BaseStep,
    ],
    context
  );

  const result = applyOnFailure(stepId, graph, onFailureConfiguration, context);
  context.stack.pop();

  return result;
}

function handleTimeout(
  stepId: string,
  stepType: 'workflow_level_timeout' | 'step_level_timeout',
  timeout: string,
  innerGraph: graphlib.Graph<GraphNodeUnion>,
  context: GraphBuildContext
): graphlib.Graph<GraphNodeUnion> {
  const enterTimeoutZone: EnterTimeoutZoneNode = {
    id: `enterTimeoutZone_${stepId}`,
    type: 'enter-timeout-zone',
    stepId,
    stepType,
    timeout,
  };
  const exitTimeoutZone: ExitTimeoutZoneNode = {
    id: `exitTimeoutZone_${stepId}`,
    type: 'exit-timeout-zone',
    stepId,
    stepType,
  };
  const graph = new graphlib.Graph<GraphNodeUnion>({ directed: true });
  graph.setNode(enterTimeoutZone.id, enterTimeoutZone);
  graph.setNode(exitTimeoutZone.id, exitTimeoutZone);
  context.stack.push(enterTimeoutZone);
  insertGraphBetweenNodes(graph, innerGraph, enterTimeoutZone.id, exitTimeoutZone.id);
  context.stack.pop();
  return graph;
}

function handleStepLevelOnFailure(
  step: BaseStep,
  context: GraphBuildContext
): graphlib.Graph<GraphNodeUnion> | null {
  const stackEntry: GraphNodeUnion = {
    id: `stepLevelOnFailure_${getStepId(step, context)}`,
    type: 'step-level-on-failure',
    stepId: getStepId(step, context),
    stepType: step.type,
  };
  const onFailureConfiguration = (step as StepWithOnFailure)['on-failure'];
  if (context.stack.some((node) => node.id === stackEntry.id) || !onFailureConfiguration) {
    return null;
  }
  context.stack.push(stackEntry);
  const result = visitOnFailure(step, onFailureConfiguration, context);
  context.stack.pop();
  return result;
}

function handleWorkflowLevelOnFailure(
  step: BaseStep,
  context: GraphBuildContext
): graphlib.Graph<GraphNodeUnion> | null {
  const onFailureConfiguration = context.settings?.['on-failure'];
  if (
    flowControlStepTypes.has(step.type) ||
    disallowedWorkflowLevelOnFailureSteps.has(step.type) ||
    !onFailureConfiguration
  ) {
    return null;
  }

  const stackEntry: GraphNodeUnion = {
    id: `workflowLevelOnFailure_${getStepId(step, { ...context, parentKey: '' })}`,
    type: 'workflow-level-on-failure',
    stepId: getStepId(step, { ...context, parentKey: '' }),
    stepType: step.name,
  };

  if (
    context.stack.some((node) => node.id === stackEntry.id) || // Avoid recursion
    context.stack.some((node) => node.id === `stepLevelOnFailure_${getStepId(step, context)}`) || // Avoid workflow-level on-failure if already in step-level on-failure
    context.stack.some((node) => node.type === 'enter-fallback-path') // Avoid workflow-level on-failure for steps inside fallback path
  ) {
    return null;
  }

  context.stack.push(stackEntry);
  const result = visitOnFailure(step, onFailureConfiguration, context);
  context.stack.pop();
  return result;
}

function createContinue(
  stepId: string,
  condition: string | boolean,
  innerGraph: WorkflowGraphType
): WorkflowGraphType {
  const graph = createTypedGraph({ directed: true });
  const enterContinueNodeId = `enterContinue_${stepId}`;
  const exitNodeId = `exitContinue_${stepId}`;
  const enterContinueNode: EnterContinueNode = {
    id: enterContinueNodeId,
    type: 'enter-continue',
    stepId,
    stepType: 'continue',
    exitNodeId,
    configuration: {
      condition,
    },
  };
  const exitContinueNode: ExitContinueNode = {
    type: 'exit-continue',
    stepId,
    stepType: 'continue',
    id: exitNodeId,
  };
  graph.setNode(enterContinueNode.id, enterContinueNode);
  graph.setNode(exitContinueNode.id, exitContinueNode);
  insertGraphBetweenNodes(graph, innerGraph, enterContinueNode.id, exitContinueNode.id);
  return graph;
}

function createRetry(
  stepId: string,
  innerGraph: WorkflowGraphType,
  retry: WorkflowRetry
): WorkflowGraphType {
  const graph = createTypedGraph({ directed: true });
  const enterRetryNodeId = `enterRetry_${stepId}`;
  const exitNodeId = `exitRetry_${stepId}`;
  const enterRetryNode: EnterRetryNode = {
    id: enterRetryNodeId,
    type: 'enter-retry',
    stepId,
    stepType: 'retry',
    exitNodeId,
    configuration: retry,
  };
  const exitRetryNode: ExitRetryNode = {
    type: 'exit-retry',
    id: exitNodeId,
    stepId,
    stepType: 'retry',
    startNodeId: enterRetryNodeId,
  };
  graph.setNode(enterRetryNode.id, enterRetryNode);
  graph.setNode(exitRetryNode.id, exitRetryNode);
  insertGraphBetweenNodes(graph, innerGraph, enterRetryNode.id, exitRetryNode.id);
  return graph;
}

function createNormalPath(stepId: string, normalPathGraph: WorkflowGraphType): WorkflowGraphType {
  const graph = createTypedGraph({ directed: true });
  const enterNormalPathNodeId = `enterNormalPath_${stepId}`;
  const exitNormalPathNodeId = `exitNormalPath_${stepId}`;
  const enterNormalPathNode: EnterNormalPathNode = {
    id: enterNormalPathNodeId,
    type: 'enter-normal-path',
    stepId,
    stepType: 'fallback',
    enterZoneNodeId: `enterTryBlock_${stepId}`,
    enterFailurePathNodeId: `enterFallbackPath_${stepId}`,
  };
  const exitNormalPathNode: ExitNormalPathNode = {
    id: exitNormalPathNodeId,
    stepId,
    stepType: 'fallback',
    type: 'exit-normal-path',
    enterNodeId: enterNormalPathNodeId,
    exitOnFailureZoneNodeId: `exitTryBlock_${stepId}`,
  };
  graph.setNode(enterNormalPathNode.id, enterNormalPathNode);
  graph.setNode(exitNormalPathNode.id, exitNormalPathNode);

  insertGraphBetweenNodes(graph, normalPathGraph, enterNormalPathNode.id, exitNormalPathNode.id);
  return graph;
}

function createFallbackPath(
  stepId: string,
  fallbackSteps: BaseStep[],
  context: GraphBuildContext
): WorkflowGraphType {
  const workflowLevelOnFailure = context.stack.find(
    (node) => node.type === 'workflow-level-on-failure'
  );
  const graph = createTypedGraph({ directed: true });
  const enterFallbackPathNodeId = `enterFallbackPath_${stepId}`;
  const exitFallbackPathNodeId = `exitFallbackPath_${stepId}`;
  const enterFallbackPathNode: EnterFallbackPathNode = {
    id: enterFallbackPathNodeId,
    stepId,
    stepType: 'fallback',
    type: 'enter-fallback-path',
    enterZoneNodeId: enterFallbackPathNodeId,
  };
  context.stack.push(enterFallbackPathNode);
  const exitFallbackPathNode: ExitFallbackPathNode = {
    id: exitFallbackPathNodeId,
    stepId,
    stepType: 'fallback',
    type: 'exit-fallback-path',
    enterNodeId: enterFallbackPathNodeId,
    exitOnFailureZoneNodeId: `exitTryBlock_${stepId}`,
  };
  graph.setNode(enterFallbackPathNode.id, enterFallbackPathNode);
  graph.setNode(exitFallbackPathNode.id, exitFallbackPathNode);
  const fallbackPathGraph = createStepsSequence(fallbackSteps, {
    ...context,
    parentKey: workflowLevelOnFailure ? [workflowLevelOnFailure.type, stepId].join('_') : '',
  });
  insertGraphBetweenNodes(
    graph,
    fallbackPathGraph,
    enterFallbackPathNode.id,
    exitFallbackPathNode.id
  );
  context.stack.pop();
  return graph;
}

function createFallback(
  stepId: string,
  normalPathGraph: WorkflowGraphType,
  fallbackPathSteps: BaseStep[],
  context: GraphBuildContext
): WorkflowGraphType {
  const graph = createTypedGraph({ directed: true });
  const enterTryBlockNodeId = `enterTryBlock_${stepId}`;
  const exitTryBlockNodeId = `exitTryBlock_${stepId}`;
  const enterNormalPathNodeId = `enterNormalPath_${stepId}`;
  const enterFallbackPathNodeId = `enterFallbackPath_${stepId}`;

  const enterTryBlockNode: EnterTryBlockNode = {
    id: enterTryBlockNodeId,
    exitNodeId: exitTryBlockNodeId,
    stepId,
    stepType: 'fallback',
    type: 'enter-try-block',
    enterNormalPathNodeId,
    enterFallbackPathNodeId,
  };
  graph.setNode(enterTryBlockNodeId, enterTryBlockNode);
  const exitTryBlockNode: ExitTryBlockNode = {
    id: exitTryBlockNodeId,
    type: 'exit-try-block',
    stepId,
    stepType: 'fallback',
    enterNodeId: enterTryBlockNodeId,
  };
  graph.setNode(exitTryBlockNodeId, exitTryBlockNode);

  const normalPathGraphWithNodes = createNormalPath(stepId, normalPathGraph);
  insertGraphBetweenNodes(graph, normalPathGraphWithNodes, enterTryBlockNodeId, exitTryBlockNodeId);

  const fallbackPathGraph = createFallbackPath(stepId, fallbackPathSteps, context);
  insertGraphBetweenNodes(graph, fallbackPathGraph, enterTryBlockNodeId, exitTryBlockNodeId);

  return graph;
}

function createStepsSequence(
  steps: BaseStep[],
  context: GraphBuildContext
): graphlib.Graph<GraphNodeUnion> {
  const graph = createTypedGraph({ directed: true });

  let previousGraph: graphlib.Graph<GraphNodeUnion> | null = null;

  for (let i = 0; i < steps.length; i++) {
    const currentGraph = visitAbstractStep(steps[i], context);
    currentGraph.nodes().forEach((nodeId) => {
      graph.setNode(nodeId, currentGraph.node(nodeId));
    });
    currentGraph.edges().forEach((edgeObj) => {
      graph.setEdge(edgeObj.v, edgeObj.w);
    });

    if (previousGraph) {
      const previousEndNodes = previousGraph
        .nodes()
        .filter((nodeId) => previousGraph?.outEdges(nodeId)?.length === 0);

      const currentStartNodes = currentGraph
        .nodes()
        .filter((nodeId) => currentGraph.inEdges(nodeId)?.length === 0);

      previousEndNodes.forEach((endNode) => {
        currentStartNodes.forEach((startNode) => {
          graph.setEdge(endNode, startNode);
        });
      });
    }

    previousGraph = currentGraph;
  }

  return graph;
}

function insertGraphBetweenNodes(
  graph: WorkflowGraphType,
  subGraph: WorkflowGraphType,
  startNodeId: string,
  endNodeId: string
): void {
  // Find all start nodes (no incoming edges) and end nodes (no outgoing edges)
  const startNodes = subGraph.nodes().filter((nodeId) => subGraph.inEdges(nodeId)?.length === 0);
  const endNodes = subGraph.nodes().filter((nodeId) => subGraph.outEdges(nodeId)?.length === 0);

  // Connect all start nodes to the main start node
  startNodes.forEach((startNode) => {
    graph.setEdge(startNodeId, startNode);
  });

  // Connect all end nodes to the main end node
  endNodes.forEach((endNode) => {
    graph.setEdge(endNode, endNodeId);
  });

  // Copy all nodes from subGraph to the main graph
  subGraph.nodes().forEach((nodeId) => {
    graph.setNode(nodeId, subGraph.node(nodeId));
  });

  // Copy all edges from subGraph to the main graph
  subGraph.edges().forEach((edgeObj) => {
    graph.setEdge(edgeObj.v, edgeObj.w);
  });
}

function normalizeMaxIterations(raw?: MaxIterations): {
  maxIterations: number;
  onLimit: 'continue' | 'fail';
} {
  if (raw == null) return { maxIterations: DEFAULT_LOOP_MAX_ITERATIONS, onLimit: 'continue' };
  if (typeof raw === 'number') return { maxIterations: raw, onLimit: 'continue' };
  return { maxIterations: raw.limit, onLimit: raw['on-limit'] };
}

function createForeachGraph(
  stepId: string,
  foreachStep: ForEachStep,
  context: GraphBuildContext
): WorkflowGraphType {
  const graph = createTypedGraph({ directed: true });
  const enterForeachNodeId = `enterForeach_${stepId}`;
  const exitNodeId = `exitForeach_${stepId}`;
  const enterForeachNode: EnterForeachNode = {
    id: enterForeachNodeId,
    type: 'enter-foreach',
    stepId,
    stepType: foreachStep.type,
    exitNodeId,
    configuration: {
      ...omit(foreachStep, ['steps']), // No need to include them as they will be represented in the graph
    },
  };
  context.stack.push(enterForeachNode);
  graph.setNode(enterForeachNodeId, enterForeachNode);
  const { maxIterations, onLimit } = normalizeMaxIterations(foreachStep['max-iterations']);
  const exitForeachNode: ExitForeachNode = {
    type: 'exit-foreach',
    id: exitNodeId,
    stepType: foreachStep.type,
    stepId,
    startNodeId: enterForeachNodeId,
    maxIterations,
    onLimit,
  };
  graph.setNode(exitNodeId, exitForeachNode);
  let innerGraph = createStepsSequence(foreachStep.steps || [], context);
  innerGraph = applyIterationGuardrails(stepId, innerGraph, foreachStep, context);

  insertGraphBetweenNodes(graph, innerGraph, enterForeachNodeId, exitNodeId);
  context.stack.pop();
  return graph;
}

function createForeachGraphForStepWithForeach(
  stepWithForeach: StepWithForeach,
  context: GraphBuildContext
) {
  const stepId = getStepId(stepWithForeach as BaseStep, context);
  const generatedStepId = `foreach_${stepId}`;
  const foreachStep: ForEachStep = {
    name: generatedStepId,
    type: 'foreach',
    foreach: stepWithForeach.foreach,
    steps: [omit(stepWithForeach, ['foreach'])],
  } as ForEachStep;
  return createForeachGraph(generatedStepId, foreachStep, context);
}

function createWhileGraph(
  stepId: string,
  whileStep: WhileStep,
  context: GraphBuildContext
): WorkflowGraphType {
  const graph = createTypedGraph({ directed: true });
  const enterWhileNodeId = `enterWhile_${stepId}`;
  const exitNodeId = `exitWhile_${stepId}`;
  const enterWhileNode: EnterWhileNode = {
    id: enterWhileNodeId,
    type: 'enter-while',
    stepId,
    stepType: whileStep.type,
    exitNodeId,
    configuration: {
      ...omit(whileStep, ['steps']),
    },
  };
  context.stack.push(enterWhileNode);
  graph.setNode(enterWhileNodeId, enterWhileNode);
  const { maxIterations, onLimit } = normalizeMaxIterations(whileStep['max-iterations']);
  const exitWhileNode: ExitWhileNode = {
    type: 'exit-while',
    id: exitNodeId,
    stepType: whileStep.type,
    stepId,
    startNodeId: enterWhileNodeId,
    condition: whileStep.condition,
    maxIterations,
    onLimit,
  };
  graph.setNode(exitNodeId, exitWhileNode);
  let innerGraph = createStepsSequence(whileStep.steps || [], context);
  innerGraph = applyIterationGuardrails(stepId, innerGraph, whileStep, context);

  insertGraphBetweenNodes(graph, innerGraph, enterWhileNodeId, exitNodeId);
  context.stack.pop();
  return graph;
}

function findEnclosingLoop(context: GraphBuildContext): LoopEnterNode {
  for (let i = context.stack.length - 1; i >= 0; i--) {
    const node = context.stack[i];
    if (isLoopEnterNode(node)) {
      return node;
    }
  }
  throw new Error(
    'loop.break and loop.continue are only valid inside a loop body (foreach or while). ' +
      'Move the step inside a loop, or remove it.'
  );
}

function visitLoopBreakStep(
  currentStep: LoopBreakStep,
  context: GraphBuildContext
): WorkflowGraphType {
  const enclosingLoop = findEnclosingLoop(context);
  const stepId = getStepId(currentStep, context);
  const graph = createTypedGraph({ directed: true });

  const { exitNodeId: loopExitNodeId } = enclosingLoop;

  const loopBreakNode: LoopBreakNode = {
    id: stepId,
    type: 'loop-break',
    stepId,
    stepType: currentStep.type,
    loopExitNodeId,
    loopStepId: enclosingLoop.stepId,
  };
  graph.setNode(loopBreakNode.id, loopBreakNode);
  return graph;
}

function visitLoopContinueStep(
  currentStep: LoopContinueStep,
  context: GraphBuildContext
): WorkflowGraphType {
  const enclosingLoop = findEnclosingLoop(context);
  const stepId = getStepId(currentStep, context);
  const graph = createTypedGraph({ directed: true });

  const { exitNodeId: loopExitNodeId } = enclosingLoop;

  const loopContinueNode: LoopContinueNode = {
    id: stepId,
    type: 'loop-continue',
    stepId,
    stepType: currentStep.type,
    loopExitNodeId,
  };
  graph.setNode(loopContinueNode.id, loopContinueNode);
  return graph;
}

export function convertToWorkflowGraph(
  workflowSchema: WorkflowYaml,
  defaultSettings?: WorkflowSettings
): graphlib.Graph<GraphNodeUnion> {
  const resolvedSettings = resolveWorklfowSettings(workflowSchema.settings, defaultSettings);
  const context: GraphBuildContext = {
    settings: resolvedSettings,
    stack: [],
    parentKey: '',
  };

  let finalGraph = createStepsSequence(workflowSchema.steps, context);

  if (resolvedSettings?.timeout) {
    finalGraph = handleTimeout(
      'workflow_level_timeout',
      'workflow_level_timeout',
      resolvedSettings.timeout,
      finalGraph,
      context
    );
  }

  return finalGraph;
}

function resolveWorklfowSettings(
  workflowSettings?: WorkflowSettings,
  defaultSettings?: WorkflowSettings
): WorkflowSettings | undefined {
  if (!defaultSettings) {
    return workflowSettings;
  }

  if (!workflowSettings) {
    return defaultSettings;
  }

  return {
    ...workflowSettings,
    timeout: workflowSettings.timeout ?? defaultSettings.timeout,
    'on-failure': workflowSettings['on-failure'] ?? defaultSettings['on-failure'],
    timezone: workflowSettings.timezone ?? defaultSettings.timezone,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertToSerializableGraph(graph: graphlib.Graph): any {
  return graphlib.json.write(graph); // GraphLib does not provide type information, so we use `any`
}
