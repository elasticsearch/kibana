/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { Logger } from '@kbn/core/server';
import {
  DATA_STREAM_PHASES,
  DATA_STREAM_PHASE_ORDER,
  getDataStreamPhaseIndex,
  type DataStreamPhase,
} from '../../common';

export type ReportPhaseFn = (phase: DataStreamPhase) => void | Promise<void>;

const PHASE_DEBOUNCE_MS = 500;

const SUB_AGENT_PHASE_MAP: Record<string, DataStreamPhase> = {
  log_and_ecs_analyzer: DATA_STREAM_PHASES.analyzingLogs,
  review_agent: DATA_STREAM_PHASES.reviewing,
};

const TOOL_PHASE_MAP: Record<string, DataStreamPhase> = {
  fetch_log_samples: DATA_STREAM_PHASES.analyzingLogs,
  get_ecs_info: DATA_STREAM_PHASES.mappingToEcs,
  submit_analysis: DATA_STREAM_PHASES.mappingToEcs,
  modify_pipeline: DATA_STREAM_PHASES.buildingPipeline,
  test_pipeline: DATA_STREAM_PHASES.buildingPipeline,
  submit_review: DATA_STREAM_PHASES.reviewing,
};

const getToolName = (tool: Serialized, runName?: string): string => {
  // For tools created via `tool()` / `DynamicStructuredTool`, the serialized object is a
  // "not_implemented" shape with no usable `name`; LangChain passes the actual tool name as
  // the `runName` argument of handleToolStart, so prefer that.
  if (runName) {
    return runName;
  }
  if (typeof tool === 'object' && tool !== null && 'name' in tool) {
    return String((tool as { name: string }).name);
  }
  return '';
};

const parseTaskSubagentName = (input: string): string | undefined => {
  try {
    const parsed = JSON.parse(input) as { subagent_name?: string };
    return parsed.subagent_name;
  } catch {
    return undefined;
  }
};

export class PhaseCallbackHandler extends BaseCallbackHandler {
  name = 'phase_callback_handler';

  private maxPhaseIndex = -1;
  private hasEnteredReview = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPhase: DataStreamPhase | null = null;

  constructor(private readonly reportPhase: ReportPhaseFn, private readonly logger?: Logger) {
    super();
  }

  async handleToolStart(
    tool: Serialized,
    input: string,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    const toolName = getToolName(tool, runName);
    const phase = this.resolvePhase(toolName, input);
    this.logger?.debug(
      `[ProgressBar] Tool "${toolName}" started; resolved phase: ${phase ?? '(none)'}`
    );
    if (phase) {
      this.reportPhaseIfAdvanced(phase);
    }
  }

  resolvePhase(toolName: string, input: string): DataStreamPhase | undefined {
    if (toolName === 'task') {
      const subagentName = parseTaskSubagentName(input);
      if (!subagentName) {
        return undefined;
      }

      if (subagentName === 'ingest_pipeline_generator') {
        return this.hasEnteredReview
          ? DATA_STREAM_PHASES.fixingPipeline
          : DATA_STREAM_PHASES.buildingPipeline;
      }

      return SUB_AGENT_PHASE_MAP[subagentName];
    }

    if (toolName === 'validate_pipeline') {
      return undefined;
    }

    const mappedPhase = TOOL_PHASE_MAP[toolName];
    if (!mappedPhase) {
      return undefined;
    }

    if ((toolName === 'modify_pipeline' || toolName === 'test_pipeline') && this.hasEnteredReview) {
      return DATA_STREAM_PHASES.fixingPipeline;
    }

    return mappedPhase;
  }

  reportPhaseIfAdvanced(phase: DataStreamPhase): void {
    const phaseIndex = getDataStreamPhaseIndex(phase);
    if (phaseIndex < 0) {
      return;
    }

    if (phase === DATA_STREAM_PHASES.reviewing) {
      this.hasEnteredReview = true;
    }

    if (phaseIndex <= this.maxPhaseIndex) {
      this.logger?.debug(
        `[ProgressBar] Phase "${phase}" skipped (not advancing past current phase index ${this.maxPhaseIndex})`
      );
      return;
    }

    this.maxPhaseIndex = phaseIndex;
    this.logger?.debug(`[ProgressBar] Phase advanced to "${phase}" (scheduling update)`);
    this.schedulePhaseReport(phase);
  }

  private schedulePhaseReport(phase: DataStreamPhase): void {
    this.pendingPhase = phase;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const phaseToReport = this.pendingPhase;
      this.pendingPhase = null;
      this.debounceTimer = null;

      if (phaseToReport) {
        void Promise.resolve(this.reportPhase(phaseToReport));
      }
    }, PHASE_DEBOUNCE_MS);
  }

  async flushPendingPhase(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const phaseToReport = this.pendingPhase;
    this.pendingPhase = null;

    if (phaseToReport) {
      await Promise.resolve(this.reportPhase(phaseToReport));
    }
  }
}

export const isDataStreamPhase = (value: string): value is DataStreamPhase =>
  (DATA_STREAM_PHASE_ORDER as readonly string[]).includes(value);
