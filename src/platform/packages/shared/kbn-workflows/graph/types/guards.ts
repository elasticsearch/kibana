/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  AtomicGraphNode,
  DataSetGraphNode,
  ElasticsearchGraphNode,
  KibanaGraphNode,
  WaitForApprovalGraphNode,
  WaitForInputGraphNode,
  WaitGraphNode,
  WorkflowOutputGraphNode,
} from './nodes/base';
import type {
  EnterConditionBranchNode,
  EnterIfNode,
  ExitConditionBranchNode,
  ExitIfNode,
} from './nodes/branching_nodes';
import type { LoopBreakNode, LoopContinueNode } from './nodes/flow_control_nodes';
import type {
  EnterForeachNode,
  EnterWhileNode,
  ExitForeachNode,
  ExitWhileNode,
} from './nodes/loop_nodes';
import type {
  EnterContinueNode,
  EnterNormalPathNode,
  EnterRetryNode,
  EnterTimeoutZoneNode,
  EnterTryBlockNode,
  ExitContinueNode,
  ExitNormalPathNode,
  ExitRetryNode,
  ExitTimeoutZoneNode,
  ExitTryBlockNode,
} from './nodes/on_failure_nodes';
import type {
  EnterCaseBranchNode,
  EnterDefaultBranchNode,
  EnterSwitchNode,
  ExitCaseBranchNode,
  ExitDefaultBranchNode,
  ExitSwitchNode,
} from './nodes/switch_nodes';
import type { GraphNodeUnion } from './nodes/union';
import type { LoopStepType } from '../../spec/schema';
import { LoopStepTypes } from '../../spec/schema';

export const isAtomic = (node: GraphNodeUnion): node is AtomicGraphNode => node.type === 'atomic';

export const isElasticsearch = (node: GraphNodeUnion): node is ElasticsearchGraphNode =>
  node.type.startsWith('elasticsearch.');

export const isKibana = (node: GraphNodeUnion): node is KibanaGraphNode =>
  node.type.startsWith('kibana.');

export const isWait = (node: GraphNodeUnion): node is WaitGraphNode => node.type === 'wait';

export const isWaitForInput = (node: GraphNodeUnion): node is WaitForInputGraphNode =>
  node.type === 'waitForInput';

export const isWaitForApproval = (node: GraphNodeUnion): node is WaitForApprovalGraphNode =>
  node.type === 'waitForApproval';

export const isDataSet = (node: GraphNodeUnion): node is DataSetGraphNode =>
  node.type === 'data.set';

export const isWorkflowOutput = (node: GraphNodeUnion): node is WorkflowOutputGraphNode =>
  node.type === 'workflow.output';

export const isEnterIf = (node: GraphNodeUnion): node is EnterIfNode => node.type === 'enter-if';

export const isExitIf = (node: GraphNodeUnion): node is ExitIfNode => node.type === 'exit-if';

export const isEnterConditionBranch = (node: GraphNodeUnion): node is EnterConditionBranchNode =>
  node.type === 'enter-condition-branch';

export const isExitConditionBranch = (node: GraphNodeUnion): node is ExitConditionBranchNode =>
  node.type === 'exit-condition-branch';

export const isEnterForeach = (node: GraphNodeUnion): node is EnterForeachNode =>
  node.type === 'enter-foreach';

export const isExitForeach = (node: GraphNodeUnion): node is ExitForeachNode =>
  node.type === 'exit-foreach';

export const isEnterWhile = (node: GraphNodeUnion): node is EnterWhileNode =>
  node.type === 'enter-while';

export type LoopEnterNode = Extract<GraphNodeUnion, { type: `enter-${LoopStepType}` }>;
const loopEnterNodeTypes = new Set(LoopStepTypes.map((t) => `enter-${t}`));
export const isLoopEnterNode = (node: GraphNodeUnion): node is LoopEnterNode =>
  loopEnterNodeTypes.has(node.type);

export const isExitWhile = (node: GraphNodeUnion): node is ExitWhileNode =>
  node.type === 'exit-while';

export const isEnterRetry = (node: GraphNodeUnion): node is EnterRetryNode =>
  node.type === 'enter-retry';

export const isExitRetry = (node: GraphNodeUnion): node is ExitRetryNode =>
  node.type === 'exit-retry';

export const isEnterContinue = (node: GraphNodeUnion): node is EnterContinueNode =>
  node.type === 'enter-continue';

export const isExitContinue = (node: GraphNodeUnion): node is ExitContinueNode =>
  node.type === 'exit-continue';

export const isEnterTryBlock = (node: GraphNodeUnion): node is EnterTryBlockNode =>
  node.type === 'enter-try-block';

export const isExitTryBlock = (node: GraphNodeUnion): node is ExitTryBlockNode =>
  node.type === 'exit-try-block';

export const isEnterNormalPath = (node: GraphNodeUnion): node is EnterNormalPathNode =>
  node.type === 'enter-normal-path';

export const isExitNormalPath = (node: GraphNodeUnion): node is ExitNormalPathNode =>
  node.type === 'exit-normal-path';

export const isEnterWorkflowTimeoutZone = (node: GraphNodeUnion): node is EnterTimeoutZoneNode =>
  node.type === 'enter-timeout-zone' && node.stepType === 'workflow_level_timeout';

export const isExitWorkflowTimeoutZone = (node: GraphNodeUnion): node is ExitTimeoutZoneNode =>
  node.type === 'exit-timeout-zone' && node.stepType === 'workflow_level_timeout';

export const isEnterStepTimeoutZone = (node: GraphNodeUnion): node is EnterTimeoutZoneNode =>
  node.type === 'enter-timeout-zone' && node.stepType !== 'workflow_level_timeout';

export const isExitStepTimeoutZone = (node: GraphNodeUnion): node is ExitTimeoutZoneNode =>
  node.type === 'exit-timeout-zone' && node.stepType !== 'workflow_level_timeout';

export const isEnterSwitch = (node: GraphNodeUnion): node is EnterSwitchNode =>
  node.type === 'enter-switch';

export const isExitSwitch = (node: GraphNodeUnion): node is ExitSwitchNode =>
  node.type === 'exit-switch';

export const isEnterCaseBranch = (node: GraphNodeUnion): node is EnterCaseBranchNode =>
  node.type === 'enter-case-branch';

export const isExitCaseBranch = (node: GraphNodeUnion): node is ExitCaseBranchNode =>
  node.type === 'exit-case-branch';

export const isEnterDefaultBranch = (node: GraphNodeUnion): node is EnterDefaultBranchNode =>
  node.type === 'enter-default-branch';

export const isExitDefaultBranch = (node: GraphNodeUnion): node is ExitDefaultBranchNode =>
  node.type === 'exit-default-branch';
export const isLoopBreak = (node: GraphNodeUnion): node is LoopBreakNode =>
  node.type === 'loop-break';

export const isLoopContinue = (node: GraphNodeUnion): node is LoopContinueNode =>
  node.type === 'loop-continue';

/**
 * Returns true for step types whose inner steps have guaranteed execution
 * before certain fields (e.g. `condition`) are evaluated, making inner step
 * outputs available for autocomplete suggestions.
 *
 * Currently applies to `while` (do-while semantics: body runs before condition).
 */
export const shouldSuggestInnerSteps = (node: GraphNodeUnion): boolean => isEnterWhile(node);
