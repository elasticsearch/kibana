/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { InferenceConnector } from '@kbn/inference-common';
import { InferenceConnectorType } from '@kbn/inference-common';

const OPENAI_MODELS_WITHOUT_TEMPERATURE = ['o1', 'o3', 'gpt-5'];

/**
 * Extracts the Azure OpenAI deployment name from an apiUrl of the form
 * `https://{resource}.cognitiveservices.azure.com/openai/deployments/{deployment}/...`.
 *
 * Azure OpenAI bakes the deployment identifier into the URL path (it is the
 * routing primitive — there is no other way to address a deployment), and
 * users overwhelmingly name their deployments after the model
 * (`gpt-5`, `o1-mini`, etc.). This lets us recover the model identity for
 * capability checks (temperature support, context window) when the caller
 * has not set `connector.config.defaultModel` or `providerConfig.model_id`.
 *
 * Returns the deployment segment (lowercased) or `undefined` if the URL
 * does not match the Azure OpenAI deployment shape — in which case the
 * caller should fall back to other resolution paths instead of guessing.
 */
const extractAzureDeploymentName = (apiUrl?: string): string | undefined => {
  if (typeof apiUrl !== 'string' || apiUrl.length === 0) return undefined;
  // Azure OpenAI URLs always carry the deployment as `/openai/deployments/<name>/`.
  // Anchor on `/openai/deployments/` to avoid matching unrelated paths.
  const match = apiUrl.match(/\/openai\/deployments\/([^/?#]+)(?:[/?#]|$)/i);
  if (!match) return undefined;
  try {
    // Deployment names can contain URL-encoded characters in pathological cases.
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
};

export const getTemperatureIfValid = (
  temperature?: number,
  { connector, modelName }: { connector?: InferenceConnector; modelName?: string } = {}
) => {
  // Escape hatch: if user sets temperature in the connector config, use it by default (including 0).
  // This should take priority over any automatic model-based exclusions.
  const connectorTemperature = connector?.config?.temperature;
  if (
    typeof connectorTemperature === 'number' &&
    isFinite(connectorTemperature) &&
    connectorTemperature >= 0
  ) {
    return { temperature: connectorTemperature };
  }

  // Resolution order for the model identity used to decide capability:
  //   1. Explicit `modelName` from the caller (e.g. LangChain `model` option).
  //   2. `providerConfig.model_id` for `.inference` endpoints.
  //   3. `defaultModel` set on the .gen-ai connector config.
  //   4. Azure OpenAI deployment name parsed from the connector's `apiUrl`
  //      (`/openai/deployments/<name>/`). This catches the common case
  //      where someone preconfigures an Azure GPT-5 / o1 / o3 connector
  //      without setting `defaultModel`. Without this fallback the
  //      inference layer sends `temperature: 0` (the chatComplete default)
  //      to a deployment that rejects it, with a confusing 400 error.
  const model =
    modelName ??
    connector?.config?.providerConfig?.model_id ??
    connector?.config?.defaultModel ??
    extractAzureDeploymentName(connector?.config?.apiUrl);

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
