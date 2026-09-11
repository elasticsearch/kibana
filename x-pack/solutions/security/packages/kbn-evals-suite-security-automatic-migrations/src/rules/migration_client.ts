/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnEvalsHttpHandler } from '@kbn/evals/src/utils/http_handler_from_kbn_client';

// Inlined to avoid package→plugin import boundary violation.
const SIEM_RULE_MIGRATION_INVOKE_PATH = '/internal/siem_migrations/rules/_invoke';

/** Mirrors MigrateRuleState from the plugin — do not import directly. */
export interface InvokeRuleOutput {
  id: string;
  original_rule: {
    id: string;
    vendor: 'splunk' | 'qradar';
    title: string;
    description: string;
    query: string;
    query_language: string;
  };
  elastic_rule?: {
    title: string;
    description?: string;
    severity?: string;
    risk_score?: number;
    query?: string;
    query_language?: 'esql';
    prebuilt_rule_id?: string | null;
    integration_ids?: string[];
  };
  translation_result?: 'full' | 'partial' | 'untranslatable';
  comments?: Array<{ message: string; created_at: string; created_by: string }>;
  inline_query?: string; // Splunk inlined SPL
  nl_query?: string; // QRadar natural-language query
  semantic_query?: string;
  messages?: unknown[]; // BaseMessage[] — tool call history
}

export interface RuleMigrationResult {
  migrationId: string;
  rule: InvokeRuleOutput;
  stats?: Record<string, unknown>;
}

export class RuleMigrationClient {
  constructor(private readonly fetch: KbnEvalsHttpHandler, private readonly log: ToolingLog) {}

  public async migrateRule(
    input: { original_rule: Record<string, unknown>; resources: Array<Record<string, unknown>> },
    connectorId: string,
    config?: { configurable?: { skipPrebuiltRulesMatching?: boolean } }
  ): Promise<RuleMigrationResult> {
    const id = uuidV4();
    this.log.debug(`[RuleMigrationClient] Invoking graph for rule id: ${id}`);

    const resourcesByType = input.resources.reduce<Record<string, unknown[]>>((acc, r) => {
      const type = (r as { type?: string }).type ?? 'unknown';
      acc[type] = [...(acc[type] ?? []), r];
      return acc;
    }, {});

    // Opt in to network retries: `_invoke` only runs the translation graph and returns its
    // output without persisting anything, and the server aborts graph execution when the
    // client socket disconnects — so replaying after a transport failure cannot duplicate
    // work, while a dropped connection would otherwise fail the eval run.
    const response = (await this.fetch(SIEM_RULE_MIGRATION_INVOKE_PATH, {
      method: 'POST',
      headers: { 'elastic-api-version': '1' },
      retryPolicy: { onNetworkError: true },
      body: JSON.stringify({
        connector_id: connectorId,
        input: { id, original_rule: input.original_rule, resources: resourcesByType },
        ...(config ? { config } : {}),
      }),
    })) as { output: InvokeRuleOutput };

    this.log.info(`[RuleMigrationClient] Invocation complete for rule id: ${id}`);
    return { migrationId: id, rule: response.output };
  }
}
