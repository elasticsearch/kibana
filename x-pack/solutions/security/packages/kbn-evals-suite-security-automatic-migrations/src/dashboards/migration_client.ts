/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnEvalsHttpHandler } from '@kbn/evals/src/utils/http_handler_from_kbn_client';
import type { DashboardInput } from '../../datasets/dashboards/types';

// Inlined to avoid package→plugin import boundary violation.
const SIEM_DASHBOARD_MIGRATION_INVOKE_PATH = '/internal/siem_migrations/dashboards/_invoke';

/** Mirrors MigrateDashboardState from the plugin — do not import directly. */
export interface InvokeDashboardOutput {
  id: string;
  original_dashboard: { id?: string; title?: string; data?: string };
  elastic_dashboard?: {
    data: string;
    title: string;
    description: string;
  };
  translation_result?: string;
  comments?: string;
  description?: string;
}

export interface MigrationResult {
  migrationId: string;
  dashboards: InvokeDashboardOutput[];
  stats?: Record<string, unknown>;
}

export class DashboardMigrationClient {
  constructor(private readonly fetch: KbnEvalsHttpHandler, private readonly log: ToolingLog) {}

  public async migrateDashboard(
    input: DashboardInput,
    connectorId: string,
    config?: { configurable?: { skipPrebuiltDashboardsMatching?: boolean } }
  ): Promise<MigrationResult> {
    const id = uuidV4();
    this.log.debug(`[DashboardMigrationClient] Invoking graph for dashboard id: ${id}`);

    const resourcesByType = input.resources.reduce<Record<string, unknown[]>>((acc, r) => {
      const type = (r as { type?: string }).type ?? 'unknown';
      acc[type] = [...(acc[type] ?? []), r];
      return acc;
    }, {});

    // Opt in to network retries: `_invoke` only runs the translation graph and returns its
    // output without persisting anything, and the server aborts graph execution when the
    // client socket disconnects — so replaying after a transport failure cannot duplicate
    // work, while a dropped connection would otherwise fail the eval run.
    const splunkResult = input.original_dashboard_export.result;
    const response = (await this.fetch(SIEM_DASHBOARD_MIGRATION_INVOKE_PATH, {
      method: 'POST',
      headers: { 'elastic-api-version': '1' },
      retryPolicy: { onNetworkError: true },
      body: JSON.stringify({
        connector_id: connectorId,
        input: {
          id,
          original_dashboard: {
            id: splunkResult.id,
            vendor: 'splunk',
            title: splunkResult.title,
            description: splunkResult.description ?? '',
            data: splunkResult['eai:data'],
            format: 'xml',
          },
          resources: resourcesByType,
        },
        ...(config ? { config } : {}),
      }),
    })) as { output: InvokeDashboardOutput };

    this.log.info(`[DashboardMigrationClient] Invocation complete for dashboard id: ${id}`);
    return { migrationId: id, dashboards: [response.output] };
  }
}
