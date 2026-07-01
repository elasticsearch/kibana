/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { getTemperatureIfValid } from './get_temperature';
import type { InferenceConnector } from '@kbn/inference-common';
import { InferenceConnectorType } from '@kbn/inference-common';

const OPENAI_CONNECTOR = { type: InferenceConnectorType.OpenAI } as InferenceConnector;
const GEMINI_CONNECTOR = { type: InferenceConnectorType.Gemini } as InferenceConnector;
describe('getTemperatureIfValid', () => {
  it('returns an empty object if temperature is undefined', () => {
    expect(
      getTemperatureIfValid(undefined, { connector: OPENAI_CONNECTOR, modelName: 'gpt-3.5-turbo' })
    ).toEqual({});
  });

  it('returns an object with temperature if OpenAI model accepts', () => {
    expect(
      getTemperatureIfValid(0.7, { connector: OPENAI_CONNECTOR, modelName: 'gpt-3.5-turbo' })
    ).toEqual({
      temperature: 0.7,
    });
    expect(
      getTemperatureIfValid(0.7, {
        connector: OPENAI_CONNECTOR,
        modelName: 'gpt-fake',
      })
    ).toEqual({
      temperature: 0.7,
    });
  });

  it('returns an object with temperature if not OpenAI connector', () => {
    expect(
      getTemperatureIfValid(0.7, {
        connector: GEMINI_CONNECTOR,
        modelName: 'gemma',
      })
    ).toEqual({
      temperature: 0.7,
    });
  });

  it("returns an empty object for OpenAI models that don't support temperature", () => {
    [
      'o1',
      'o1-pro',
      'o3',
      'o1-mini',
      'o3-mini',
      'gpt-5',
      'gpt-5.2-chat',
      'openai/gpt-5',
      'llm-gateway/gpt-5.2-chat',
    ].forEach((model) => {
      expect(getTemperatureIfValid(0.7, { connector: OPENAI_CONNECTOR, modelName: model })).toEqual(
        {}
      );
    });
  });

  it('keeps connector-config temperature even for excluded models (escape hatch)', () => {
    const connector = {
      type: InferenceConnectorType.OpenAI,
      config: { temperature: 0.25 },
    } as unknown as InferenceConnector;

    expect(
      getTemperatureIfValid(undefined, { connector, modelName: 'llm-gateway/gpt-5.2-chat' })
    ).toEqual({
      temperature: 0.25,
    });
  });

  it('uses connector-config temperature when model supports it (including 0)', () => {
    const connectorZero = {
      type: InferenceConnectorType.OpenAI,
      config: { temperature: 0 },
    } as unknown as InferenceConnector;

    expect(
      getTemperatureIfValid(undefined, { connector: connectorZero, modelName: 'gpt-4' })
    ).toEqual({
      temperature: 0,
    });

    const connectorNonZero = {
      type: InferenceConnectorType.OpenAI,
      config: { temperature: 0.25 },
    } as unknown as InferenceConnector;

    expect(
      getTemperatureIfValid(undefined, { connector: connectorNonZero, modelName: 'gpt-4' })
    ).toEqual({
      temperature: 0.25,
    });
  });

  describe('Azure OpenAI deployment URL fallback', () => {
    // Azure deployments hard-code the model identity into the URL path.
    // When neither `modelName`, `providerConfig.model_id`, nor `defaultModel`
    // is set, parsing the URL is the most reliable signal we have.

    it('omits temperature for Azure-hosted gpt-5 even when no defaultModel is set', () => {
      const connector = {
        type: InferenceConnectorType.OpenAI,
        config: {
          apiProvider: 'Azure OpenAI',
          apiUrl:
            'https://my-resource.cognitiveservices.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-04-01-preview',
        },
      } as unknown as InferenceConnector;

      // Caller doesn't pass modelName (typical when LangChain `model` is unset
      // and the agent_builder/converse handler relies on connector config).
      expect(getTemperatureIfValid(0, { connector, modelName: undefined })).toEqual({});
      expect(getTemperatureIfValid(0.7, { connector, modelName: undefined })).toEqual({});
    });

    it('omits temperature for Azure-hosted o1 / o3 deployments', () => {
      for (const deployment of ['o1', 'o1-mini', 'o3', 'o3-mini']) {
        const connector = {
          type: InferenceConnectorType.OpenAI,
          config: {
            apiProvider: 'Azure OpenAI',
            apiUrl: `https://r.cognitiveservices.azure.com/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`,
          },
        } as unknown as InferenceConnector;
        // Note: deployment context surfaced via the assertion failure message
        // would be nice, but Jest's `expect(value, msg)` shape isn't supported.
        // Loop-local var is enough to identify the failing case.
        expect(getTemperatureIfValid(0.5, { connector, modelName: undefined })).toEqual({});
      }
    });

    it('keeps temperature for Azure-hosted gpt-4 deployments', () => {
      const connector = {
        type: InferenceConnectorType.OpenAI,
        config: {
          apiProvider: 'Azure OpenAI',
          apiUrl:
            'https://r.cognitiveservices.azure.com/openai/deployments/gpt-4-turbo/chat/completions?api-version=2024-02-15-preview',
        },
      } as unknown as InferenceConnector;
      expect(getTemperatureIfValid(0.7, { connector, modelName: undefined })).toEqual({
        temperature: 0.7,
      });
    });

    it('explicit modelName still takes priority over URL-derived deployment name', () => {
      // Real-world case: deployment named `gpt-5` (URL says so) but caller
      // explicitly passes a known-temperature-friendly model. Trust the
      // caller — they have first-hand knowledge.
      const connector = {
        type: InferenceConnectorType.OpenAI,
        config: {
          apiProvider: 'Azure OpenAI',
          apiUrl:
            'https://r.cognitiveservices.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-04-01-preview',
        },
      } as unknown as InferenceConnector;
      expect(getTemperatureIfValid(0.5, { connector, modelName: 'gpt-4' })).toEqual({
        temperature: 0.5,
      });
    });

    it('URL fallback handles encoded deployment names', () => {
      const connector = {
        type: InferenceConnectorType.OpenAI,
        config: {
          apiUrl:
            'https://r.cognitiveservices.azure.com/openai/deployments/gpt-5%2Eextended/chat/completions?api-version=2025-04-01-preview',
        },
      } as unknown as InferenceConnector;
      expect(getTemperatureIfValid(0.5, { connector, modelName: undefined })).toEqual({});
    });

    it('non-Azure URLs are ignored by the fallback', () => {
      const connector = {
        type: InferenceConnectorType.OpenAI,
        config: {
          apiProvider: 'Other',
          apiUrl: 'https://api.example.com/v1/completions',
        },
      } as unknown as InferenceConnector;
      expect(getTemperatureIfValid(0.7, { connector, modelName: undefined })).toEqual({
        temperature: 0.7,
      });
    });

    it('malformed apiUrl does not blow up the fallback', () => {
      const connector = {
        type: InferenceConnectorType.OpenAI,
        config: {
          apiUrl: 'not a url at all',
        },
      } as unknown as InferenceConnector;
      // Should fall through to the temperature-from-request branch.
      expect(getTemperatureIfValid(0.7, { connector, modelName: undefined })).toEqual({
        temperature: 0.7,
      });
    });

    it('explicit defaultModel still wins over URL parsing', () => {
      // If the user did the right thing and set defaultModel, honor it
      // even if the URL deployment differs (some users name deployments
      // distinctly from the model id, e.g. "production-chat").
      const connector = {
        type: InferenceConnectorType.OpenAI,
        config: {
          apiUrl:
            'https://r.cognitiveservices.azure.com/openai/deployments/production-chat/chat/completions',
          defaultModel: 'gpt-4',
        },
      } as unknown as InferenceConnector;
      expect(getTemperatureIfValid(0.7, { connector, modelName: undefined })).toEqual({
        temperature: 0.7,
      });
    });
  });
});
