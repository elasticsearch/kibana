/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { ToolingLog } from '@kbn/tooling-log';
import type { HttpHandler } from '@kbn/core/public';
import type { ConverseResponse, ConverseUsage } from './agent_builder_client';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'timed_out', 'skipped']);
const POLL_INTERVAL_MS = 15_000;
const MAX_WAIT_MS = 60 * 60_000;

interface SingleAgentOutput {
  contributing_factors: string;
  confidence: number;
  evidence_summary: string;
  mechanism?: string;
  gaps_found?: string[];
}

interface AdversarialOutput {
  contributing_factors: string;
  confidence: number;
  evidence_summary: string;
  mechanism?: string;
  final_reasoning?: string;
  how_critique_was_addressed?: string;
  gaps_found?: string[];
}

interface StepUsage {
  input_tokens?: number;
  output_tokens?: number;
  llm_calls?: number;
}

interface StepExecution {
  stepId?: string;
  status: string;
  output?: { usage?: StepUsage; structured_output?: unknown; [key: string]: unknown } | null;
}

interface WorkflowExecution {
  status: string;
  traceId?: string;
  error?: { message?: string } | null;
  stepExecutions?: StepExecution[];
}

export interface SimpleWorkflowInput {
  streamNames: string[];
  scenarioId: string;
  scenarioTitle: string;
  service: string;
  faultType: string;
  connectorId?: string;
}

function formatSingleAgentResult(output: SingleAgentOutput): string {
  const lines: string[] = [];
  lines.push(`Contributing factors: ${output.contributing_factors}`);
  lines.push(`Confidence: ${(output.confidence * 100).toFixed(0)}%`);
  lines.push(`Mechanism: ${output.mechanism ?? 'unspecified'}`);
  lines.push(`Evidence: ${output.evidence_summary}`);
  if ((output.gaps_found ?? []).length > 0) {
    lines.push(`Gaps: ${(output.gaps_found ?? []).join('; ')}`);
  }
  return lines.join('\n');
}

function formatAdversarialResult(output: AdversarialOutput, roundsUsed: number): string {
  const lines: string[] = [];
  lines.push(`Contributing factors: ${output.contributing_factors}`);
  lines.push(`Confidence: ${(output.confidence * 100).toFixed(0)}%`);
  lines.push(`Mechanism: ${output.mechanism ?? 'unspecified'}`);
  lines.push(`Rounds used: ${roundsUsed}`);
  lines.push(`Evidence: ${output.evidence_summary}`);
  if (output.final_reasoning) {
    lines.push(`Final reasoning: ${output.final_reasoning}`);
  }
  if (output.how_critique_was_addressed) {
    lines.push(`Critique addressed: ${output.how_critique_was_addressed}`);
  }
  return lines.join('\n');
}

export class SimpleWorkflowClient {
  constructor(
    private readonly fetch: HttpHandler,
    private readonly log: ToolingLog,
    private readonly workflowId: string
  ) {}

  async run(input: SimpleWorkflowInput): Promise<ConverseResponse> {
    const { streamNames, scenarioId, service, faultType, connectorId } = input;
    const opaqueId = randomUUID();
    const discoveryId = `eval-simple-${opaqueId}`;

    this.log.info(`[simple-workflow] Triggering workflow ${this.workflowId} for: ${scenarioId}`);

    const { workflowExecutionId } = (await this.fetch(
      `/api/workflows/workflow/${this.workflowId}/run`,
      {
        method: 'POST',
        version: '2023-10-31',
        body: JSON.stringify({
          inputs: {
            event_id: `eval-event-${opaqueId}`,
            discovery_id: discoveryId,
            discovery_slug: opaqueId,
            title: `Microservice system degradation or outage`,
            summary: `A microservice system is experiencing degradation or an outage.`,
            question:
              `A microservice system is experiencing degradation or an outage. ` +
              `Investigate the root cause and identify the responsible service. ` +
              `Telemetry is in stream_names (logs, traces, and infrastructure metrics): ${streamNames.join(', ')}. ` +
              `Use available tools to inspect these data streams. ` +
              `Identify: (1) the root cause component, (2) the failure mode, and (3) supporting evidence.`,
            contributing_factors: '',
            impact: '',
            stream_names: streamNames,
            cause_kis: [],
            evidences: [],
            ...(connectorId ? { connector_id: connectorId } : {}),
          },
        }),
      }
    )) as { workflowExecutionId: string };

    this.log.info(`[simple-workflow] Execution started: ${workflowExecutionId} for ${scenarioId}`);

    const execution = await this.pollUntilTerminal(workflowExecutionId, scenarioId);
    return this.buildConverseResponse(execution, workflowExecutionId, scenarioId, service, faultType);
  }

