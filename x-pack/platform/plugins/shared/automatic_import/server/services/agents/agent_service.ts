/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, LoggerFactory, Logger } from '@kbn/core/server';
import type { InferenceChatModel } from '@kbn/inference-langchain';
import { getLangSmithTracer } from '@kbn/langchain/server/tracers/langsmith';
import { HumanMessage } from '@langchain/core/messages';
import type { IFieldsMetadataClient } from '@kbn/fields-metadata-plugin/server';
import { createAutomaticImportAgent } from '../../agents';
import {
  createIngestPipelineGeneratorAgent,
  createLogAndEcsAnalyzerAgent,
  createReviewAgent,
} from '../../agents/sub_agents';
import {
  fetchSamplesTool,
  fetchCurrentPipelineTool,
  getEcsInfoTool,
  ingestPipelineValidatorTool,
  modifyPipelineTool,
  testPipelineTool,
  submitAnalysisTool,
  submitReviewTool,
  BOILERPLATE_PIPELINE,
} from '../../agents/tools';
import type { AutomaticImportSamplesIndexService } from '../samples_index/index_service';
import type { AutomaticImportAgentStateUpdateType } from '../../agents/state';
import { INGEST_PIPELINE_GENERATOR_PROMPT } from '../../agents/prompts';
import type { LangSmithOptions } from '../../routes/types';
import { PhaseCallbackHandler, type ReportPhaseFn } from '../../agents/phase_callback_handler';

export class AgentService {
  private logger: Logger;

  constructor(
    private readonly samplesIndexService: AutomaticImportSamplesIndexService,
    logger: LoggerFactory
  ) {
    this.logger = logger.get('agentService');
  }

  public async invokeAutomaticImportAgent(
    integrationId: string,
    dataStreamId: string,
    esClient: ElasticsearchClient,
    model: InferenceChatModel,
    fieldsMetadataClient: IFieldsMetadataClient,
    langSmithOptions?: LangSmithOptions,
    abortSignal?: AbortSignal,
    reportPhase?: ReportPhaseFn
  ) {
    this.logger.debug(
      `invokeAutomaticImportAgent: Invoking automatic import agent for integration ${integrationId} and data stream ${dataStreamId}`
    );

    const samples = await this.samplesIndexService.getSamplesForDataStream(
      integrationId,
      dataStreamId
    );

    const fetchSamplesToolInstance = fetchSamplesTool(samples);
    const modifyPipelineToolInstance = modifyPipelineTool({ esClient, samples });
    const testPipelineToolInstance = testPipelineTool({ esClient, samples });
    const fetchPipelineToolInstance = fetchCurrentPipelineTool();
    const ecsInfoTool = getEcsInfoTool(fieldsMetadataClient);

    const ecsFieldsets = await fieldsMetadataClient.getECSFieldsets();
    const ecsRootFieldsSummary = ecsFieldsets.map((fieldset) => `- **${fieldset}**`).join('\n');

    const validatorTool = ingestPipelineValidatorTool({
      esClient,
      samples,
      packageName: integrationId,
      dataStreamName: dataStreamId,
      fieldsMetadataClient,
    });

    const logAndEcsAnalyzerSubAgent = createLogAndEcsAnalyzerAgent({
      prompt: `You have access to fetch_log_samples, get_ecs_info, and submit_analysis tools.
Log samples are pre-injected into your context. Use fetch_log_samples only if you need additional samples to verify structural variants or edge cases.

<ecs_root_fields>
The following ECS root field groups are available. Use get_ecs_info with root_fields to drill into any of these:
${ecsRootFieldsSummary}
</ecs_root_fields>

<workflow>
1. Review the log samples already provided in your context
2. Analyze the samples to identify format, fields, and characteristics
3. If you suspect structural variants not represented, fetch additional samples with fetch_log_samples
4. Use get_ecs_info with relevant root_fields (batch multiple in one call) and field_paths to look up ECS field definitions
5. Call submit_analysis with your full analysis and a brief summary as your final action
</workflow>`,
      tools: [fetchSamplesToolInstance, ecsInfoTool, submitAnalysisTool()],
    });

    const pipelineGeneratorSubAgent = createIngestPipelineGeneratorAgent({
      name: 'ingest_pipeline_generator',
      description:
        'Generates an Elasticsearch ingest pipeline based on log analysis and ECS mappings. ' +
        'Builds with modify_pipeline (batches + quick simulate per call), finishes with validate_pipeline. ' +
        'Optional test_pipeline simulates candidate processors (boilerplate + processors arg) without state. ' +
        'Injected context uses structured tags; compact TOC or full pipeline at end of the task message.',
      prompt: INGEST_PIPELINE_GENERATOR_PROMPT,
      tools: [
        modifyPipelineToolInstance,
        testPipelineToolInstance,
        validatorTool,
        fetchPipelineToolInstance,
        fetchSamplesToolInstance,
      ],
    });

    const reviewSubAgent = createReviewAgent({
      prompt: `Context is injected with XML-style tags. The full pipeline is in <current_pipeline> at the end of the user message — do not call fetch_pipeline for routine reviews. Use get_ecs_info to verify ECS field compliance.
Call submit_review as your final action with the full review and a concise summary.

<ecs_root_fields>
The following ECS root field groups are available. Use get_ecs_info with root_fields to drill into any of these:
${ecsRootFieldsSummary}
</ecs_root_fields>`,
      tools: [fetchPipelineToolInstance, ecsInfoTool, submitReviewTool()],
    });

    const automaticImportAgent = createAutomaticImportAgent({
      model,
      samples,
      subagents: [logAndEcsAnalyzerSubAgent, pipelineGeneratorSubAgent, reviewSubAgent],
    });

    const langSmithTracers =
      langSmithOptions?.apiKey && langSmithOptions?.projectName
        ? getLangSmithTracer({
            apiKey: langSmithOptions.apiKey,
            projectName: langSmithOptions.projectName,
            logger: this.logger,
          })
        : [];

    const phaseCallbackHandler = reportPhase
      ? new PhaseCallbackHandler(reportPhase, this.logger)
      : undefined;

    const invokeInput: AutomaticImportAgentStateUpdateType = {
      messages: [
        new HumanMessage({
          content: `You are tasked with generating an Elasticsearch ingest pipeline for the integration \`${integrationId}\` and data stream \`${dataStreamId}\`.`,
        }),
      ],
      current_pipeline: BOILERPLATE_PIPELINE,
    };

    const result = await automaticImportAgent.invoke(
      invokeInput as Parameters<typeof automaticImportAgent.invoke>[0],
      {
        callbacks: [...langSmithTracers, ...(phaseCallbackHandler ? [phaseCallbackHandler] : [])],
        runName: 'automatic_import_agent',
        tags: ['automatic_import_agent'],
        signal: abortSignal,
      }
    );

    if (phaseCallbackHandler) {
      await phaseCallbackHandler.flushPendingPhase();
    }

    return result;
  }
}
