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
import { findRules } from '../../../lib/detection_engine/rule_management/logic/search/find_rules';
import type { RuleParams } from '../../../lib/detection_engine/rule_schema';
import type { SecuritySolutionPluginStartDependencies } from '../../../plugin_contract';

export const GET_INSTALLED_RULES_MITRE_COVERAGE_INLINE_TOOL_ID =
  'security.get_installed_rules_mitre_coverage';

export const getInstalledRulesMitreCoverageSchema = z.object({}).strict();

const MAX_INSTALLED_RULES = 10000;

interface MitreCoverageEntry {
  id: string;
  name: string;
  count: number;
}

export interface MitreCoverageData {
  total_installed_rules: number;
  total_with_mitre_mapping: number;
  tactics: MitreCoverageEntry[];
  techniques: MitreCoverageEntry[];
}

type RuleWithThreat = Pick<RuleParams, 'threat'>;

const byCountDescThenId = (a: MitreCoverageEntry, b: MitreCoverageEntry): number =>
  b.count - a.count || a.id.localeCompare(b.id);

/**
 * Tallies MITRE ATT&CK coverage from installed rules. All counts — including
 * `total_installed_rules` — are derived from the rules actually passed in, so the mapping
 * total and the rule total always share the same base.
 */
export const buildMitreCoverageFromRules = (
  rules: Array<{ params: RuleWithThreat }>
): MitreCoverageData => {
  const tacticCounts = new Map<string, number>();
  const tacticNames = new Map<string, string>();
  const techniqueCounts = new Map<string, number>();
  const techniqueNames = new Map<string, string>();
  let totalWithMitreMapping = 0;

  for (const rule of rules) {
    const threat = rule.params.threat ?? [];

    const ruleTactics = new Set<string>();
    const ruleTechniques = new Set<string>();

    const mitreThreats = threat.filter((threatItem) => threatItem.framework === 'MITRE ATT&CK');
    for (const threatItem of mitreThreats) {
      const tacticId = threatItem.tactic?.id;
      if (tacticId) {
        ruleTactics.add(tacticId);
        if (threatItem.tactic?.name) {
          tacticNames.set(tacticId, threatItem.tactic.name);
        }
      }

      for (const technique of threatItem.technique ?? []) {
        if (technique.id) {
          ruleTechniques.add(technique.id);
          if (technique.name) {
            techniqueNames.set(technique.id, technique.name);
          }
        }
      }
    }

    if (ruleTactics.size > 0) {
      totalWithMitreMapping += 1;
    }
    for (const id of ruleTactics) {
      tacticCounts.set(id, (tacticCounts.get(id) ?? 0) + 1);
    }
    for (const id of ruleTechniques) {
      techniqueCounts.set(id, (techniqueCounts.get(id) ?? 0) + 1);
    }
  }

  const tactics = Array.from(tacticCounts.entries())
    .map(([id, count]) => ({ id, name: tacticNames.get(id) ?? id, count }))
    .sort(byCountDescThenId);

  const techniques = Array.from(techniqueCounts.entries())
    .map(([id, count]) => ({ id, name: techniqueNames.get(id) ?? id, count }))
    .sort(byCountDescThenId);

  return {
    total_installed_rules: rules.length,
    total_with_mitre_mapping: totalWithMitreMapping,
    tactics,
    techniques,
  };
};

interface GetInstalledRulesMitreCoverageToolDeps {
  getStartServices: StartServicesAccessor<SecuritySolutionPluginStartDependencies>;
  logger: Logger;
}

export const createGetInstalledRulesMitreCoverageTool = ({
  getStartServices,
  logger,
}: GetInstalledRulesMitreCoverageToolDeps): BuiltinSkillBoundedTool<
  typeof getInstalledRulesMitreCoverageSchema
> => ({
  id: GET_INSTALLED_RULES_MITRE_COVERAGE_INLINE_TOOL_ID,
  type: ToolType.builtin,
  description:
    "Returns MITRE ATT&CK coverage across the user's currently-installed detection rules. " +
    'Includes total rule count, count with MITRE mappings, and per-tactic and per-technique ' +
    'rule counts. ' +
    'Only returns tactics and techniques with count > 0 — absence means zero coverage. ' +
    'The canonical 14-tactic list is in the skill prompt; use it to identify missing tactics. ' +
    'Session-cached — do not call again in the same conversation.',
  schema: getInstalledRulesMitreCoverageSchema,
  handler: async (_input, { request }) => {
    try {
      const [, startPlugins] = await getStartServices();
      const rulesClient = await startPlugins.alerting.getRulesClientWithRequest(request);

      const { data } = await findRules({
        rulesClient,
        filter: undefined,
        fields: ['params.threat'],
        page: 1,
        perPage: MAX_INSTALLED_RULES,
        sortField: undefined,
        sortOrder: undefined,
      });

      return {
        results: [
          {
            type: ToolResultType.other,
            data: buildMitreCoverageFromRules(data),
          },
        ],
      };
    } catch (error) {
      logger.error(
        `get_installed_rules_mitre_coverage tool failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        results: [
          {
            type: ToolResultType.error,
            data: {
              message: `Failed to fetch installed rules MITRE coverage: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          },
        ],
      };
    }
  },
});
