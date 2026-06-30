/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { InferenceConnector } from '@kbn/inference-common';
import { InferenceConnectorType, InferenceEndpointProvider } from '@kbn/inference-common';
import { claudeModelSupportsTemperature } from '@kbn/connector-schemas/bedrock';

const OPENAI_MODELS_WITHOUT_TEMPERATURE = ['o1', 'o3', 'gpt-5'];

export const getTemperatureIfValid = (
  temperature?: number,
  { connector, modelName }: { connector?: InferenceConnector; modelName?: string } = {}
) => {
  const model =
    modelName ?? connector?.config?.providerConfig?.model_id ?? connector?.config?.defaultModel;

  const isBedrockBacked =
    connector?.type === InferenceConnectorType.Bedrock ||
    (connector?.type === InferenceConnectorType.Inference &&
      connector?.config?.provider === InferenceEndpointProvider.AmazonBedrock);

  // Claude 4.7+ deprecated temperature — reject it regardless of source (connector config or caller).
  if (isBedrockBacked && model && !claudeModelSupportsTemperature(model)) {
    return {};
  }

  // Escape hatch: if user sets temperature in the connector config, use it (including 0).
  const connectorTemperature = connector?.config?.temperature;
  if (
    typeof connectorTemperature === 'number' &&
    isFinite(connectorTemperature) &&
    connectorTemperature >= 0
  ) {
    return { temperature: connectorTemperature };
  }

  if (
    (connector?.type === InferenceConnectorType.OpenAI ||
      connector?.type === InferenceConnectorType.Inference) &&
    model
  ) {
    const normalizedModelName = model.toLowerCase();
    // Model names may include provider prefixes like `openai/gpt-5` or `llm-gateway/gpt-5.2-chat`.
    // Temperature support is determined by the base model name (segment after the last `/`).
    const baseModelName = normalizedModelName.split('/').pop() ?? normalizedModelName;

    const shouldExcludeTemperature = OPENAI_MODELS_WITHOUT_TEMPERATURE.some(
      // e.g `openai/gpt-5` or `gpt-5-xxx` or `llm-gateway/gpt-5.2-chat`
      (m) => baseModelName.startsWith(m) || baseModelName.endsWith(m)
    );
    if (shouldExcludeTemperature) {
      // Some models reject non-default temperature values (or reject the param entirely). Let the
      // provider default apply by omitting the parameter.
      return {};
    }
  }

  if (temperature === undefined || temperature < 0) return {};

  // Else, use the temperature from the request
  return { temperature };
};
