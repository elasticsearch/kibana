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
import { getIndexCategoryMap, isQualityIncompatible, enrichFindings } from '@kbn/siem-readiness';
import {
  fetchRuleFieldCaps,
  getSiemReadinessSharedContext,
  fetchSiemReadinessSharedContext,
} from '../../../lib/siem_readiness/fetchers';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getQuality } from '../../../lib/siem_readiness/dimensions';
import { SIEM_READINESS_QUALITY_TOOL_ID } from './tool_ids';

const schema = z.object({});

export const getQualityTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof schema> => ({
  id: SIEM_READINESS_QUALITY_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Retrieves SIEM data quality health across two signals: (1) ECS field compatibility check results from the Data Quality dashboard — indices with incompatible field mappings; (2) rule required-field coverage — detection rules whose declared required_fields are not mapped in the indices they query, meaning those rules silently match nothing. Returns an overall health status (healthy / actionsRequired / noData), actionable findings, and a missingFieldsByRule array listing each silently-broken rule and its unmapped fields. Each finding includes blast radius data. When presenting findings, always show Affected Platform, Affected Rules, and Affected Tactics as explicit labeled fields.',
  schema,
  tags: ['security', 'siem-readiness', 'quality'],
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

      // Phase 2: dimension-specific data (quality check results)
      const payload = await getQuality({
        esClient: esClient.asCurrentUser,
        logger: handlerLogger,
      });

      // Phase 2.5: rule required-field coverage check
      // Identifies rules whose required_fields are not mapped in the indices they query —
      // these rules silently match nothing despite running without errors.
      const { ruleRequiredFields, indexToRules } = reverseMapResult;
      const missingFieldsByRule = await fetchRuleFieldCaps({
        esClient: esClient.asCurrentUser,
        indexToRules,
        ruleRequiredFields,
      });

      const missingFieldFindings = missingFieldsByRule.flatMap((entry) =>
        entry.missingFields.map((field) => ({
          severity: 'WARNING' as const,
          type: 'missingField' as const,
          message: `Rule "${entry.ruleName}" requires field "${field}" which is not mapped in the queried indices`,
          resource: field,
        }))
      );

      // Phase 3: blast radius enrichment — ECS quality findings only.
      // missingField findings already name the affected rule directly in the message;
      // blast radius is circular and always empty for field-name resources.
      const enrichedEcsFindings = enrichFindings(payload.actionableFindings ?? [], {
        ...reverseMapResult,
        indexToPlatform,
        dimension: 'quality',
      });

      const allEnrichedFindings = [...enrichedEcsFindings, ...missingFieldFindings];

      const indexToCategoryMap = getIndexCategoryMap(categoriesResult);

      const categorizedItems = payload.items.filter((result) =>
        indexToCategoryMap.has(result.indexName)
      );

      // ECS findings are keyed by index name — filter to categorized indices and attach category.
      // Missing-field findings are keyed by field name (not index) — pass through without filtering.
      const enrichedFindings = allEnrichedFindings
        .map((finding) => {
          if (finding.type === 'missingField') return finding;
          const category = indexToCategoryMap.get(finding.resource) as MainCategories | undefined;
          return category ? { ...finding, category } : finding;
        })
        .filter(
          (finding) => finding.type === 'missingField' || indexToCategoryMap.has(finding.resource)
        );

      const incompatibleCount = categorizedItems.filter((item) =>
        isQualityIncompatible(item.incompatibleFieldCount)
      ).length;
      const missingFieldCount = missingFieldsByRule.length;
      const filteredStatus =
        categorizedItems.length === 0 && missingFieldCount === 0
          ? ('noData' as const)
          : incompatibleCount > 0 || missingFieldCount > 0
          ? ('actionsRequired' as const)
          : ('healthy' as const);

      const parts: string[] = [];
      if (incompatibleCount > 0)
        parts.push(
          `${incompatibleCount} of ${categorizedItems.length} indices have incompatible ECS field mappings`
        );
      if (missingFieldCount > 0)
        parts.push(
          `${missingFieldCount} rule(s) have required fields not mapped in their queried indices`
        );
      const filteredSummary =
        filteredStatus === 'noData'
          ? 'No quality check results available. Run the Data Quality dashboard or enable rules with required_fields to see results.'
          : `${parts.join('; ')}.`;

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
              missingFieldsByRule,
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
            data: { message: `Error fetching SIEM quality: ${e.message ?? 'unknown error'}` },
          },
        ],
      };
    }
  },
});