  private async pollUntilTerminal(executionId: string, scenarioId: string): Promise<WorkflowExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_WAIT_MS) {
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      this.log.info(`[simple-workflow] Polling ${executionId} (${elapsed}s) for ${scenarioId}`);

      const execution = (await this.fetch(`/api/workflows/executions/${executionId}`, {
        version: '2023-10-31',
        query: { includeOutput: true },
      })) as WorkflowExecution;

      if (TERMINAL_STATUSES.has(execution.status)) {
        this.log.info(`[simple-workflow] ${executionId} terminal: ${execution.status}`);
        return execution;
      }
    }

    throw new Error(`Simple workflow ${executionId} timed out after ${MAX_WAIT_MS / 60_000} minutes`);
  }

  private buildConverseResponse(
    execution: WorkflowExecution,
    executionId: string,
    scenarioId: string,
    service: string,
    faultType: string
  ): ConverseResponse {
    const errors: unknown[] = [];

    if (execution.status !== 'completed') {
      const errMsg = execution.error?.message ?? `Workflow ended with status: ${execution.status}`;
      this.log.warning(`[simple-workflow] Non-completed execution ${executionId}: ${errMsg}`);
      errors.push(new Error(errMsg));
    }

    // For single-agent workflow, look for the 'investigate' step
    // For adversarial workflow, look for emit_result or investigate_r3/r2/r1
    const investigateStep = execution.stepExecutions?.find(
      (s) => (s.stepId === 'investigate' || s.stepId === 'emit_result') && s.output != null
    );

    const r3Step = execution.stepExecutions?.find((s) => s.stepId === 'investigate_r3' && s.output != null);
    const r2Step = execution.stepExecutions?.find((s) => s.stepId === 'investigate_r2' && s.output != null);
    const r1Step = execution.stepExecutions?.find((s) => s.stepId === 'investigate_r1' && s.output != null);
    const roundsUsed = r3Step ? 3 : r2Step ? 2 : 1;

    let messageContent: string;

    const finalStep = investigateStep ?? r3Step ?? r2Step ?? r1Step;
    if (finalStep?.output) {
      const rawOutput = finalStep.output as { structured_output?: unknown } | unknown;
      const structured = ('structured_output' in (rawOutput as object)
        ? (rawOutput as { structured_output: unknown }).structured_output
        : rawOutput) as SingleAgentOutput | AdversarialOutput;

      if (roundsUsed > 1) {
        messageContent = formatAdversarialResult(structured as AdversarialOutput, roundsUsed);
      } else {
        messageContent = formatSingleAgentResult(structured as SingleAgentOutput);
      }

      this.log.info(
        `[simple-workflow] ${scenarioId} contributing_factors: ${(structured as SingleAgentOutput).contributing_factors} (${roundsUsed} round${roundsUsed > 1 ? 's' : ''})`
      );
    } else {
      this.log.warning(`[simple-workflow] No output found for ${scenarioId}`);
      messageContent = 'Workflow did not produce a result.';
    }

    const usage: ConverseUsage = { input_tokens: 0, output_tokens: 0, llm_calls: 0 };
    for (const step of execution.stepExecutions ?? []) {
      const stepUsage = step.output?.usage;
      if (stepUsage) {
        usage.input_tokens += stepUsage.input_tokens ?? 0;
        usage.output_tokens += stepUsage.output_tokens ?? 0;
        usage.llm_calls += stepUsage.llm_calls ?? 0;
      }
    }
    this.log.info(
      `[simple-workflow] ${scenarioId} usage: ${usage.input_tokens} in / ${usage.output_tokens} out / ${usage.llm_calls} calls`
    );

    const promptMessage =
      `A microservice system in Online Boutique is experiencing a fault. ` +
      `Fault details — service: ${service}, type: ${faultType}. ` +
      `Investigate root cause and identify the responsible service.`;

    return {
      conversationId: executionId,
      traceId: execution.traceId,
      messages: [{ content: promptMessage }, { content: messageContent }],
      steps: [],
      errors,
      usage,
    };
  }
}
