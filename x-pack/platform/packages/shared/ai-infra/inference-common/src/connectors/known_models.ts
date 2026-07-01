/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ModelFamily, ModelProvider } from '../model_provider';

export interface ModelDefinition {
  id: string;
  provider: ModelProvider;
  family: ModelFamily;
  contextWindow: number;
}

/**
 * Retrieve a model definition from the given full model name, if available.
 */
export const getModelDefinition = (fullModelName: string): ModelDefinition | undefined => {
  return knownModels.find(
    (model) =>
      fullModelName.includes(model.id) || fullModelName.includes(model.id.replaceAll('.', '-'))
  );
};

/**
 * List of manually maintained model definitions to use as fallback for feature detection.
 */
export const knownModels: ModelDefinition[] = [
  {
    id: 'gpt-4o-mini',
    provider: ModelProvider.OpenAI,
    family: ModelFamily.GPT,
    contextWindow: 128000,
  },
  {
    id: 'gpt-4o',
    provider: ModelProvider.OpenAI,
    family: ModelFamily.GPT,
    contextWindow: 128000,
  },
  {
    id: 'gpt-4.1-mini',
    provider: ModelProvider.OpenAI,
    family: ModelFamily.GPT,
    contextWindow: 1000000,
  },
  {
    id: 'gpt-4.1-nano',
    provider: ModelProvider.OpenAI,
    family: ModelFamily.GPT,
    contextWindow: 1000000,
  },
  {
    id: 'gpt-4.1',
    provider: ModelProvider.OpenAI,
    family: ModelFamily.GPT,
    contextWindow: 1000000,
  },
  {
    id: 'gemini-1.5-pro',
    provider: ModelProvider.Google,
    family: ModelFamily.Gemini,
    contextWindow: 1000000,
  },
  {
    id: 'gemini-1.5-flash',
    provider: ModelProvider.Google,
    family: ModelFamily.Gemini,
    contextWindow: 1000000,
  },
  {
    id: 'gemini-2.0-flash',
    provider: ModelProvider.Google,
    family: ModelFamily.Gemini,
    contextWindow: 1000000,
  },
  {
    id: 'gemini-2.0-pro',
    provider: ModelProvider.Google,
    family: ModelFamily.Gemini,
    contextWindow: 2000000,
  },
  {
    id: 'gemini-2.0-flash-lite',
    provider: ModelProvider.Google,
    family: ModelFamily.Gemini,
    contextWindow: 1000000,
  },
  {
    id: 'gemini-2.5-pro',
    provider: ModelProvider.Google,
    family: ModelFamily.Gemini,
    contextWindow: 1000000,
  },
  {
    id: 'gemini-2.5-flash',
    provider: ModelProvider.Google,
    family: ModelFamily.Gemini,
    contextWindow: 128000, // or 1000000 in MAX mode...
  },
  // Claude models
  {
    id: 'claude-3-sonnet',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  {
    id: 'claude-3-haiku',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  {
    id: 'claude-3-opus',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  {
    id: 'claude-3.5-sonnet',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  {
    id: 'claude-3.5-haiku',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  {
    id: 'claude-3.7-sonnet',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  // Claude 4+ entries use the `<role>-<version>` order that matches the
  // real Bedrock model IDs (e.g. `us.anthropic.claude-sonnet-4-5-20250929-v1:0`,
  // `us.anthropic.claude-opus-4-7`). The earlier `<version>-<role>` form (e.g.
  // `claude-4.6-sonnet`) does not appear in any real provider id and would
  // never match via the substring lookup in `getModelDefinition`.
  // More-specific entries come first so `.find` resolves them before the
  // base-version fallback (e.g. `claude-opus-4` would otherwise swallow
  // `us.anthropic.claude-opus-4-7`).
  {
    id: 'claude-opus-4.7',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  {
    id: 'claude-opus-4.6',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  {
    id: 'claude-opus-4',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  {
    id: 'claude-sonnet-4.6',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 1000000,
  },
  {
    id: 'claude-sonnet-4.5',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 1000000,
  },
  {
    id: 'claude-sonnet-4',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 1000000,
  },
  {
    id: 'claude-haiku-4.5',
    provider: ModelProvider.Anthropic,
    family: ModelFamily.Claude,
    contextWindow: 200000,
  },
  // OpenAI o-series reasoning models
  {
    id: 'o3-mini',
    provider: ModelProvider.OpenAI,
    family: ModelFamily.GPT,
    contextWindow: 200000,
  },
  {
    id: 'o3',
    provider: ModelProvider.OpenAI,
    family: ModelFamily.GPT,
    contextWindow: 200000,
  },
  {
    id: 'o4-mini',
    provider: ModelProvider.OpenAI,
    family: ModelFamily.GPT,
    contextWindow: 200000,
  },
];
