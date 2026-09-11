/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isValidTraceId } from '@opentelemetry/api';
import type { CoreRequestHandlerContext, KibanaRequest } from '@kbn/core/server';
import type { EvaluationSubject, EvaluateResponse, Model } from '@kbn/evals-common';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { Logger } from '@kbn/logging';
import { z } from '@kbn/zod/v4';
import { withEvaluatorNameBaggage } from '../../../evaluators/evaluator_tracing_context';
import { getInstrumentationProfile } from '../../../evaluators/evidence/resolve_instrumentation';
import { formatEvidenceSchemaIssues } from '../../../evaluators/evidence/schema_issues';
import { createTraceAccessor } from '../../../evaluators/trace_accessor';
import { awaitTraceReady, TraceReadinessError } from '../../../evaluators/trace_readiness';
import type { EvaluatorDefinition } from '../../../evaluators/types';
import { resolveConnectorModel } from '../../../lib/resolve_connector_model';

export class EvaluationExecutionError extends Error {
  constructor(message: string, public readonly responseType: 'badRequest' | 'notFound') {
    super(message);
    this.name = 'EvaluationExecutionError';
  }
}

export interface ResolvedEvaluator {
  definition: EvaluatorDefinition;
  connectorId?: string;
}

interface ExecuteEvaluatorsOptions {
  coreContext: CoreRequestHandlerContext;
  request: KibanaRequest;
  subject: EvaluationSubject;
  evaluators: ResolvedEvaluator[];
  logger: Logger;
  getInferenceStart?: () => Promise<InferenceServerStart>;
}

export const executeEvaluators = async ({
  coreContext,
  request,
  subject,
  evaluators,
  logger,
  getInferenceStart,
}: ExecuteEvaluatorsOptions): Promise<EvaluateResponse['results']> => {
  if (subject.mode === 'multi-turn') {
    throw new EvaluationExecutionError('multi-turn evaluation is not yet supported', 'badRequest');
  }

  if (subject.traces.length !== 1) {
    throw new EvaluationExecutionError('single-turn mode requires exactly one trace', 'badRequest');
  }

  for (const { definition, connectorId } of evaluators) {
    if (definition.kind === 'llm' && !connectorId) {
      throw new EvaluationExecutionError(
        `connector_id is required for llm evaluator "${definition.name}"`,
        'badRequest'
      );
    }
  }

  const [{ trace_id: traceId, reference_data: referenceData }] = subject.traces;
  if (!isValidTraceId(traceId)) {
    throw new EvaluationExecutionError(
      'Invalid trace_id: must be a 32-character hex string',
      'badRequest'
    );
  }

  const parsedReferenceData = new Map<EvaluatorDefinition, Record<string, unknown> | undefined>();
  for (const { definition } of evaluators) {
    if (!definition.referenceDataSchema) {
      parsedReferenceData.set(definition, referenceData);
      continue;
    }

    const parsed = definition.referenceDataSchema.safeParse(referenceData);
    if (!parsed.success) {
      throw new EvaluationExecutionError(
        `Invalid reference_data for evaluator "${definition.name}": ${z.prettifyError(
          parsed.error
        )}`,
        'badRequest'
      );
    }
    parsedReferenceData.set(definition, parsed.data as Record<string, unknown>);
  }

  const traceAccessor = createTraceAccessor({
    traceId,
    esClient: coreContext.elasticsearch.client.asInternalUser,
  });
  const activeProfile = subject.instrumentation?.profile ?? 'elastic-inference';
  const resolvedMapping = getInstrumentationProfile(activeProfile);

  let round: Awaited<ReturnType<typeof awaitTraceReady>>;
  try {
    round = await awaitTraceReady(traceAccessor, resolvedMapping, activeProfile, logger);
  } catch (error) {
    if (error instanceof TraceReadinessError) {
      throw new EvaluationExecutionError(error.message, 'notFound');
    }
    throw error;
  }

  let inferenceStartPromise: Promise<InferenceServerStart> | undefined;
  const getInference = (): Promise<InferenceServerStart> | undefined => {
    if (!getInferenceStart) {
      logger.error('Inference start contract is not configured');
      return undefined;
    }
    inferenceStartPromise ??= getInferenceStart();
    return inferenceStartPromise;
  };

  const inferenceClientByConnectorId = new Map<string, BoundInferenceClient>();
  const getInferenceClient = async (
    connectorId: string
  ): Promise<BoundInferenceClient | undefined> => {
    const cachedClient = inferenceClientByConnectorId.get(connectorId);
    if (cachedClient) {
      return cachedClient;
    }

    const inferencePromise = getInference();
    if (!inferencePromise) {
      return undefined;
    }

    const inference = await inferencePromise;
    const inferenceClient = inference.getClient({ request, bindTo: { connectorId } });
    inferenceClientByConnectorId.set(connectorId, inferenceClient);
    return inferenceClient;
  };

  const modelByConnectorId = new Map<string, Promise<Model | undefined>>();
  const getModel = (connectorId: string): Promise<Model | undefined> | undefined => {
    const cachedModel = modelByConnectorId.get(connectorId);
    if (cachedModel) {
      return cachedModel;
    }

    const inferencePromise = getInference();
    if (!inferencePromise) {
      return undefined;
    }

    const model = inferencePromise.then((inference) =>
      resolveConnectorModel({ connectorId, inference, request, logger })
    );
    modelByConnectorId.set(connectorId, model);
    return model;
  };

  const describeEvaluator = async (
    definition: EvaluatorDefinition,
    connectorId?: string
  ): Promise<EvaluateResponse['results'][number]['evaluator']> => {
    const base = {
      name: definition.name,
      version: definition.version,
      kind: definition.kind,
      direction: definition.direction,
    };
    if (definition.kind !== 'llm' || !connectorId) {
      return base;
    }
    const model = await getModel(connectorId);
    return model ? { ...base, model } : base;
  };

  const results: EvaluateResponse['results'] = [];
  for (const { definition, connectorId } of evaluators) {
    if (definition.evidenceSchema) {
      const evidenceParsed = definition.evidenceSchema.safeParse(round);
      if (!evidenceParsed.success) {
        results.push({
          status: 'error',
          evaluator: await describeEvaluator(definition, connectorId),
          error: {
            code: 'evidence_unmet',
            message: `Evaluator evidence requirements not met: ${formatEvidenceSchemaIssues(
              evidenceParsed.error
            )}`,
          },
        });
        continue;
      }
    }

    try {
      const inferenceClient =
        definition.kind === 'llm' && connectorId
          ? await getInferenceClient(connectorId)
          : undefined;
      const result = await withEvaluatorNameBaggage(definition.name, () =>
        definition.evaluate({
          trace: traceAccessor,
          round,
          referenceData: parsedReferenceData.get(definition),
          inferenceClient,
          log: logger,
        })
      );

      results.push({
        status: 'ok',
        evaluator: await describeEvaluator(definition, connectorId),
        scores: result.scores,
      });
    } catch (error) {
      const errorDetail = error instanceof Error ? error.stack ?? error.message : String(error);
      logger.error(`Failed to execute evaluator "${definition.name}": ${errorDetail}`);
      results.push({
        status: 'error',
        evaluator: await describeEvaluator(definition, connectorId),
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return results;
};
