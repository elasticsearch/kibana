/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceConnector, InferenceConnectorType, Model } from '@kbn/inference-common';
import {
  getConnectorModel,
  getConnectorFamily,
  getConnectorProvider,
  ModelProvider,
  ModelFamily,
} from '@kbn/inference-common';
import { isInferenceEndpointDefinition, type EvalConnector } from './eval_connector';

function providerStringToModel(
  provider: string,
  modelId?: string
): { provider: ModelProvider; family: ModelFamily } {
  switch (provider) {
    case 'elastic': {
      // Derive family from model_id — EIS hosts multiple provider families.
      if (modelId) {
        const id = modelId.toLowerCase();
        if (id.includes('gpt') || id.includes('openai') || id.includes('o1') || id.includes('o3')) {
          return { provider: ModelProvider.Elastic, family: ModelFamily.GPT };
        }
        if (id.includes('gemini')) {
          return { provider: ModelProvider.Elastic, family: ModelFamily.Gemini };
        }
        if (id.includes('claude') || id.includes('anthropic')) {
          return { provider: ModelProvider.Elastic, family: ModelFamily.Claude };
        }
      }
      return { provider: ModelProvider.Elastic, family: ModelFamily.Claude };
    }
    case 'anthropic':
      return { provider: ModelProvider.Anthropic, family: ModelFamily.Claude };
    case 'google':
      return { provider: ModelProvider.Google, family: ModelFamily.Gemini };
    case 'openai':
    default:
      return { provider: ModelProvider.OpenAI, family: ModelFamily.GPT };
  }
}

/** Describes the model behind a test connector, for attributing task and evaluator scores. */
export function buildModelFromConnector(connector: EvalConnector): Model {
  if (isInferenceEndpointDefinition(connector)) {
    const modelId =
      typeof connector.providerConfig?.model_id === 'string'
        ? connector.providerConfig.model_id
        : undefined;
    const { provider, family } = providerStringToModel(connector.provider, modelId);
    return { provider, family, id: modelId ?? connector.name };
  }

  // `.inference` stack connectors carry the same fields nested under `config`.
  const configProvider = connector.config?.provider;
  if (connector.actionTypeId === '.inference' && typeof configProvider === 'string') {
    const providerConfig = connector.config?.providerConfig as Record<string, unknown> | undefined;
    const modelId =
      typeof providerConfig?.model_id === 'string' ? providerConfig.model_id : undefined;
    const { provider, family } = providerStringToModel(configProvider, modelId);
    return { provider, family, id: modelId ?? connector.name };
  }

  // Stack connectors (.gen-ai, .bedrock, .gemini, etc.) — use the existing helpers.
  const inferenceConnector: InferenceConnector = {
    type: connector.actionTypeId as InferenceConnectorType,
    config: connector.config,
    connectorId: connector.id,
    name: connector.name,
    isPreconfigured: false,
    isInferenceEndpoint: false,
    capabilities: {
      contextWindowSize: 32000,
    },
  };

  return {
    family: getConnectorFamily(inferenceConnector),
    provider: getConnectorProvider(inferenceConnector),
    id: getConnectorModel(inferenceConnector) ?? connector.name,
  };
}
