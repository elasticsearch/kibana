/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoverageOverviewMitreTactic } from './mitre_tactic';
import type { CoverageOverviewRule } from './rule';

/**
 * A rule whose MITRE ATT&CK™ mappings contain at least one invalid
 * (e.g. removed or deprecated) tactic/technique/subtechnique ID.
 */
export interface CoverageOverviewRuleWithInvalidMitre extends CoverageOverviewRule {
  invalidMitreIds: string[];
}

/**
 * Coverage overview dashboard domain model
 */
export interface CoverageOverviewDashboard {
  /**
   * MITRE ATT&CK coverage
   */
  mitreTactics: CoverageOverviewMitreTactic[];
  /**
   * Rules with no MITRE ATT&CK™ threat mapping at all
   */
  unmappedRules: {
    enabledRules: CoverageOverviewRule[];
    disabledRules: CoverageOverviewRule[];
    availableRules: CoverageOverviewRule[];
  };
  /**
   * Rules that have at least one tactic, technique, or subtechnique ID that is
   * not found in the currently bundled MITRE ATT&CK™ dataset
   */
  invalidlyMappedRules: {
    enabledRules: CoverageOverviewRuleWithInvalidMitre[];
    disabledRules: CoverageOverviewRuleWithInvalidMitre[];
  };
  /**
   * Total metrics
   */
  metrics: {
    totalRulesCount: number;
    totalEnabledRulesCount: number;
  };
}
