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
const BEDROCK_CONNECTOR = { type: InferenceConnectorType.Bedrock } as InferenceConnector;
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

  describe('Bedrock Claude models without temperature support', () => {
    it('returns temperature for Claude 4.x models that support it', () => {
      [
        'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        'anthropic.claude-sonnet-4-6-20251101-v1:0',
        'us.anthropic.claude-opus-4-6-20251101-v1:0',
      ].forEach((model) => {
        expect(
          getTemperatureIfValid(0.7, { connector: BEDROCK_CONNECTOR, modelName: model })
        ).toEqual({ temperature: 0.7 });
      });
    });

    it("returns an empty object for Bedrock Claude models that don't support temperature (4.7+)", () => {
      [
        'us.anthropic.claude-sonnet-4-7-20251101-v1:0',
        'us.anthropic.claude-opus-4-8-20251101-v1:0',
        'anthropic.claude-haiku-4-7-20251101-v1:0',
        'us.anthropic.claude-opus-5-0-20260101-v1:0',
      ].forEach((model) => {
        expect(
          getTemperatureIfValid(0.7, { connector: BEDROCK_CONNECTOR, modelName: model })
        ).toEqual({});
      });
    });

    it('returns temperature for Claude 3.x models (different ID format)', () => {
      [
        'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
        'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      ].forEach((model) => {
        expect(
          getTemperatureIfValid(0.7, { connector: BEDROCK_CONNECTOR, modelName: model })
        ).toEqual({ temperature: 0.7 });
      });
    });

    it('ignores connector-config temperature for Bedrock Claude 4.7+ models (API rejects it)', () => {
      const connector = {
        type: InferenceConnectorType.Bedrock,
        config: { temperature: 0.5 },
      } as unknown as InferenceConnector;

      expect(
        getTemperatureIfValid(0.7, {
          connector,
          modelName: 'us.anthropic.claude-opus-4-8-20251101-v1:0',
        })
      ).toEqual({});
    });
  });

  describe('Inference connector backed by Amazon Bedrock', () => {
    const bedrockInferenceConnector = {
      type: InferenceConnectorType.Inference,
      config: { provider: 'amazonbedrock' },
    } as unknown as InferenceConnector;

    it('returns an empty object for Claude 4.7+ models via inference connector (temperature deprecated)', () => {
      [
        'us.anthropic.claude-sonnet-4-7-20251101-v1:0',
        'us.anthropic.claude-opus-4-8-20251101-v1:0',
      ].forEach((model) => {
        expect(
          getTemperatureIfValid(0.7, {
            connector: bedrockInferenceConnector,
            modelName: model,
          })
        ).toEqual({});
      });
    });

    it('returns temperature for Claude 4.6 and earlier via inference connector', () => {
      expect(
        getTemperatureIfValid(0.7, {
          connector: bedrockInferenceConnector,
          modelName: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        })
      ).toEqual({ temperature: 0.7 });
    });

    it('does not apply Claude exclusion for non-Bedrock inference connectors', () => {
      const openAiInferenceConnector = {
        type: InferenceConnectorType.Inference,
        config: { provider: 'openai' },
      } as unknown as InferenceConnector;

      expect(
        getTemperatureIfValid(0.7, {
          connector: openAiInferenceConnector,
          modelName: 'us.anthropic.claude-opus-4-8-20251101-v1:0',
        })
      ).toEqual({ temperature: 0.7 });
    });
  });
});
