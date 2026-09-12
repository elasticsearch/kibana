/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { AnalyticsServiceStart, Logger } from '@kbn/core/server';
import {
  ThreeWayDiffOutcome,
  ThreeWayDiffConflict,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import {
  DETECTION_RULE_UPGRADE_EVENT,
  DETECTION_RULE_BULK_UPGRADE_EVENT,
} from '../../../../telemetry/event_based/events';
import { hasRuleTypeChanged } from './get_rule_type_change';

interface BasicDiffInfo {
  conflict: ThreeWayDiffConflict;
  diff_outcome?: ThreeWayDiffOutcome;
}

type BasicRuleFieldsDiff = Record<string, BasicDiffInfo>;

type UpdateRuleFinalResult = 'SUCCESS' | 'SKIP' | 'ERROR';

export interface RuleUpgradeContext {
  ruleId: string;
  ruleName: string;
  hasBaseVersion: boolean;
  isCustomized: boolean;
  fieldsDiff: BasicRuleFieldsDiff;
}

export interface RuleUpgradeTelemetry {
  ruleId: string;
  ruleName: string;
  hasBaseVersion: boolean;
  hasRuleTypeChange: boolean;
  updatedFieldsSummary: {
    count: number;
    nonSolvableConflictsCount: number;
    solvableConflictsCount: number;
    noConflictsCount: number;
  };
  updatedFieldsTotal: string[];
  updatedFieldsWithNonSolvableConflicts: string[];
  updatedFieldsWithSolvableConflicts: string[];
  updatedFieldsWithNoConflicts: string[];
  finalResult: UpdateRuleFinalResult;
}

interface BulkUpgradeSummary {
  totalNumberOfRules: number;
  numOfCustomizedRules: number;
  numOfNonCustomizedRules: number;
  numOfNonSolvableConflicts: number;
  numOfSolvableConflicts: number;
  numOfNoConflicts: number;
  numOfRulesWithRuleTypeChange: number;
}
export interface RuleBulkUpgradeTelemetry {
  successfulUpdates: BulkUpgradeSummary;
  errorUpdates: BulkUpgradeSummary;
  skippedUpdates: BulkUpgradeSummary;
}

interface BasicRuleResponse {
  rule_id: string;
}

interface BasicInstallationError {
  item: {
    rule_id: string;
  };
}

interface BasicSkippedRule {
  rule_id: string;
}

export function sendRuleUpdateTelemetryEvents(
  analytics: AnalyticsServiceStart,
  RuleUpdateContextsMap: Map<string, RuleUpgradeContext>,
  updatedRules: BasicRuleResponse[],
  installationErrors: BasicInstallationError[],
  skippedRules: BasicSkippedRule[],
  logger: Logger
) {
  try {
    for (const ruleResponse of updatedRules) {
      const ruleUpdateContext = RuleUpdateContextsMap.get(ruleResponse.rule_id);
      if (ruleUpdateContext) {
        const event: RuleUpgradeTelemetry = createRuleUpdateTelemetryEvent({
          fieldsDiff: ruleUpdateContext.fieldsDiff,
          ruleId: ruleUpdateContext.ruleId,
          ruleName: ruleUpdateContext.ruleName,
          hasBaseVersion: ruleUpdateContext.hasBaseVersion,
          finalResult: 'SUCCESS',
        });
        analytics.reportEvent(DETECTION_RULE_UPGRADE_EVENT.eventType, event);
      }
    }

    for (const erroredRule of installationErrors) {
      const ruleUpdateContext = RuleUpdateContextsMap.get(erroredRule.item.rule_id);
      if (ruleUpdateContext) {
        const event: RuleUpgradeTelemetry = createRuleUpdateTelemetryEvent({
          fieldsDiff: ruleUpdateContext.fieldsDiff,
          ruleId: ruleUpdateContext.ruleId,
          ruleName: ruleUpdateContext.ruleName,
          hasBaseVersion: ruleUpdateContext.hasBaseVersion,
          finalResult: 'ERROR',
        });
        analytics.reportEvent(DETECTION_RULE_UPGRADE_EVENT.eventType, event);
      }
    }

    for (const skippedRule of skippedRules) {
      const ruleUpdateContext = RuleUpdateContextsMap.get(skippedRule.rule_id);
      if (ruleUpdateContext) {
        const event: RuleUpgradeTelemetry = createRuleUpdateTelemetryEvent({
          fieldsDiff: ruleUpdateContext.fieldsDiff,
          ruleId: ruleUpdateContext.ruleId,
          ruleName: ruleUpdateContext.ruleName,
          hasBaseVersion: ruleUpdateContext.hasBaseVersion,
          finalResult: 'SKIP',
        });
        analytics.reportEvent(DETECTION_RULE_UPGRADE_EVENT.eventType, event);
      }
    }
  } catch (e) {
    // we don't want telemetry errors to impact the main flow
    logger.debug('Failed to send detection rule update telemetry', e);
  }
}

export function sendRuleBulkUpgradeTelemetryEvent(
  analytics: AnalyticsServiceStart,
  ruleUpgradeContextsMap: Map<string, RuleUpgradeContext>,
  updatedRules: BasicRuleResponse[],
  ruleErrors: BasicInstallationError[],
  skippedRules: BasicSkippedRule[],
  logger: Logger
) {
  try {
    const successfulUpdates = calculateBulkUpdateSummary(
      ruleUpgradeContextsMap,
      updatedRules.map((rule) => rule.rule_id),
      logger
    );

    const errorUpdates = calculateBulkUpdateSummary(
      ruleUpgradeContextsMap,
      ruleErrors.map((error) => error.item.rule_id),
      logger
    );

    const skippedUpdates = calculateBulkUpdateSummary(
      ruleUpgradeContextsMap,
      skippedRules.map((rule) => rule.rule_id),
      logger
    );

    const event: RuleBulkUpgradeTelemetry = {
      successfulUpdates,
      errorUpdates,
      skippedUpdates,
    };

    analytics.reportEvent(DETECTION_RULE_BULK_UPGRADE_EVENT.eventType, event);
  } catch (e) {
    // we don't want telemetry errors to impact the main flow
    logger.debug('Failed to send detection rule bulk upgrade telemetry', e);
  }
}

function calculateBulkUpdateSummary(
  ruleUpgradeContextsMap: Map<string, RuleUpgradeContext>,
  ruleIds: string[],
  logger: Logger
): BulkUpgradeSummary {
  let totalNumberOfRules = 0;
  let numOfNonSolvableConflicts = 0;
  let numOfSolvableConflicts = 0;
  let numOfNoConflicts = 0;
  let numOfCustomizedRules = 0;
  let numOfNonCustomizedRules = 0;
  let numOfRulesWithRuleTypeChange = 0;

  ruleIds.forEach((ruleId) => {
    const ruleUpgradeContext = ruleUpgradeContextsMap.get(ruleId);

    if (!ruleUpgradeContext) {
      logger.debug(`Rule ${ruleId} not found in context map`);
      return;
    }

    totalNumberOfRules++;

    const { fieldsDiff, isCustomized } = ruleUpgradeContext;
    const diffs = Object.values(fieldsDiff) as BasicDiffInfo[];

    if (isCustomized) {
      numOfCustomizedRules++;
    } else {
      numOfNonCustomizedRules++;
    }

    if (hasRuleTypeChanged(fieldsDiff.type)) {
      numOfRulesWithRuleTypeChange++;
    }

    if (diffs.some((d) => d.conflict === ThreeWayDiffConflict.NON_SOLVABLE)) {
      numOfNonSolvableConflicts++;
      return;
    }

    if (diffs.some((d) => d.conflict === ThreeWayDiffConflict.SOLVABLE)) {
      numOfSolvableConflicts++;
      return;
    }

    numOfNoConflicts++;
  });

  return {
    totalNumberOfRules,
    numOfCustomizedRules,
    numOfNonCustomizedRules,
    numOfNonSolvableConflicts,
    numOfSolvableConflicts,
    numOfNoConflicts,
    numOfRulesWithRuleTypeChange,
  };
}

interface CreateRuleUpdateTelemetryEventParams {
  fieldsDiff: BasicRuleFieldsDiff;
  ruleId: string;
  ruleName: string;
  hasBaseVersion: boolean;
  finalResult: UpdateRuleFinalResult;
}

function createRuleUpdateTelemetryEvent({
  fieldsDiff,
  ruleId,
  ruleName,
  hasBaseVersion,
  finalResult,
}: CreateRuleUpdateTelemetryEventParams): RuleUpgradeTelemetry {
  const updatedFieldsTotal: string[] = [];
  const updatedFieldsWithNonSolvableConflicts: string[] = [];
  const updatedFieldsWithSolvableConflicts: string[] = [];
  const updatedFieldsWithNoConflicts: string[] = [];

  Object.entries(fieldsDiff).forEach(([fieldName, diff]) => {
    if (fieldName === 'version') {
      return;
    }

    const isUpdatableOutcome =
      diff.diff_outcome === ThreeWayDiffOutcome.CustomizedValueSameUpdate ||
      diff.diff_outcome === ThreeWayDiffOutcome.StockValueCanUpdate ||
      diff.diff_outcome === ThreeWayDiffOutcome.CustomizedValueCanUpdate ||
      diff.diff_outcome === ThreeWayDiffOutcome.MissingBaseCanUpdate;

    if (!isUpdatableOutcome) {
      return;
    }

    updatedFieldsTotal.push(fieldName);

    switch (diff.conflict) {
      case ThreeWayDiffConflict.NON_SOLVABLE:
        updatedFieldsWithNonSolvableConflicts.push(fieldName);
        break;
      case ThreeWayDiffConflict.SOLVABLE:
        updatedFieldsWithSolvableConflicts.push(fieldName);
        break;
      case ThreeWayDiffConflict.NONE:
      default:
        updatedFieldsWithNoConflicts.push(fieldName);
        break;
    }
  });

  return {
    ruleId,
    ruleName,
    hasBaseVersion,
    hasRuleTypeChange: hasRuleTypeChanged(fieldsDiff.type),
    updatedFieldsSummary: {
      count: updatedFieldsTotal.length,
      nonSolvableConflictsCount: updatedFieldsWithNonSolvableConflicts.length,
      solvableConflictsCount: updatedFieldsWithSolvableConflicts.length,
      noConflictsCount: updatedFieldsWithNoConflicts.length,
    },
    updatedFieldsTotal,
    updatedFieldsWithNonSolvableConflicts,
    updatedFieldsWithSolvableConflicts,
    updatedFieldsWithNoConflicts,
    finalResult,
  };
}
