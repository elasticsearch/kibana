/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseFeature } from '@kbn/streams-schema';
import { codeAnalysisGenerator } from './code_analysis';
import { datasetAnalysisGenerator } from './dataset_analysis';
import { errorLogsGenerator } from './error_logs';
import { logPatternsGenerator } from './log_patterns';
import { logSamplesGenerator } from './log_samples';
import type { ComputedFeatureGenerator, ComputedFeatureGeneratorOptions } from './types';

/**
 * Internal registry for computed feature generators.
 * Ensures each feature type is unique.
 */
class ComputedFeatureRegistry {
  private generators = new Map<string, ComputedFeatureGenerator>();

  register(generator: ComputedFeatureGenerator): void {
    if (this.generators.has(generator.type)) {
      throw new Error(`Computed feature type "${generator.type}" is already registered`);
    }
    this.generators.set(generator.type, generator);
  }

  getAll(): ComputedFeatureGenerator[] {
    return Array.from(this.generators.values());
  }
}

/**
 * Internal registry instance.
 *
 * To add a new computed feature:
 * 1. Create a new file in this folder implementing ComputedFeatureGenerator
 * 2. Import and add your generator to the array below
 */
const registry = new ComputedFeatureRegistry();

const generators: ComputedFeatureGenerator[] = [
  datasetAnalysisGenerator,
  logSamplesGenerator,
  logPatternsGenerator,
  errorLogsGenerator,
  codeAnalysisGenerator,
];

generators.forEach((generator) => registry.register(generator));

/**
 * Returns formatted LLM instructions for all computed feature types.
 * This is automatically included in prompts so the LLM knows how to use each feature type.
 */
export function getComputedFeatureInstructions(): string {
  return registry
    .getAll()
    .map((generator) => `**${generator.type}**: ${generator.llmInstructions}`)
    .join('\n\n');
}

/**
 * Converts a generator and its computed value into a BaseFeature.
 */
function toComputedFeature(
  generator: ComputedFeatureGenerator,
  value: Record<string, unknown>,
  streamName: string
): BaseFeature {
  return {
    id: generator.type,
    stream_name: streamName,
    description: generator.description,
    type: generator.type,
    properties: value,
    confidence: 100,
  };
}

/**
 * Generates all computed features by running all registered generators in parallel.
 *
 * Generators that return `undefined` (e.g. an externally-backed generator whose
 * provider is absent or that found no match) are skipped.
 */
export async function generateAllComputedFeatures(
  options: ComputedFeatureGeneratorOptions
): Promise<BaseFeature[]> {
  const results = await Promise.all(
    registry.getAll().map(async (generator) => {
      const value = await generator.generate(options);
      if (value === undefined) {
        return undefined;
      }
      return toComputedFeature(generator, value, options.stream.name);
    })
  );

  return results.filter((feature): feature is BaseFeature => feature !== undefined);
}
