/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CODE_ANALYSIS_FEATURE_TYPE, COMPUTED_FEATURE_TYPES } from '@kbn/significant-events-schema';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { Streams } from '@kbn/streams-schema';
import { codeAnalysisGenerator, CODE_ANALYSIS_PROVIDER_KEY } from './code_analysis';
import type { ComputedFeatureGeneratorOptions } from './types';

const baseOptions = (
  overrides: Partial<ComputedFeatureGeneratorOptions> = {}
): ComputedFeatureGeneratorOptions => ({
  stream: { name: 'logs.acme' } as Streams.all.Definition,
  start: 0,
  end: 1,
  esClient: {} as ElasticsearchClient,
  logger: { debug: jest.fn() } as unknown as Logger,
  ...overrides,
});

describe('codeAnalysisGenerator', () => {
  it('is registered as a computed feature type', () => {
    expect(COMPUTED_FEATURE_TYPES).toContain(CODE_ANALYSIS_FEATURE_TYPE);
    expect(codeAnalysisGenerator.type).toBe(CODE_ANALYSIS_FEATURE_TYPE);
    expect(CODE_ANALYSIS_PROVIDER_KEY).toBe(CODE_ANALYSIS_FEATURE_TYPE);
  });

  it('returns undefined (skipped) when no provider is injected', async () => {
    await expect(codeAnalysisGenerator.generate(baseOptions())).resolves.toBeUndefined();
  });

  it('delegates to the injected provider and returns its value', async () => {
    const value = { repository: 'acme/checkout', verified_strings: ['x'], evidence: [] };
    const provider = jest.fn().mockResolvedValue(value);
    const options = baseOptions({ providers: { [CODE_ANALYSIS_PROVIDER_KEY]: provider } });

    await expect(codeAnalysisGenerator.generate(options)).resolves.toBe(value);
    expect(provider).toHaveBeenCalledWith(options);
  });

  it('returns undefined when the provider produces no feature', async () => {
    const provider = jest.fn().mockResolvedValue(undefined);
    const options = baseOptions({ providers: { [CODE_ANALYSIS_PROVIDER_KEY]: provider } });

    await expect(codeAnalysisGenerator.generate(options)).resolves.toBeUndefined();
  });
});
