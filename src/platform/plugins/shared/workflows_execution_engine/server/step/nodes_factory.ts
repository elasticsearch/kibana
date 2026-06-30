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
  EnterCaseBranchNode,
  EnterConditionBranchNode,
  EnterContinueNode,
  EnterDefaultBranchNode,
  EnterForeachNode,
  EnterIfNode,
  EnterRetryNode,
  EnterSwitchNode,
  EnterTryBlockNode,
  EnterWhileNode,
  ExitCaseBranchNode,
  ExitConditionBranchNode,
  ExitDefaultBranchNode,
  ExitFallbackPathNode,
  ExitForeachNode,
  ExitNormalPathNode,
  ExitRetryNode,
  ExitWhileNode,
  LoopBreakNode,
  LoopContinueNode,
  WaitForInputGraphNode,
  WaitGraphNode,
  WorkflowExecuteAsyncGraphNode,
  WorkflowExecuteGraphNode,
  WorkflowGraph,
  WorkflowOutputGraphNode,
} from '@kbn/workflows/graph';
import {
  isDataSet,
  isEnterStepTimeoutZone,
  isEnterWorkflowTimeoutZone,
  isExitStepTimeoutZone,
  isExitWorkflowTimeoutZone,
} from '@kbn/workflows/graph';
import type { ElasticsearchGraphNode, KibanaGraphNode } from '@kbn/workflows/graph/types';
import { AtomicStepImpl } from './atomic_step/atomic_step_impl';
import { CustomStepImpl } from './custom_step_impl';
import { DataSetStepImpl } from './data_set_step';
import { ElasticsearchActionStepImpl } from './elasticsearch_action_step';
import { LoopBreakNodeImpl, LoopContinueNodeImpl } from './flow_control_step';
import { EnterForeachNodeImpl, ExitForeachNodeImpl } from './foreach_step';
import {
  EnterConditionBranchNodeImpl,
  EnterIfNodeImpl,
  ExitConditionBranchNodeImpl,
  ExitIfNodeImpl,
} from './if_step';
import { KibanaActionStepImpl } from './kibana_action_step';
import type { NodeImplementation } from './node_implementation';
import { EnterContinueNodeImpl, ExitContinueNodeImpl } from './on_failure/continue_step';
import {
  EnterFallbackPathNodeImpl,
  EnterNormalPathNodeImpl,
  EnterTryBlockNodeImpl,
  ExitFallbackPathNodeImpl,
  ExitNormalPathNodeImpl,
  ExitTryBlockNodeImpl,
} from './on_failure/fallback_step';
import { EnterRetryNodeImpl, ExitRetryNodeImpl } from './on_failure/retry_step';
import {
  EnterBranchNodeImpl,
  EnterSwitchNodeImpl,
  ExitBranchNodeImpl,
  ExitSwitchNodeImpl,
} from './switch_step';
import {
  EnterStepTimeoutZoneNodeImpl,
  EnterWorkflowTimeoutZoneNodeImpl,
  ExitStepTimeoutZoneNodeImpl,
  ExitWorkflowTimeoutZoneNodeImpl,
} from './timeout_zone_step';
import { WaitForInputStepImpl } from './wait_for_input_step/wait_for_input_step';
import { WaitStepImpl } from './wait_step/wait_step';
import { EnterWhileNodeImpl, ExitWhileNodeImpl } from './while_step';
import { WorkflowExecuteStepImpl } from './workflow_execute_step/workflow_execute_step_impl';
import { WorkflowOutputStepImpl } from './workflow_output_step/workflow_output_step_impl';
import type { ConnectorExecutor } from '../connector_executor';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { StepExecutionRuntimeFactory } from '../workflow_context_manager/step_execution_runtime_factory';
import type { StepIoService } from '../workflow_context_manager/step_io_service';
import type { ContextDependencies } from '../workflow_context_manager/types';
import type { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../workflow_event_logger';

export class NodesFactory {
  constructor(
    private connectorExecutor: ConnectorExecutor, // this is temporary, we will remove it when we have a proper connector executor
    private workflowRuntime: WorkflowExecutionRuntimeManager,
    private workflowLogger: IWorkflowEventLogger, // Assuming you have a logger interface
    private workflowGraph: WorkflowGraph,
    private stepExecutionRuntimeFactory: StepExecutionRuntimeFactory,
    private dependencies: ContextDependencies,
    private stepIoService: StepIoService
  ) {}

  public create(stepExecutionRuntime: StepExecutionRuntime): NodeImplementation {
    const { node } = stepExecutionRuntime;

    // Built-in steps - checked first before workflows_extensions
    // Note: Some built-in steps (like data.set) are also registered in workflows_extensions
    // for YAML schema validation, but execution always uses the built-in implementation.
    // This dual-registration is intentional: workflows_extensions provides the schema,
    // while the execution engine provides the implementation with access to internal APIs.

    // Handle elasticsearch.* and kibana.* actions
    if (node.stepType && node.stepType.startsWith('elasticsearch.')) {
      this.workflowLogger.logDebug(`Creating Elasticsearch action step: ${node.stepType}`, {
        event: { action: 'internal-action-creation', outcome: 'success' },
        tags: ['step-factory', 'elasticsearch', 'internal-action'],
      });
      return new ElasticsearchActionStepImpl(
        node as ElasticsearchGraphNode,
        stepExecutionRuntime,
        this.workflowRuntime,
        this.workflowLogger
      );
    }

    if (node.stepType && node.stepType.startsWith('kibana.')) {
      this.workflowLogger.logDebug(`Creating Kibana action step: ${node.stepType}`, {
        event: { action: 'internal-action-creation', outcome: 'success' },
        tags: ['step-factory', 'kibana', 'internal-action'],
      });
      return new KibanaActionStepImpl(
        node as KibanaGraphNode,
        stepExecutionRuntime,
        this.workflowRuntime,
        this.workflowLogger
      );
    }

    // Handle data.set internal step
    if (isDataSet(node)) {
      this.workflowLogger.logDebug('Creating data.set step', {
        event: { action: 'internal-step-creation', outcome: 'success' },
        tags: ['step-factory', 'data-set', 'internal-step'],
      });
      return new DataSetStepImpl(
        node,
        stepExecutionRuntime,
        this.workflowRuntime,
        this.workflowLogger
      );
    }

    // Check for custom registered step types first
    const { workflowsExtensions } = this.dependencies;
    if (node.stepType && workflowsExtensions.hasStepDefinition(node.stepType)) {
      const stepDefinition = workflowsExtensions.getStepDefinition(node.stepType);
      if (stepDefinition) {
        this.workflowLogger.logDebug(`Creating custom registered step: ${node.stepType}`, {
          event: { action: 'custom-step-creation', outcome: 'success' },
          tags: ['step-handler', 'custom-step', 'extension'],
        });
        return new CustomStepImpl(
          node as AtomicGraphNode,
          stepDefinition,
          stepExecutionRuntime,
          this.connectorExecutor,
          this.workflowRuntime,
          this.workflowLogger
        );
      }
    }

    return this.createGenericStepNode(stepExecutionRuntime);
  }

  // eslint-disable-next-line complexity
  private createGenericStepNode(stepExecutionRuntime: StepExecutionRuntime): NodeImplementation {
    const node = stepExecutionRuntime.node;
    const stepLogger = stepExecutionRuntime.stepLogger;
    switch (node.type) {
      case 'enter-foreach':
        return new EnterForeachNodeImpl(
          node as EnterForeachNode,
          this.workflowRuntime,
          stepExecutionRuntime,
          stepLogger,
          this.stepIoService
        );
      case 'exit-foreach':
        return new ExitForeachNodeImpl(
          node as ExitForeachNode,
          stepExecutionRuntime,
          this.workflowRuntime,
          stepLogger,
          this.stepIoService,
          this.workflowGraph
        );
      case 'enter-while':
        return new EnterWhileNodeImpl(
          node as EnterWhileNode,
          this.workflowRuntime,
          stepExecutionRuntime,
          stepLogger,
          this.stepIoService
        );
      case 'exit-while':
        return new ExitWhileNodeImpl(
          node as ExitWhileNode,
          stepExecutionRuntime,
          this.workflowRuntime,
          stepLogger,
          this.stepIoService,
          this.workflowGraph
        );
      case 'loop-break':
        return new LoopBreakNodeImpl(
          node as LoopBreakNode,
          stepExecutionRuntime,
          this.workflowRuntime,
          stepLogger,
          this.stepExecutionRuntimeFactory,
          this.stepIoService,
          this.workflowGraph
        );
      case 'loop-continue':
        return new LoopContinueNodeImpl(
          node as LoopContinueNode,
          stepExecutionRuntime,
          this.workflowRuntime,
          stepLogger,
          this.stepExecutionRuntimeFactory,
          this.stepIoService,
          this.workflowGraph
        );
      case 'enter-retry':
        return new EnterRetryNodeImpl(
          node as EnterRetryNode,
          stepExecutionRuntime,
          this.workflowRuntime,
          stepLogger
        );
      case 'exit-retry':
        return new ExitRetryNodeImpl(
          node as ExitRetryNode,
          stepExecutionRuntime,
          this.workflowRuntime,
          stepLogger
        );
      case 'enter-continue':
        return new EnterContinueNodeImpl(
          node as EnterContinueNode,
          this.workflowRuntime,
          stepLogger
        );
      case 'exit-continue':
        return new ExitContinueNodeImpl(this.workflowRuntime);
      case 'enter-try-block':
        return new EnterTryBlockNodeImpl(
          node as EnterTryBlockNode,
          stepExecutionRuntime,
          this.workflowRuntime
        );
      case 'exit-try-block':
        return new ExitTryBlockNodeImpl(stepExecutionRuntime, this.workflowRuntime);
      case 'enter-normal-path':
        return new EnterNormalPathNodeImpl(this.workflowRuntime);
      case 'enter-fallback-path':
        return new EnterFallbackPathNodeImpl(this.workflowRuntime);
      case 'exit-normal-path':
        return new ExitNormalPathNodeImpl(node as ExitNormalPathNode, this.workflowRuntime);
      case 'exit-fallback-path':
        return new ExitFallbackPathNodeImpl(node as ExitFallbackPathNode, this.workflowRuntime);
      case 'enter-timeout-zone':
        if (isEnterWorkflowTimeoutZone(node)) {
          return new EnterWorkflowTimeoutZoneNodeImpl(
            node,
            this.workflowRuntime,
            this.stepExecutionRuntimeFactory
          );
        }

        if (isEnterStepTimeoutZone(node)) {
          return new EnterStepTimeoutZoneNodeImpl(node, this.workflowRuntime, stepExecutionRuntime);
        }
      case 'exit-timeout-zone':
        if (isExitWorkflowTimeoutZone(node)) {
          return new ExitWorkflowTimeoutZoneNodeImpl(this.workflowRuntime);
        }

        if (isExitStepTimeoutZone(node)) {
          return new ExitStepTimeoutZoneNodeImpl(stepExecutionRuntime, this.workflowRuntime);
        }
      case 'enter-if':
        return new EnterIfNodeImpl(
          node as EnterIfNode,
          this.workflowRuntime,
          this.workflowGraph,
          stepExecutionRuntime,
          stepLogger
        );
      case 'enter-then-branch':
      case 'enter-else-branch':
        return new EnterConditionBranchNodeImpl(
          node as EnterConditionBranchNode,
          this.workflowRuntime
        );
      case 'exit-then-branch':
      case 'exit-else-branch':
        return new ExitConditionBranchNodeImpl(
          node as ExitConditionBranchNode,
          this.workflowGraph,
          this.workflowRuntime
        );
      case 'exit-if':
        return new ExitIfNodeImpl(stepExecutionRuntime, this.workflowRuntime);
      case 'enter-switch':
        return new EnterSwitchNodeImpl(
          node as EnterSwitchNode,
          this.workflowRuntime,
          this.workflowGraph,
          stepExecutionRuntime,
          stepLogger
        );
      case 'enter-case-branch':
      case 'enter-default-branch':
        return new EnterBranchNodeImpl(
          node as EnterCaseBranchNode | EnterDefaultBranchNode,
          this.workflowRuntime,
          stepExecutionRuntime
        );
      case 'exit-case-branch':
      case 'exit-default-branch':
        return new ExitBranchNodeImpl(
          node as ExitCaseBranchNode | ExitDefaultBranchNode,
          this.workflowGraph,
          this.workflowRuntime
        );
      case 'exit-switch':
        return new ExitSwitchNodeImpl(stepExecutionRuntime, this.workflowRuntime);
      case 'wait':
        return new WaitStepImpl(
          node as WaitGraphNode,
          stepExecutionRuntime,
          this.workflowRuntime,
          stepLogger
        );
      case 'waitForInput':
        return new WaitForInputStepImpl(
          node as WaitForInputGraphNode,
          stepExecutionRuntime,
          this.workflowRuntime,
          stepLogger
        );
      case 'atomic':
        return new AtomicStepImpl(
          node as AtomicGraphNode,
          stepExecutionRuntime,
          this.connectorExecutor,
          this.workflowRuntime,
          stepLogger
        );
      case 'workflow.execute':
      case 'workflow.executeAsync':
        if (!this.dependencies.workflowsExecutionEngine) {
          throw new Error('WorkflowsExecutionEngine is not available in dependencies');
        }
        if (!this.dependencies.workflowRepository) {
          throw new Error('WorkflowRepository is not available in dependencies');
        }
        if (!this.dependencies.workflowExecutionRepository) {
          throw new Error('WorkflowExecutionRepository is not available in dependencies');
        }
        if (!this.dependencies.stepExecutionRepository) {
          throw new Error('StepExecutionRepository is not available in dependencies');
        }
        if (!this.dependencies.spaceId) {
          throw new Error('spaceId is not available in dependencies');
        }
        if (!this.dependencies.request) {
          throw new Error('request is not available in dependencies');
        }
        return new WorkflowExecuteStepImpl({
          node: node as WorkflowExecuteGraphNode | WorkflowExecuteAsyncGraphNode,
          stepExecutionRuntime,
          workflowExecutionRuntime: this.workflowRuntime,
          workflowRepository: this.dependencies.workflowRepository,
          spaceId: this.dependencies.spaceId,
          request: this.dependencies.request,
          workflowsExecutionEngine: this.dependencies.workflowsExecutionEngine,
          workflowExecutionRepository: this.dependencies.workflowExecutionRepository,
          stepExecutionRepository: this.dependencies.stepExecutionRepository,
          workflowLogger: this.workflowLogger,
          config: this.dependencies.config,
        });
      case 'workflow.output':
        this.workflowLogger.logDebug(`Creating workflow.output step`, {
          event: { action: 'workflow-output-step-creation', outcome: 'success' },
          tags: ['step-factory', 'workflow-output', 'core-step'],
        });
        return new WorkflowOutputStepImpl(
          node as WorkflowOutputGraphNode,
          stepExecutionRuntime,
          this.workflowRuntime,
          stepLogger,
          this.stepExecutionRuntimeFactory
        );
      default:
        throw new Error(`Unknown node type: ${node.stepType}`);
    }
  }
}
