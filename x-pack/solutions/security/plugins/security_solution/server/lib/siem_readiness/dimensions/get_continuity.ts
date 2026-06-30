/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { ActionableFinding, CategoriesResponse, ContinuityPayload } from '@kbn/siem-readiness';
import { getContinuityDataFlowHealth, isCriticalFailureRate } from '@kbn/siem-readiness';
import { fetchPipelines } from '../fetchers';

export const getContinuity = async ({
  esClient,
  isServerless,
  logger,
  categoriesData,
}: {
  esClient: ElasticsearchClient;
  isServerless: boolean;
  logger: Logger;
  /** Pre-fetched categories result; passed to fetchPipelines so per-category silence thresholds apply. */
  categoriesData?: CategoriesResponse;
}): Promise<ContinuityPayload> => {
  const pipelines = await fetchPipelines({ esClient, isServerless, logger, categoriesData });

  const actionableFindings: ActionableFinding[] = [];

  // pipeline failure-rate findings (existing)
  pipelines
    .filter((p) => p.statsAvailable && isCriticalFailureRate(p.failedDocsCount, p.docsCount))
    .forEach((p) =>
      actionableFindings.push({
        severity: 'CRITICAL' as const,
        type: 'pipeline_failure' as const,
        message: `Pipeline ${p.name} has a critical document failure rate (${p.failedDocsCount} of ${p.docsCount} failed)`,
        resource: p.name,
      })
    );

  // silence and volume-drop findings — merged when both apply to the same pipeline.
  // getContinuityDataFlowHealth is the shared classifier (from @kbn/siem-readiness) that enforces
  // the canonical precedence: silent > volume_drop_critical > volume_drop_warning > healthy.
  // The UI badge column uses the same function so both surfaces always agree.
  pipelines.forEach((p) => {
    const health = getContinuityDataFlowHealth(p);
    const volumeDropPct = p.volumeDropPct ?? null;

    if (health === 'silent') {
      // Include volume context when a baseline exists so the operator sees both facts in one finding.
      const volumeContext =
        volumeDropPct !== null && p.baseline7dAvg != null
          ? ` (${volumeDropPct}% volume drop vs ~${Math.round(p.baseline7dAvg)} docs/day baseline)`
          : '';
      actionableFindings.push({
        severity: 'CRITICAL' as const,
        type: 'silence' as const,
        message: `Data stream serving pipeline ${p.name} has gone silent${volumeContext}`,
        resource: p.name,
      });
    } else if (health === 'volume_drop_critical') {
      const baseline =
        p.baseline7dAvg != null
          ? `~${Math.round(p.baseline7dAvg)} docs/day baseline`
          : 'unknown baseline';
      actionableFindings.push({
        severity: 'CRITICAL' as const,
        type: 'volume_drop_critical' as const,
        message: `Pipeline ${p.name} volume dropped ${volumeDropPct}% vs 7-day (${baseline})`,
        resource: p.name,
      });
    } else if (health === 'volume_drop_warning') {
      const baseline =
        p.baseline7dAvg != null
          ? `~${Math.round(p.baseline7dAvg)} docs/day baseline`
          : 'unknown baseline';
      actionableFindings.push({
        severity: 'WARNING' as const,
        type: 'volume_drop_warning' as const,
        message: `Pipeline ${p.name} volume dropped ${volumeDropPct}% vs 7-day (${baseline})`,
        resource: p.name,
      });
    }
  });

  const status =
    pipelines.length === 0
      ? ('noData' as const)
      : actionableFindings.length > 0
      ? ('actionsRequired' as const)
      : ('healthy' as const);

  const summary = buildContinuitySummary(status, pipelines.length, actionableFindings);

  return { status, summary, items: pipelines, actionableFindings };
};

const buildContinuitySummary = (
  status: string,
  pipelineCount: number,
  findings: ActionableFinding[]
): string => {
  if (status === 'noData') return 'No active ingest pipelines found.';
  if (findings.length === 0) return `All ${pipelineCount} active ingest pipelines are healthy.`;

  const silentCount = findings.filter((f) => f.type === 'silence').length;
  const dropCritical = findings.filter((f) => f.type === 'volume_drop_critical').length;
  const dropWarning = findings.filter((f) => f.type === 'volume_drop_warning').length;
  const failureCount = findings.filter((f) => f.type === 'pipeline_failure').length;

  const parts: string[] = [];
  if (silentCount) parts.push(`${silentCount} silent`);
  if (dropCritical) parts.push(`${dropCritical} critical volume drop`);
  if (dropWarning) parts.push(`${dropWarning} volume drop warning`);
  if (failureCount) parts.push(`${failureCount} pipeline failure`);

  return `${parts.join(', ')} across ${pipelineCount} active pipelines.`;
};
