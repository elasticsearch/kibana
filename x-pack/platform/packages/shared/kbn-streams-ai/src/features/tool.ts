/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type Feature } from '@kbn/significant-events-schema';
import { pick } from 'lodash';

export interface GetStreamFeaturesInput {
  feature_types?: unknown;
  min_confidence?: unknown;
  limit?: unknown;
}

export interface GetStreamFeaturesQuery<T extends string = string> {
  featureTypes?: T[];
  minConfidence?: number;
  limit?: number;
}

export type LlmFeature = Pick<
  Feature,
  | 'id'
  | 'type'
  | 'subtype'
  | 'title'
  | 'description'
  | 'confidence'
  | 'properties'
  | 'evidence'
  | 'tags'
  | 'meta'
  | 'filter'
>;

export function resolveFeatureTypeFilters<T extends string>(
  featureTypes?: T[]
): string[] | undefined {
  if (!featureTypes || featureTypes.length === 0) {
    return undefined;
  }

  return [...new Set(featureTypes)];
}

export function createGetFeatureTypesFromToolArgs<T extends string>(allowedTypes: readonly T[]) {
  return function getFeatureTypesFromToolArgs(toolArguments: unknown): T[] | undefined {
    const args = (toolArguments ?? {}) as GetStreamFeaturesInput;
    if (!Array.isArray(args.feature_types)) {
      return undefined;
    }

    const validTypes = args.feature_types.filter((value): value is T =>
      allowedTypes.includes(value as T)
    );

    return validTypes.length > 0 ? validTypes : undefined;
  };
}

function getMinConfidenceFromToolArgs(toolArguments: unknown): number | undefined {
  const args = (toolArguments ?? {}) as GetStreamFeaturesInput;
  if (typeof args.min_confidence !== 'number' || Number.isNaN(args.min_confidence)) {
    return undefined;
  }

  if (args.min_confidence < 0 || args.min_confidence > 100) {
    return undefined;
  }

  return args.min_confidence;
}

function getLimitFromToolArgs(toolArguments: unknown): number | undefined {
  const args = (toolArguments ?? {}) as GetStreamFeaturesInput;
  if (typeof args.limit !== 'number' || Number.isNaN(args.limit)) {
    return undefined;
  }

  const normalizedLimit = Math.floor(args.limit);
  if (normalizedLimit <= 0) {
    return undefined;
  }

  return normalizedLimit;
}

export function createGetFeatureQueryFromToolArgs<T extends string>(allowedTypes: readonly T[]) {
  const getFeatureTypesFromToolArgs = createGetFeatureTypesFromToolArgs(allowedTypes);

  return function getFeatureQueryFromToolArgs(toolArguments: unknown): GetStreamFeaturesQuery<T> {
    return {
      featureTypes: getFeatureTypesFromToolArgs(toolArguments),
      minConfidence: getMinConfidenceFromToolArgs(toolArguments),
      limit: getLimitFromToolArgs(toolArguments),
    };
  };
}

export function toFeatureForLlmContext(feature: Feature): LlmFeature {
  return pick(feature, [
    'id',
    'type',
    'subtype',
    'title',
    'description',
    'confidence',
    'properties',
    'evidence',
    'tags',
    'filter',
    'meta',
  ]);
}

export function createGetStreamFeaturesTool<T extends string>(allowedTypes: readonly T[]) {
  return {
    description:
      'Fetches extracted stream features for this stream. Supports optional filtering by type, confidence, and limit.',
    schema: {
      type: 'object' as const,
      properties: {
        feature_types: {
          type: 'array' as const,
          items: {
            type: 'string' as const,
            enum: allowedTypes,
          },
        },
        min_confidence: {
          type: 'number' as const,
          minimum: 0,
          maximum: 100,
        },
        limit: {
          type: 'number' as const,
          minimum: 1,
        },
      },
    },
  };
}
