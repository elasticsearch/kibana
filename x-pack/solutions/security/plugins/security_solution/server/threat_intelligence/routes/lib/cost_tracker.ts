/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type {
  CostTrace,
  StageCostTrace,
} from '../../../../common/threat_intelligence/correlation/schemas';

export interface StageUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Extracts token-usage counts from a LangChain AIMessage `response_metadata`
 * object in a best-effort, provider-agnostic way.
 *
 * Different connectors/providers surface token counts under different keys:
 *  - Anthropic (via Kibana inference plugin): `{ usage: { input_tokens, output_tokens } }`
 *  - OpenAI-compat: `{ tokenUsage: { promptTokens, completionTokens, totalTokens } }`
 *
 * Returns zero counts when the connector does not emit usage data so callers
 * can unconditionally accumulate without null checks.
 */
export const extractUsageFromMetadata = (metadata: Record<string, unknown>): StageUsage => {
  const usage = metadata?.usage as Record<string, unknown> | undefined;
  const tokenUsage = metadata?.tokenUsage as Record<string, unknown> | undefined;

  const input = Number(usage?.input_tokens ?? tokenUsage?.promptTokens ?? 0);
  const output = Number(usage?.output_tokens ?? tokenUsage?.completionTokens ?? 0);
  const total = Number(tokenUsage?.totalTokens ?? input + output);

  return { inputTokens: input, outputTokens: output, totalTokens: total };
};

/**
 * Logs per-call token usage at INFO level tagged by stage and connector so
 * cost can be queried from Kibana logs or forwarded to a metering system.
 *
 * Format (one line per call):
 *   [ti:cost] stage=<stage> connector=<connectorId>
 *             input_tokens=<n> output_tokens=<n> total_tokens=<n>
 */
// ---------------------------------------------------------------------------
// Pricing table — $/M tokens, keyed by substring of connector.config.model.
// Update against https://www.anthropic.com/pricing when new models launch.
// Patterns are matched in order; first match wins (most-specific first).
// ---------------------------------------------------------------------------

interface ModelPricing {
  pattern: string;
  inputUsdPerM: number;
  outputUsdPerM: number;
}

const PRICING_TABLE: readonly ModelPricing[] = [
  // Claude 4 family — API format: claude-{family}-4.x / haiku-4 / sonnet-4 / opus-4
  { pattern: 'haiku-4', inputUsdPerM: 0.8, outputUsdPerM: 4.0 },
  { pattern: 'sonnet-4', inputUsdPerM: 3.0, outputUsdPerM: 15.0 },
  { pattern: 'opus-4', inputUsdPerM: 15.0, outputUsdPerM: 75.0 },
  // Claude 4 family — EIS hosted format: anthropic-claude-4.x-{family}
  { pattern: '4.5-haiku', inputUsdPerM: 0.8, outputUsdPerM: 4.0 },
  { pattern: '4.6-sonnet', inputUsdPerM: 3.0, outputUsdPerM: 15.0 },
  { pattern: '4.7-sonnet', inputUsdPerM: 3.0, outputUsdPerM: 15.0 },
  { pattern: '4.7-opus', inputUsdPerM: 15.0, outputUsdPerM: 75.0 },
  { pattern: '4.8-opus', inputUsdPerM: 15.0, outputUsdPerM: 75.0 },
  // Claude 3.x family
  { pattern: '3-5-haiku', inputUsdPerM: 0.8, outputUsdPerM: 4.0 },
  { pattern: '3-haiku', inputUsdPerM: 0.25, outputUsdPerM: 1.25 },
  { pattern: '3-7-sonnet', inputUsdPerM: 3.0, outputUsdPerM: 15.0 },
  { pattern: '3-5-sonnet', inputUsdPerM: 3.0, outputUsdPerM: 15.0 },
  { pattern: '3-opus', inputUsdPerM: 15.0, outputUsdPerM: 75.0 },
];

const lookupPricing = (modelName: string | undefined): ModelPricing | undefined => {
  if (!modelName) return undefined;
  const lower = modelName.toLowerCase();
  return PRICING_TABLE.find((p) => lower.includes(p.pattern));
};

const computeCostUsd = (
  modelName: string | undefined,
  inputTokens: number,
  outputTokens: number
): number => {
  const pricing = lookupPricing(modelName);
  if (!pricing) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.inputUsdPerM +
    (outputTokens / 1_000_000) * pricing.outputUsdPerM
  );
};

// ---------------------------------------------------------------------------
// CostTraceBuilder — accumulated per-stage trace for a single pipeline run.
// Create one in correlateThreat(), pass as optional to each LLM service,
// then call build() to produce the CostTrace attached to CorrelationFindings.
// ---------------------------------------------------------------------------

export class CostTraceBuilder {
  private readonly stages: StageCostTrace[] = [];

  addStage(opts: {
    stage: string;
    connectorId: string;
    modelName: string | undefined;
    metadata: Record<string, unknown>;
    wallMs: number;
  }): void {
    const { inputTokens, outputTokens } = extractUsageFromMetadata(opts.metadata);
    this.stages.push({
      stage: opts.stage,
      connector_id: opts.connectorId,
      model_name: opts.modelName,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: computeCostUsd(opts.modelName, inputTokens, outputTokens),
      wall_ms: opts.wallMs,
    });
  }

  build(): CostTrace {
    return {
      stages: [...this.stages],
      total_input_tokens: this.stages.reduce((s, t) => s + t.input_tokens, 0),
      total_output_tokens: this.stages.reduce((s, t) => s + t.output_tokens, 0),
      total_cost_usd: this.stages.reduce((s, t) => s + t.cost_usd, 0),
      total_wall_ms: this.stages.reduce((s, t) => s + t.wall_ms, 0),
    };
  }
}

export const logStageUsage = (
  logger: Logger,
  stage: string,
  connectorId: string,
  metadata: Record<string, unknown>
): void => {
  const { inputTokens, outputTokens, totalTokens } = extractUsageFromMetadata(metadata);
  logger.info(
    `[ti:cost] stage=${stage} connector=${connectorId} ` +
      `input_tokens=${inputTokens} output_tokens=${outputTokens} total_tokens=${totalTokens}`
  );
};
