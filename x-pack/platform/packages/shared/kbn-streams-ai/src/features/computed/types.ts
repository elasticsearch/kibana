/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { Streams } from '@kbn/streams-schema';

/**
 * A provider that computes the value for an externally-backed computed feature.
 *
 * Some computed features (e.g. `code_analysis`) depend on capabilities that live
 * in the consuming plugin rather than in this package (Agent Builder tools, the
 * scoped request, feature flags). Those generators carry only metadata here and
 * delegate the actual computation to a provider the plugin injects via
 * {@link ComputedFeatureGeneratorOptions.providers}. Returning `undefined`
 * means "no feature" (e.g. nothing matched), and the result is skipped.
 */
export type ComputedFeatureProvider = (
  options: ComputedFeatureGeneratorOptions
) => Promise<Record<string, unknown> | undefined>;

/**
 * Options passed to each computed feature generator.
 */
export interface ComputedFeatureGeneratorOptions {
  stream: Streams.all.Definition;
  start: number;
  end: number;
  esClient: ElasticsearchClient;
  logger: Logger;
  /**
   * Optional providers for externally-backed computed features, keyed by
   * feature type. Injected by the consuming plugin; absent providers cause the
   * corresponding generator to be skipped.
   */
  providers?: Record<string, ComputedFeatureProvider | undefined>;
}

/**
 * Interface for computed feature generators.
 * Each generator is responsible for producing a specific type of computed feature.
 */
export interface ComputedFeatureGenerator {
  /**
   * Unique type identifier for this computed feature.
   */
  type: string;

  /**
   * Human-readable description of what this feature represents.
   */
  description: string;

  /**
   * Instructions for the LLM on how to use this computed feature.
   * This is automatically included in prompts so the LLM knows how to leverage this feature.
   */
  llmInstructions: string;

  /**
   * Generates the computed value for this feature. Returning `undefined` means
   * the generator produced no feature for this run (e.g. an externally-backed
   * generator whose provider is absent, or that found no match); such results
   * are skipped rather than persisted.
   */
  generate: (
    options: ComputedFeatureGeneratorOptions
  ) => Promise<Record<string, unknown> | undefined>;
}
