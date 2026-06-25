/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import type { Logger } from '@kbn/logging';
import type { MainCategories } from '@kbn/siem-readiness';
import {
  getIndexCategoryMap,
  isCriticalFailureRate,
  filterPipelinesByCategories,
  enrichFindings,
} from '@kbn/siem-readiness';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getContinuity } from '../../../lib/siem_readiness/dimensions';
import {
  getSiemReadinessSharedContext,
  fetchSiemReadinessSharedContext,
} from '../../../lib/siem_readiness/fetchers';
import { SIEM_READINESS_CONTINUITY_TOOL_ID } from './tool_ids';

const schema = z.object({});

export const getContinuityTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  isServerless: boolean
): BuiltinToolDefinition<typeof schema> => ({
  id: SIEM_READINESS_CONTINUITY_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Retrieves SIEM ingest pipeline continuity health. Returns active pipelines with document counts, failure rates, and which indices they serve — filtered to pipelines that serve categorized SIEM indices. Includes an overall health status (healthy / actionsRequired / noData) and actionable findings for: (1) pipelines with critical failure rates, (2) data streams that have gone silent (no events received beyond the category-specific threshold), and (3) data streams showing a significant volume drop versus the 7-day baseline. Each actionable finding includes blast radius data (affectedRules, affectedTactics, affectedPlatform) and a type field (pipeline_failure | silence | volume_drop_warning | volume_drop_critical). When presenting any finding, always show these as explicit labeled fields: Affected Platform, Affected Rules, Affected Tactics.',
  schema,
  tags: ['security', 'siem-readiness', 'continuity'],
  availability: {
    cacheMode: 'space',
    handler: async ({ request }) => {
      return getAgentBuilderResourceAvailability({ core, request, logger });
    },
  },
  handler: async (_params, { esClient, logger: handlerLogger, request }) => {
    try {
      const [coreStart, startPlugins] = await core.getStartServices();

      // Phase 1: shared context (rules reverse map + categories) — lazy per-request
      const { reverseMapResult, categoriesResult, indexToPlatform } =
        await getSiemReadinessSharedContext(request, async () => {
          const rulesClient = await startPlugins.alerting.getRulesClientWithRequest(request);
          const dataViewsService = await startPlugins.dataViews.dataViewsServiceFactory(
            coreStart.savedObjects.getScopedClient(request),
            esClient.asCurrentUser
          );
          return fetchSiemReadinessSharedContext({
            rulesClient,
            esClient: esClient.asCurrentUser,
            dataViewsService,
            logger: handlerLogger,
          });
        });

      // Phase 2: dimension-specific data (pipelines).
      // Pass the already-fetched categories so fetchPipelines can apply per-category silence
      // thresholds without issuing a duplicate categories aggregation.
      const payload = await getContinuity({
        esClient: esClient.asCurrentUser,
        isServerless,
        logger: handlerLogger,
        categoriesData: categoriesResult,
      });

      // Phase 3: blast radius enrichment
      const allEnrichedFindings = enrichFindings(payload.actionableFindings ?? [], {
        ...reverseMapResult,
        indexToPlatform,
        dimension: 'continuity',
      });

      const indexToCategoryMap = getIndexCategoryMap(categoriesResult);

      // Shared predicate — same function used by the UI continuity tab
      const categorizedItems = filterPipelinesByCategories(payload.items, categoriesResult);

      const enrichedFindings = allEnrichedFindings
        .filter((finding) => categorizedItems.some((p) => p.name === finding.resource))
        .map((finding) => {
          const pipeline = categorizedItems.find((p) => p.name === finding.resource);
          const category = pipeline?.indices
            .map((idx) => indexToCategoryMap.get(idx))
            .find(Boolean) as MainCategories | undefined;
          return category ? { ...finding, category } : finding;
        });

      const failingCount = categorizedItems.filter(
        (p) => p.statsAvailable && isCriticalFailureRate(p.failedDocsCount, p.docsCount)
      ).length;
      const filteredStatus =
        categorizedItems.length === 0
          ? ('noData' as const)
          : failingCount > 0
          ? ('actionsRequired' as const)
          : ('healthy' as const);
      const filteredSummary =
        filteredStatus === 'noData'
          ? 'No ingest pipeline statistics available for categorized indices.'
          : failingCount > 0
          ? `${failingCount} of ${categorizedItems.length} active pipelines have critical failure rates.`
          : `All ${categorizedItems.length} active ingest pipelines are functioning properly, with no document failures.`;

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: {
              ...payload,
              status: filteredStatus,
              summary: filteredSummary,
              items: categorizedItems,
              actionableFindings: enrichedFindings,
            },
          },
        ],
      };
    } catch (error: unknown) {
      const e = error as { message?: string };
      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.error,
            data: { message: `Error fetching SIEM continuity: ${e.message ?? 'unknown error'}` },
          },
        ],
      };
    }
  },
});
