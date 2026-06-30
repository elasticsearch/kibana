/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { describeDataset, formatDocumentAnalysis } from '@kbn/ai-tools';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ChatCompletionTokenCount, BoundInferenceClient } from '@kbn/inference-common';
import { getStreamSamplingSource, type Streams } from '@kbn/streams-schema';
import { withSpan } from '@kbn/apm-utils';
import { createGenerateStreamDescriptionPrompt } from './prompt';

/**
 * Generate a natural-language description
 */
export async function generateStreamDescription({
  stream,
  start,
  end,
  esClient,
  inferenceClient,
  signal,
  logger,
  systemPrompt,
}: {
  stream: Streams.all.Definition;
  start: number;
  end: number;
  esClient: ElasticsearchClient;
  inferenceClient: BoundInferenceClient;
  signal: AbortSignal;
  logger: Logger;
  systemPrompt: string;
}): Promise<{ description: string; tokensUsed?: ChatCompletionTokenCount }> {
  logger.debug(`Generating stream description for stream ${stream.name}`);

  logger.trace('Describing dataset for stream description');
  const analysis = await withSpan('describe_dataset_for_stream_description', () =>
    describeDataset({
      start,
      end,
      esClient,
      index: getStreamSamplingSource(stream),
    })
  );

  logger.trace('Formatting document analysis for stream description');
  const formattedAnalysis = await withSpan('format_document_analysis_for_stream_description', () =>
    Promise.resolve(
      formatDocumentAnalysis(analysis, {
        dropEmpty: true,
        dropUnmapped: false,
      })
    )
  );

  const prompt = createGenerateStreamDescriptionPrompt({ systemPrompt });

  logger.trace('Generating stream description via inference client');
  const response = await withSpan('generate_stream_description', () =>
    inferenceClient.prompt({
      input: {
        name: stream.name,
        dataset_analysis: JSON.stringify(formattedAnalysis),
      },
      prompt,
      abortSignal: signal,
    })
  );

  logger.debug('Stream description generated');

  return {
    description: response.content,
    tokensUsed: response.tokens,
  };
}
