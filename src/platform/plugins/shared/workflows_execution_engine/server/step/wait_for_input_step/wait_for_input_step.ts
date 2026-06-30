/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WaitForInputGraphNode } from '@kbn/workflows/graph';
import { resumeHitlWaitStep, shouldSkipHitlWaitEntry, tryEnterHitlWait } from './hitl_wait_helpers';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';
import type { NodeImplementation } from '../node_implementation';

export class WaitForInputStepImpl implements NodeImplementation {
  constructor(
    private node: WaitForInputGraphNode,
    private stepExecutionRuntime: StepExecutionRuntime,
    private workflowRuntime: WorkflowExecutionRuntimeManager,
    private workflowLogger: IWorkflowEventLogger
  ) {}

  async run(): Promise<void> {
    if (shouldSkipHitlWaitEntry(this.stepExecutionRuntime)) {
      this.workflowLogger.logDebug(
        `Step '${this.node.stepId}' run aborted before wait-entry; skipping`,
        { event: { action: 'hitl:aborted' } }
      );
      return;
    }

    if (tryEnterHitlWait(this.stepExecutionRuntime)) {
      const withConfig = this.node.configuration?.with;
      if (withConfig) {
        const ctx = this.stepExecutionRuntime.contextManager;
        this.stepExecutionRuntime.setInput({
          ...(withConfig.message !== undefined && {
            message: ctx.renderValueAccordingToContext(withConfig.message),
          }),
          ...(withConfig.schema !== undefined && { schema: withConfig.schema }),
        });
      }
      this.workflowLogger.logDebug(`Step '${this.node.stepId}' is waiting for human input`, {
        event: { action: 'hitl:waiting' },
      });
      return;
    }

    this.workflowLogger.logDebug(`Step '${this.node.stepId}' resuming with human input`, {
      event: { action: 'hitl:resuming' },
    });
    resumeHitlWaitStep({
      stepExecutionRuntime: this.stepExecutionRuntime,
      workflowRuntime: this.workflowRuntime,
      workflowLogger: this.workflowLogger,
      stepId: this.node.stepId,
    });
  }
}
