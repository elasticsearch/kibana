/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolRunnableConfig } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { ToolMessage } from '@langchain/core/messages';
import { Command, getCurrentTaskInput } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from '@kbn/zod/v4';
import type { InferenceChatModel } from '@kbn/inference-langchain';
import { MAX_STRING_LENGTH } from '../../../common';
import { TASK_TOOL_DESCRIPTION } from '../prompts';
import { AutomaticImportAgentState } from '../state';
import type { AutomaticImportAgentStateType } from '../state';
import type { SubAgent } from '../types';
import {
  BOILERPLATE_PROCESSOR_COUNT,
  formatCompactCustomProcessorToc,
} from '../tools/pipeline_constants';

const MAX_INJECTED_SAMPLES = 10;
const MAX_INJECTED_SUCCESSFUL_OUTPUTS = 5;
const MAX_INJECTED_FAILURE_DETAILS = 10;
const DEFAULT_ANALYZER_SAMPLE_COUNT = 5;

interface TaskToolParams {
  subagents: SubAgent[];
  model: InferenceChatModel;
  samples?: string[];
  recursionLimit?: number;
}

type ContextBuilder = (
  taskDescription: string,
  state: AutomaticImportAgentStateType,
  samples?: string[]
) => string;

const hasPipelineProcessors = (state: AutomaticImportAgentStateType): boolean =>
  Array.isArray(state.current_pipeline?.processors) && state.current_pipeline.processors.length > 0;

const wrapTask = (taskDescription: string, ...extraBlocks: string[]): string =>
  ['<task>', taskDescription, '</task>', ...extraBlocks].join('\n');

const buildAnalyzerContext: ContextBuilder = (taskDescription, _state, samples) => {
  if (!samples || samples.length === 0) return taskDescription;

  const injectedSamples = samples.slice(0, DEFAULT_ANALYZER_SAMPLE_COUNT);
  const sampleLines = injectedSamples
    .map((s, i) => `### Sample ${i + 1}\n\`\`\`\n${s}\n\`\`\``)
    .join('\n\n');

  return wrapTask(
    taskDescription,
    '',
    `<log_samples injected="${injectedSamples.length}" total_available="${samples.length}">`,
    sampleLines,
    '</log_samples>'
  );
};

const buildGeneratorContext: ContextBuilder = (taskDescription, state, samples) => {
  const isReviewIteration = Boolean(state.review);
  const parts: string[] = ['<task>', taskDescription, '</task>'];

  if (!isReviewIteration && state.analysis) {
    parts.push('', '<log_format_analysis>', state.analysis, '</log_format_analysis>');
  }

  if (!isReviewIteration && samples && samples.length > 0) {
    const slice = samples.slice(0, MAX_INJECTED_SAMPLES);
    parts.push(
      '',
      `<log_samples count="${slice.length}" total_available="${samples.length}">`,
      slice.map((s, i) => `### Sample ${i + 1}\n\`\`\`\n${s}\n\`\`\``).join('\n\n'),
      '</log_samples>'
    );
  }

  if (isReviewIteration && state.review) {
    parts.push('', '<review_feedback>', state.review, '</review_feedback>');
  }

  if (hasPipelineProcessors(state)) {
    const validationResults = state.pipeline_validation_results;
    if (validationResults?.total_samples != null) {
      parts.push(
        '',
        '<validation_summary>',
        JSON.stringify(
          {
            success_rate: validationResults.success_rate,
            successful_samples: validationResults.successful_samples,
            failed_samples: validationResults.failed_samples,
            total_samples: validationResults.total_samples,
          },
          null,
          2
        ),
        '</validation_summary>'
      );
    }

    const processors = state.current_pipeline.processors as Array<Record<string, unknown>>;
    if (isReviewIteration) {
      parts.push(
        '',
        '<current_pipeline format="json">',
        '<![CDATA[',
        JSON.stringify(state.current_pipeline, null, 2),
        ']]>',
        '</current_pipeline>',
        '',
        '<context_note>',
        'The full pipeline is above (last block). Do NOT call fetch_pipeline — use it directly for indices and processor JSON.',
        '</context_note>'
      );
    } else {
      const compactToc = formatCompactCustomProcessorToc(processors, BOILERPLATE_PROCESSOR_COUNT);
      parts.push(
        '',
        '<pipeline_overview mode="initial">',
        `<processor_count>${processors.length}</processor_count>`,
        '<custom_processors_compact_toc>',
        compactToc,
        '</custom_processors_compact_toc>',
        '</pipeline_overview>'
      );
    }
  }

  return parts.join('\n');
};

