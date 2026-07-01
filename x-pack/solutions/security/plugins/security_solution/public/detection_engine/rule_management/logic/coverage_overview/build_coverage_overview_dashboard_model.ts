/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoverageOverviewResponse,
  CoverageOverviewRuleAttributes,
} from '../../../../../common/api/detection_engine';
import { CoverageOverviewRuleActivity } from '../../../../../common/api/detection_engine';

import type {
  CoverageOverviewDashboard,
  CoverageOverviewRuleWithInvalidMitre,
} from '../../model/coverage_overview/dashboard';
import type { CoverageOverviewRule } from '../../model/coverage_overview/rule';
import { buildCoverageOverviewMitreGraph } from './build_coverage_overview_mitre_graph';

const lazyMitreConfiguration = () => {
  /**
   * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
   * See https://webpack.js.org/api/module-methods/#magic-comments
   */
  return import(
    /* webpackChunkName: "lazy_mitre_configuration" */
    '../../../../../common/detection_engine/mitre/mitre_tactics_techniques'
  );
};

export async function buildCoverageOverviewDashboardModel(
  apiResponse: CoverageOverviewResponse
): Promise<CoverageOverviewDashboard> {
  const mitreConfig = await lazyMitreConfiguration();
  const { tactics, techniques, subtechniques } = mitreConfig;
  const mitreTactics = buildCoverageOverviewMitreGraph(tactics, techniques, subtechniques);

  for (const tactic of mitreTactics) {
    for (const ruleId of apiResponse.coverage[tactic.id] ?? []) {
      addRule(tactic, ruleId, apiResponse.rules_data[ruleId]);
    }

    for (const technique of tactic.techniques) {
      for (const ruleId of apiResponse.coverage[technique.id] ?? []) {
        if (apiResponse.coverage[tactic.id]?.includes(ruleId)) {
          addRule(technique, ruleId, apiResponse.rules_data[ruleId]);
        }
      }

      for (const subtechnique of technique.subtechniques) {
        for (const ruleId of apiResponse.coverage[subtechnique.id] ?? []) {
          if (apiResponse.coverage[tactic.id]?.includes(ruleId)) {
            addRule(subtechnique, ruleId, apiResponse.rules_data[ruleId]);
          }
        }
      }
    }
  }

  return {
    mitreTactics,
    unmappedRules: buildUnmappedRules(apiResponse),
    invalidlyMappedRules: buildInvalidlyMappedRules(apiResponse),
    metrics: calcMetrics(apiResponse.rules_data),
  };
}

function calcMetrics(
  rulesData: Record<string, CoverageOverviewRuleAttributes>
): CoverageOverviewDashboard['metrics'] {
  const ruleIds = Object.keys(rulesData);
  const metrics: CoverageOverviewDashboard['metrics'] = {
    totalRulesCount: ruleIds.length,
    totalEnabledRulesCount: 0,
  };

  for (const ruleId of Object.keys(rulesData)) {
    if (rulesData[ruleId].activity === CoverageOverviewRuleActivity.Enabled) {
      metrics.totalEnabledRulesCount++;
    }
  }

  return metrics;
}

function buildUnmappedRules(
  apiResponse: CoverageOverviewResponse
): CoverageOverviewDashboard['unmappedRules'] {
  const unmappedRules: CoverageOverviewDashboard['unmappedRules'] = {
    enabledRules: [],
    disabledRules: [],
    availableRules: [],
  };

  for (const ruleId of apiResponse.unmapped_rule_ids) {
    addRule(unmappedRules, ruleId, apiResponse.rules_data[ruleId]);
  }

  return unmappedRules;
}

function buildInvalidlyMappedRules(
  apiResponse: CoverageOverviewResponse
): CoverageOverviewDashboard['invalidlyMappedRules'] {
  const invalidlyMappedRules: CoverageOverviewDashboard['invalidlyMappedRules'] = {
    enabledRules: [],
    disabledRules: [],
  };

  for (const [ruleId, invalidMitreIds] of Object.entries(apiResponse.invalid_mitre_ids)) {
    addRuleWithInvalidMitreIds(
      invalidlyMappedRules,
      ruleId,
      apiResponse.rules_data[ruleId],
      invalidMitreIds
    );
  }

  return invalidlyMappedRules;
}

function addRuleWithInvalidMitreIds(
  container: {
    enabledRules: CoverageOverviewRuleWithInvalidMitre[];
    disabledRules: CoverageOverviewRuleWithInvalidMitre[];
  },
  ruleId: string,
  ruleData: CoverageOverviewRuleAttributes,
  invalidMitreIds: string[]
): void {
  if (!ruleData) {
    return;
  }

  const rule: CoverageOverviewRuleWithInvalidMitre = {
    id: ruleId,
    name: ruleData.name,
    invalidMitreIds,
  };

  if (ruleData.activity === CoverageOverviewRuleActivity.Enabled) {
    container.enabledRules.push(rule);
  } else if (ruleData.activity === CoverageOverviewRuleActivity.Disabled) {
    container.disabledRules.push(rule);
  }
}

function addRule(
  container: {
    enabledRules: CoverageOverviewRule[];
    disabledRules: CoverageOverviewRule[];
    availableRules: CoverageOverviewRule[];
  },
  ruleId: string,
  ruleData: CoverageOverviewRuleAttributes
): void {
  if (!ruleData) {
    return;
  }

  if (ruleData.activity === CoverageOverviewRuleActivity.Enabled) {
    container.enabledRules.push({
      id: ruleId,
      name: ruleData.name,
    });
  } else if (ruleData.activity === CoverageOverviewRuleActivity.Disabled) {
    container.disabledRules.push({
      id: ruleId,
      name: ruleData.name,
    });
  }

  // When we add support for available (not installed) rules to this feature, add the following here:
  // else if (ruleData.activity === CoverageOverviewRuleActivity.Available) {
  //   container.availableRules.push({
  //     id: ruleId,
  //     name: ruleData.name,
  //   });
  // }
}
