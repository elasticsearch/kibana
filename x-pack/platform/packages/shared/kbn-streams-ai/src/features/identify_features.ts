/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { compact, uniqBy } from 'lodash';
import type { Logger } from '@kbn/core/server';
import type { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import type { BoundInferenceClient, ChatCompletionTokenCount } from '@kbn/inference-common';
import {
  type BaseFeature,
  type IgnoredFeature,
  identifiedFeatureSchema,
  ignoredFeatureSchema,
} from '@kbn/significant-events-schema';
import { withSpan } from '@kbn/apm-utils';
import { conditionSchema, isConditionComplete, type Condition } from '@kbn/streamlang';
import { createIdentifyFeaturesPrompt } from './prompt';
import { formatRawDocument } from './utils/format_raw_document';
import { sumTokens } from '../helpers/sum_tokens';

export interface PreviouslyIdentifiedFeature {
  id: string;
  type: string;
  subtype?: string;
  title?: string;
  description?: string;
  properties: Record<string, unknown>;
}

export const toPreviouslyIdentifiedFeature = (
  feature: BaseFeature
): PreviouslyIdentifiedFeature => ({
  id: feature.id,
  type: feature.type,
  subtype: feature.subtype,
  title: feature.title,
  description: feature.description,
  properties: feature.properties,
});
export type { IgnoredFeature } from '@kbn/significant-events-schema';

export interface ExcludedFeatureSummary {
  id: string;
  type: string;
  subtype?: string;
  title?: string;
  description?: string;
  properties: Record<string, unknown>;
}

export interface IdentifyFeaturesOptions {
  streamName: string;
  sampleDocuments: Array<SearchHit<Record<string, unknown>>>;
  excludedFeatures?: ExcludedFeatureSummary[];
  inferenceClient: BoundInferenceClient;
  systemPrompt: string;
  logger: Logger;
  signal: AbortSignal;
  previouslyIdentifiedFeatures?: PreviouslyIdentifiedFeature[];
}

export async function identifyFeatures({
  streamName,
  sampleDocuments,
  excludedFeatures,
  systemPrompt,
  inferenceClient,
  signal,
  previouslyIdentifiedFeatures = [],
}: IdentifyFeaturesOptions): Promise<{
  features: BaseFeature[];
  ignoredFeatures: IgnoredFeature[];
  tokensUsed: ChatCompletionTokenCount;
}> {
  const formattedDocuments = compact(
    sampleDocuments.map((hit) =>
      formatRawDocument({
        hit,
        shouldNotTruncate(key: string) {
          return key.includes('tags');
        },
      })
    )
  );

  const previousFeaturesContext =
    previouslyIdentifiedFeatures.length > 0 ? JSON.stringify(previouslyIdentifiedFeatures) : '';

  const response = await withSpan('invoke_prompt', () =>
    inferenceClient.prompt({
      input: {
        sample_documents: JSON.stringify(formattedDocuments),
        previously_identified_features: previousFeaturesContext,
        excluded_features: excludedFeatures?.length ? JSON.stringify(excludedFeatures) : '',
      },
      prompt: createIdentifyFeaturesPrompt({ systemPrompt }),
      abortSignal: signal,
    })
  );

  const features = uniqBy(
    response.toolCalls
      .flatMap((toolCall) => toolCall.function.arguments.features)
      .map((feature) => {
        return {
          ...feature,
          stream_name: streamName,
          filter: tryParseFilter(feature.filter),
        };
      })
      .filter((feature) => {
        const result = identifiedFeatureSchema.safeParse(feature);
        if (!result.success) {
          return false;
        }

        // ensure that the feature has at least one stable identifying property
        return Object.keys(feature.properties).length > 0;
      }),
    (feature) => feature.id
  );

  const ignoredFeatures = response.toolCalls
    .flatMap((toolCall) => toolCall.function.arguments.ignored_features ?? [])
    .filter((item): item is IgnoredFeature => ignoredFeatureSchema.safeParse(item).success);

  return {
    features,
    ignoredFeatures,
    tokensUsed: sumTokens({ added: response.tokens }),
  };
}

function tryParseFilter(maybeFilter: unknown): Condition | undefined {
  if (!maybeFilter) {
    return undefined;
  }

  const result = conditionSchema.safeParse(maybeFilter);
  if (!result.success) {
    return undefined;
  }

  return isConditionComplete(result.data) ? result.data : undefined;
}
