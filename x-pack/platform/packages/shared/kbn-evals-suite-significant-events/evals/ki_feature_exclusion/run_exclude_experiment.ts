/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isDuplicateFeature } from '@kbn/significant-events-schema';
import { identifyFeatures, type ExcludedFeatureSummary } from '@kbn/streams-ai';
import { featuresPrompt } from '@kbn/streams-ai/src/features/prompt';
import { sortBy } from 'lodash';
import type { Client } from '@elastic/elasticsearch';
import type { Logger } from '@kbn/core/server';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import { MANAGED_STREAM_NAME } from '../../src/datasets';
import type { ExcludeExperimentOutput } from '../../src/evaluators/ki_feature_exclusion/evaluators';
import { fetchSampleDocuments } from './fetch_sample_documents';

export async function runExcludeExperiment({
  esClient,
  excludeCount,
  followUpRuns,
  inferenceClient,
  logger,
  sampleSize,
  log,
}: {
  esClient: Client;
  excludeCount: number;
  followUpRuns: number;
  inferenceClient: BoundInferenceClient;
  logger: Logger;
  sampleSize: number;
  log: ToolingLog;
}): Promise<ExcludeExperimentOutput> {
  const abortController = new AbortController();

  const sampleDocuments = await fetchSampleDocuments({
    esClient,
    sampleSize,
    log,
  });

  const { features: initialFeatures } = await identifyFeatures({
    streamName: MANAGED_STREAM_NAME,
    sampleDocuments,
    systemPrompt: featuresPrompt,
    inferenceClient,
    logger,
    signal: abortController.signal,
  });

  log.info(`Initial identification returned ${initialFeatures.length} features`);

  if (initialFeatures.length < excludeCount) {
    log.info(
      `Not enough features identified (${initialFeatures.length}) to exclude ${excludeCount}, skipping follow-up runs`
    );
    return {
      initialFeatures,
      excludedFeatures: [],
      followUpRuns: [],
    };
  }

  const featuresToExclude = sortBy(initialFeatures, (f) => f.id).slice(0, excludeCount);
  const excludedFeatures: ExcludedFeatureSummary[] = featuresToExclude.map(
    ({ id, type, subtype, title, description, properties }) => ({
      id,
      type,
      subtype,
      title,
      description,
      properties,
    })
  );

  const outputs: ExcludeExperimentOutput['followUpRuns'] = [];

  for (let i = 0; i < followUpRuns; i++) {
    const { features: rawFeatures, ignoredFeatures } = await identifyFeatures({
      streamName: MANAGED_STREAM_NAME,
      sampleDocuments,
      excludedFeatures,
      systemPrompt: featuresPrompt,
      inferenceClient,
      logger,
      signal: abortController.signal,
    });

    const features = rawFeatures.filter(
      (feature) =>
        !excludedFeatures.some((excluded) =>
          isDuplicateFeature(feature, {
            ...excluded,
            stream_name: feature.stream_name,
            confidence: 0,
            description: excluded.description ?? '',
          })
        )
    );

    outputs.push({ features, rawFeatures, ignoredFeatures });
  }

  return {
    initialFeatures,
    excludedFeatures,
    followUpRuns: outputs,
  };
}
