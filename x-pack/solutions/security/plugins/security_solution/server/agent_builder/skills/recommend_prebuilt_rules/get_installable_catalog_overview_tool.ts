/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { StartServicesAccessor } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { createPrebuiltRuleAssetsClient } from '../../../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { createPrebuiltRuleObjectsClient } from '../../../lib/detection_engine/prebuilt_rules/logic/rule_objects/prebuilt_rule_objects_client';
import { getInstallableRuleVersions } from '../../../lib/detection_engine/prebuilt_rules/logic/get_installable_rules_for_review';
import { PREBUILT_RULE_ASSETS_SO_TYPE } from '../../../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_type';
import { buildMlAuthz } from '../../../lib/machine_learning/authz';
import type { EntityAnalyticsRoutesDeps } from '../../../lib/entity_analytics/types';
import type { SecuritySolutionPluginStartDependencies } from '../../../plugin_contract';

export const GET_INSTALLABLE_CATALOG_OVERVIEW_INLINE_TOOL_ID =
  'security.get_installable_catalog_overview';

export const getInstallableCatalogOverviewSchema = z.object({}).strict();

const TAGS_AGG_SIZE = 1000;
const TAGS_AGG_KEY = 'facet_tags';

interface GetInstallableCatalogOverviewToolDeps {
  getStartServices: StartServicesAccessor<SecuritySolutionPluginStartDependencies>;
  logger: Logger;
  ml: EntityAnalyticsRoutesDeps['ml'];
}

export const createGetInstallableCatalogOverviewTool = ({
  getStartServices,
  logger,
  ml,
}: GetInstallableCatalogOverviewToolDeps): BuiltinSkillBoundedTool<
  typeof getInstallableCatalogOverviewSchema
> => ({
  id: GET_INSTALLABLE_CATALOG_OVERVIEW_INLINE_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Returns the total count of installable (not-yet-installed) prebuilt detection rules plus ' +
    'all available tag values with per-tag rule counts. ' +
    'Both the count and tags are scoped to installable rules only — rules that are already ' +
    'installed are excluded, so a tag may report 0 or be absent if all rules with that tag are installed. ' +
    'Call this tool BEFORE any `security.find_prebuilt_rules` call that uses a `tags` filter, ' +
    'to prevent tag hallucination and verify that the tag exists in the installable catalog. ' +
    'Also use `total_installable_count` to frame responses (e.g. "of N installable rules, recommending K…"). ' +
    'Do not call this tool again once called in the same conversation — the result is stable within a session.',
  schema: getInstallableCatalogOverviewSchema,
  handler: async (_input, { request }) => {
    try {
      const [coreStart, startPlugins] = await getStartServices();
      const savedObjectsClient = coreStart.savedObjects.getScopedClient(request);
      const rulesClient = await startPlugins.alerting.getRulesClientWithRequest(request);

      const license = await startPlugins.licensing.getLicense();
      const mlAuthz = buildMlAuthz({ license, ml, request, savedObjectsClient });

      const ruleAssetsClient = createPrebuiltRuleAssetsClient(savedObjectsClient);
      const ruleObjectsClient = createPrebuiltRuleObjectsClient(rulesClient);
      const installedRuleVersions = await ruleObjectsClient.fetchInstalledRuleVersions();
      const installedRuleVersionsMap = new Map(
        installedRuleVersions.map((version) => [version.rule_id, version])
      );

      const installableVersions = await getInstallableRuleVersions(
        ruleAssetsClient,
        logger,
        mlAuthz,
        installedRuleVersionsMap
      );

      const totalInstallableCount = installableVersions.length;

      if (totalInstallableCount === 0) {
        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                total_installable_count: 0,
                tags: [],
              },
            },
          ],
        };
      }

      const { aggregations } = await ruleAssetsClient.fetchAssetsByVersion(installableVersions, {
        perPage: 0,
        aggs: {
          [TAGS_AGG_KEY]: {
            terms: {
              field: `${PREBUILT_RULE_ASSETS_SO_TYPE}.tags`,
              size: TAGS_AGG_SIZE,
            },
          },
        },
      });

      const tagAgg = aggregations?.[TAGS_AGG_KEY] as
        | { buckets?: Array<{ key: string; doc_count: number }> }
        | undefined;
      const tags = (tagAgg?.buckets ?? []).map((b) => ({ value: b.key, count: b.doc_count }));

      return {
        results: [
          {
            type: ToolResultType.other,
            data: {
              total_installable_count: totalInstallableCount,
              tags,
            },
          },
        ],
      };
    } catch (error) {
      logger.error(
        `get_installable_catalog_overview tool failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        results: [
          {
            type: ToolResultType.error,
            data: {
              message: `Failed to fetch installable catalog overview: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          },
        ],
      };
    }
  },
});
