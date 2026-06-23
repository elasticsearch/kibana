/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture } from '@kbn/scout/src/playwright/fixtures/scope/worker';

export const waitForSuccessfulEventLogEntry = async (
  apiClient: ApiClientFixture,
  ruleId: string,
  headers: Record<string, string>
) => {
  const dateStart = new Date().toISOString();
  // Force an immediate run so we don't depend on the scheduler's poll cadence.
  await apiClient.post(`internal/alerting/rule/${ruleId}/_run_soon`, { headers });
  const pollIntervalMs = 2000;
  const maxAttempts = 60; // ~120s; covers MKI/UIAM task-claim latency
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const logResponse = await apiClient.get(
      `internal/alerting/rule/${ruleId}/_execution_log?date_start=${encodeURIComponent(
        dateStart
      )}&per_page=10`,
      { headers, responseType: 'json' }
    );
    const body = logResponse.body as { data: Array<{ status: string }> };
    if (body.data.some((entry) => entry.status === 'success')) {
      return body;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`Rule ${ruleId} did not execute successfully within 120s`);
};
