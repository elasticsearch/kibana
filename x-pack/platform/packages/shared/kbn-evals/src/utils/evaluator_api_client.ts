/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { SomeDevLog } from '@kbn/some-dev-log';
import {
  API_VERSIONS,
  EVALS_EVALUATE_URL,
  EvaluateResponse,
  type EvaluateRequestBodyInput,
} from '@kbn/evals-common';
import type { Evaluator, EvaluatorParams, Example, TaskOutput } from '../types';

export type MapContextFn<TOutput = TaskOutput> = (params: EvaluatorParams<Example, TOutput>) => {
  trace_id: string;
  reference_data?: Record<string, unknown>;
};

const defaultMapContext: MapContextFn = ({ output, expected }) => ({
  trace_id: (output as Record<string, unknown>)?.traceId as string,
  reference_data: expected as Record<string, unknown> | undefined,
});

const VERSIONED_HEADERS = { 'elastic-api-version': API_VERSIONS.internal.v1 };

const getResponseData = (response: unknown): unknown => {
  if (typeof response === 'object' && response !== null && 'data' in response) {
    return (response as { data: unknown }).data;
  }
  return response;
};

export class EvaluatorApiClient {
  constructor(private readonly kbnClient: KbnClient, private readonly log: SomeDevLog) {}

  async evaluate(body: EvaluateRequestBodyInput): Promise<EvaluateResponse> {
    const response = await this.kbnClient.request({
      path: EVALS_EVALUATE_URL,
      method: 'POST',
      body,
      headers: VERSIONED_HEADERS,
    });
    return EvaluateResponse.parse(getResponseData(response));
  }

  toEvaluator(
    evaluatorName: string,
    options: {
      version?: string;
      connectorId?: string;
      mapContext?: MapContextFn;
    } = {}
  ): Evaluator {
    const { version, connectorId, mapContext } = options;

    return {
      name: evaluatorName,
      kind: 'LLM',
      evaluate: async (params) => {
        const mapped = (mapContext ?? defaultMapContext)(params);
        try {
          const result = await this.evaluate({
            subject: {
              mode: 'single-turn',
              traces: [mapped],
            },
            evaluators: [
              {
                name: evaluatorName,
                version,
                connector_id: connectorId,
              },
            ],
          });
          const firstResult = result.results[0];
          if (!firstResult) {
            throw new Error(`No evaluation result returned for "${evaluatorName}"`);
          }
          if (firstResult.status === 'error') {
            throw new Error(firstResult.error?.message ?? `Evaluator "${evaluatorName}" failed`);
          }
          const score = firstResult.scores?.[0];
          if (!score) {
            throw new Error(`No scores returned for "${evaluatorName}"`);
          }
          return {
            score: score.score,
            label: score.label,
            explanation: score.explanation,
            metadata: score.metadata,
          };
        } catch (error) {
          this.log.error(`Failed to execute evaluator "${evaluatorName}": ${error}`);
          throw error;
        }
      },
    };
  }

  toEvaluators(
    configs: Array<{ name: string; version?: string; connectorId?: string }>,
    options: { mapContext?: MapContextFn } = {}
  ): Evaluator[] {
    const { mapContext } = options;
    const evaluationsByTrace = new Map<string, Promise<EvaluateResponse>>();

    const evaluateForTrace = (params: EvaluatorParams<Example, TaskOutput>) => {
      const mapped = (mapContext ?? defaultMapContext)(params);
      const traceId = mapped.trace_id;
      const existing = evaluationsByTrace.get(traceId);
      if (existing) {
        return existing;
      }

      const evaluation = this.evaluate({
        subject: {
          mode: 'single-turn',
          traces: [mapped],
        },
        evaluators: configs.map(({ name, version, connectorId }) => ({
          name,
          version,
          connector_id: connectorId,
        })),
      });
      evaluationsByTrace.set(traceId, evaluation);
      return evaluation;
    };

    return configs.map((config) => ({
      name: config.name,
      kind: 'LLM',
      evaluate: async (params) => {
        try {
          const result = await evaluateForTrace(params);
          const item = result.results.find((entry) => entry.name === config.name);
          if (!item) {
            throw new Error(`No evaluation result returned for "${config.name}"`);
          }
          if (item.status === 'error') {
            throw new Error(item.error?.message ?? `Evaluator "${config.name}" failed`);
          }
          const score = item.scores?.[0];
          if (!score) {
            throw new Error(`No scores returned for "${config.name}"`);
          }
          return {
            score: score.score,
            label: score.label,
            explanation: score.explanation,
            metadata: score.metadata,
          };
        } catch (error) {
          this.log.error(`Failed to execute evaluator "${config.name}": ${error}`);
          throw error;
        }
      },
    }));
  }

  toSubScoreEvaluators(
    config: {
      name: string;
      version?: string;
      connectorId?: string;
      subScores: Array<{ key: string; evaluatorName: string }>;
    },
    options: { mapContext?: MapContextFn } = {}
  ): Evaluator[] {
    const { mapContext } = options;
    const evaluationsByTrace = new Map<string, Promise<EvaluateResponse>>();

    const evaluateForTrace = (params: EvaluatorParams<Example, TaskOutput>) => {
      const mapped = (mapContext ?? defaultMapContext)(params);
      const traceId = mapped.trace_id;
      const existing = evaluationsByTrace.get(traceId);
      if (existing) {
        return existing;
      }

      const evaluation = this.evaluate({
        subject: {
          mode: 'single-turn',
          traces: [mapped],
        },
        evaluators: [
          {
            name: config.name,
            version: config.version,
            connector_id: config.connectorId,
          },
        ],
      });
      evaluationsByTrace.set(traceId, evaluation);
      return evaluation;
    };

    return config.subScores.map(({ key, evaluatorName }) => ({
      name: evaluatorName,
      kind: 'LLM',
      evaluate: async (params) => {
        try {
          const result = await evaluateForTrace(params);
          const item = result.results[0];
          if (!item) {
            throw new Error(`No evaluation result returned for "${config.name}"`);
          }
          if (item.status === 'error') {
            throw new Error(item.error?.message ?? `Evaluator "${config.name}" failed`);
          }
          const score = item.scores?.find((entry) => entry.name === key);
          if (!score) {
            throw new Error(`No sub-score "${key}" returned for "${config.name}"`);
          }
          return {
            score: score.score,
            label: score.label,
            explanation: score.explanation,
            metadata: score.metadata,
          };
        } catch (error) {
          this.log.error(
            `Failed to execute evaluator "${config.name}" sub-score "${key}": ${error}`
          );
          throw error;
        }
      },
    }));
  }
}