const buildReviewContext: ContextBuilder = (taskDescription, state, samples) => {
  const parts: string[] = ['<task>', taskDescription, '</task>'];

  parts.push(
    '',
    '<validation_results>',
    JSON.stringify(state.pipeline_validation_results ?? {}, null, 2),
    '</validation_results>'
  );

  if (samples && samples.length > 0) {
    const slice = samples.slice(0, MAX_INJECTED_SAMPLES);
    parts.push(
      '',
      `<sample_logs count="${slice.length}" total_available="${samples.length}">`,
      JSON.stringify(slice, null, 2),
      '</sample_logs>'
    );
  }

  const generationResults = state.pipeline_generation_results;
  if (generationResults && generationResults.length > 0) {
    parts.push(
      '',
      '<successful_simulation_outputs>',
      JSON.stringify(
        {
          total_successful_count: generationResults.length,
          sample_outputs: generationResults.slice(0, MAX_INJECTED_SUCCESSFUL_OUTPUTS),
        },
        null,
        2
      ),
      '</successful_simulation_outputs>'
    );
  }

  const failureDetails = state.pipeline_validation_results?.failure_details;
  if (failureDetails && failureDetails.length > 0) {
    const slice = failureDetails.slice(0, MAX_INJECTED_FAILURE_DETAILS);
    parts.push(
      '',
      '<failure_details>',
      JSON.stringify(
        {
          total_failure_count: failureDetails.length,
          failures: slice,
        },
        null,
        2
      ),
      '</failure_details>'
    );
  }

  parts.push(
    '',
    '<current_pipeline format="json">',
    '<![CDATA[',
    JSON.stringify(state.current_pipeline ?? {}, null, 2),
    ']]>',
    '</current_pipeline>'
  );

  return parts.join('\n');
};

const CONTEXT_BUILDERS: Record<string, ContextBuilder> = {
  log_and_ecs_analyzer: buildAnalyzerContext,
  ingest_pipeline_generator: buildGeneratorContext,
  review_agent: buildReviewContext,
};

const injectPipelineState = (
  taskDescription: string,
  agentName: string,
  samples?: string[]
): string => {
  try {
    const currentState = getCurrentTaskInput<AutomaticImportAgentStateType>();
    const builder = CONTEXT_BUILDERS[agentName];
    if (builder) {
      return builder(taskDescription, currentState, samples);
    }
  } catch {
    // State injection is best-effort; proceed without if unavailable
  }

  return taskDescription;
};

type AutomaticImportSubAgent = ReturnType<typeof createReactAgent>;

export const createTaskTool = (params: TaskToolParams) => {
  const { subagents, model, samples, recursionLimit } = params;
  const agentsMap = new Map<string, AutomaticImportSubAgent>();
  for (const subagent of subagents) {
    const baseSubAgent = createReactAgent({
      llm: model,
      tools: subagent.tools || [],
      prompt: subagent.prompt,
      stateSchema: AutomaticImportAgentState,
    });
    const ReActSubAgent =
      recursionLimit != null ? baseSubAgent.withConfig({ recursionLimit }) : baseSubAgent;

    agentsMap.set(subagent.name, ReActSubAgent);
  }

  return tool(
    async (input: { description: string; subagent_name: string }, config: ToolRunnableConfig) => {
      const toolCallId = config?.toolCall?.id ?? '';
      const subAgent = agentsMap.get(input.subagent_name);

      if (subAgent == null) {
        return new Command({
          update: {
            messages: [
              new ToolMessage({
                content: `Unknown subagent: ${input.subagent_name}`,
                tool_call_id: toolCallId,
              }),
            ],
          },
        });
      }

      const taskDescription = injectPipelineState(input.description, input.subagent_name, samples);

      let parentState: AutomaticImportAgentStateType | undefined;
      try {
        parentState = getCurrentTaskInput<AutomaticImportAgentStateType>();
      } catch {
        // Parent state unavailable — sub-agent starts with defaults
      }

      const modifiedState: Record<string, unknown> = {
        messages: [{ role: 'user', content: taskDescription }],
      };

      if (parentState) {
        const propagatedFields = [
          'current_pipeline',
          'analysis',
          'review',
          'pipeline_generation_results',
          'pipeline_validation_results',
          'failure_count',
          'field_mappings',
        ] as const;
        for (const field of propagatedFields) {
          if (parentState[field] != null) {
            modifiedState[field] = parentState[field];
          }
        }
      }

      try {
        const result = await subAgent.invoke(modifiedState, {
          callbacks: config?.callbacks,
          signal: config?.signal,
        });

        return new Command({
          update: {
            ...result,
            messages: [
              new ToolMessage({
                content: result.messages?.slice(-1)[0]?.content,
                tool_call_id: toolCallId,
              }),
            ],
          },
        });
      } catch (e) {
        return new Command({
          update: {
            messages: [
              new ToolMessage({
                content: `Error executing task with ${input.subagent_name}: ${String(e)}`,
                tool_call_id: toolCallId,
              }),
            ],
          },
        });
      }
    },
    {
      name: 'task',
      description: TASK_TOOL_DESCRIPTION.replace(
        '{available_agents}',
        subagents.map((a) => `- ${a.name}: ${a.description}`).join('\n')
      ),
      schema: z.object({
        description: z
          .string()
          .max(MAX_STRING_LENGTH.description)
          .describe('The task to execute with the selected agent'),
        subagent_name: z
          .string()
          .max(MAX_STRING_LENGTH.name)
          .describe(
            `Name of the agent to use. Available: ${subagents.map((a) => a.name).join(', ')}`
          ),
      }),
    }
  );
};
