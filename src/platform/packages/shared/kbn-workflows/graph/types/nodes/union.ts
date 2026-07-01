/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import {
  AtomicGraphNodeSchema,
  DataSetGraphNodeSchema,
  ElasticsearchGraphNodeSchema,
  KibanaGraphNodeSchema,
  WaitForApprovalGraphNodeSchema,
  WaitForInputGraphNodeSchema,
  WaitGraphNodeSchema,
  WorkflowExecuteAsyncGraphNodeSchema,
  WorkflowExecuteGraphNodeSchema,
  WorkflowOutputGraphNodeSchema,
} from './base';
import {
  EnterConditionBranchNodeSchema,
  EnterIfNodeSchema,
  ExitConditionBranchNodeSchema,
  ExitIfNodeSchema,
} from './branching_nodes';
import { LoopBreakNodeSchema, LoopContinueNodeSchema } from './flow_control_nodes';
import {
  EnterForeachNodeSchema,
  EnterWhileNodeSchema,
  ExitForeachNodeSchema,
  ExitWhileNodeSchema,
} from './loop_nodes';
import {
  EnterContinueNodeSchema,
  EnterFallbackPathNodeSchema,
  EnterNormalPathNodeSchema,
  EnterRetryNodeSchema,
  EnterTimeoutZoneNodeSchema,
  EnterTryBlockNodeSchema,
  ExitContinueNodeSchema,
  ExitFallbackPathNodeSchema,
  ExitNormalPathNodeSchema,
  ExitRetryNodeSchema,
  ExitTimeoutZoneNodeSchema,
  ExitTryBlockNodeSchema,
  OnFailureNodeSchema,
  StepLevelOnFailureNodeSchema,
  WorkflowLevelOnFailureNodeSchema,
} from './on_failure_nodes';
import {
  EnterCaseBranchNodeSchema,
  EnterDefaultBranchNodeSchema,
  EnterSwitchNodeSchema,
  ExitCaseBranchNodeSchema,
  ExitDefaultBranchNodeSchema,
  ExitSwitchNodeSchema,
} from './switch_nodes';

const GraphNodeUnionSchema = z.discriminatedUnion('type', [
  AtomicGraphNodeSchema,
  DataSetGraphNodeSchema,
  ElasticsearchGraphNodeSchema,
  KibanaGraphNodeSchema,
  WaitGraphNodeSchema,
  WaitForInputGraphNodeSchema,
  WaitForApprovalGraphNodeSchema,
  WorkflowExecuteGraphNodeSchema,
  WorkflowExecuteAsyncGraphNodeSchema,
  WorkflowOutputGraphNodeSchema,
  EnterIfNodeSchema,
  ExitIfNodeSchema,
  EnterConditionBranchNodeSchema,
  ExitConditionBranchNodeSchema,
  EnterForeachNodeSchema,
  ExitForeachNodeSchema,
  EnterWhileNodeSchema,
  ExitWhileNodeSchema,
  EnterRetryNodeSchema,
  ExitRetryNodeSchema,
  EnterContinueNodeSchema,
  ExitContinueNodeSchema,
  EnterTryBlockNodeSchema,
  ExitTryBlockNodeSchema,
  EnterNormalPathNodeSchema,
  ExitNormalPathNodeSchema,
  EnterFallbackPathNodeSchema,
  ExitFallbackPathNodeSchema,
  EnterTimeoutZoneNodeSchema,
  ExitTimeoutZoneNodeSchema,
  OnFailureNodeSchema,
  StepLevelOnFailureNodeSchema,
  WorkflowLevelOnFailureNodeSchema,
  EnterSwitchNodeSchema,
  EnterCaseBranchNodeSchema,
  ExitCaseBranchNodeSchema,
  EnterDefaultBranchNodeSchema,
  ExitDefaultBranchNodeSchema,
  ExitSwitchNodeSchema,
  LoopBreakNodeSchema,
  LoopContinueNodeSchema,
]);

export type GraphNodeUnion = z.infer<typeof GraphNodeUnionSchema>;
