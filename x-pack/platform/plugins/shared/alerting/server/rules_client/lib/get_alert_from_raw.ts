/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, SavedObjectReference } from '@kbn/core/server';
import type {
  Rule,
  PartialRule,
  RawRule,
  IntervalSchedule,
  RuleTypeParams,
  RuleWithLegacyId,
  PartialRuleWithLegacyId,
  RuleTypeRegistry,
} from '../../types';
import {
  ruleExecutionStatusFromRaw,
  convertMonitoringFromRawAndVerify,
  getRuleSnoozeEndTime,
} from '../../lib';
import type { UntypedNormalizedRuleType } from '../../rule_type_registry';
import { getActiveScheduledSnoozes } from '../../lib/is_rule_snoozed';
import { injectReferencesIntoParams } from '../common';
import {
  transformRawActionsToDomainActions,
  transformRawActionsToDomainSystemActions,
} from '../../application/rule/transforms/transform_raw_actions_to_domain_actions';
import { transformRawArtifactsToDomainArtifacts } from '../../application/rule/transforms/transform_raw_artifacts_to_domain_artifacts';

export interface GetAlertFromRawParams {
  id: string;
  ruleTypeId: string;
  rawRule: RawRule;
  references: SavedObjectReference[] | undefined;
}

interface GetAlertFromRawOpts {
  id: string;
  isSystemAction: (actionId: string) => boolean;
  logger: Logger;
  rawRule: RawRule;
  references: SavedObjectReference[] | undefined;
  ruleTypeId: string;
  ruleTypeRegistry: RuleTypeRegistry;
}

type GetPartialRuleFromRawOpts = Omit<GetAlertFromRawOpts, 'ruleTypeRegistry'> & {
  ruleType: UntypedNormalizedRuleType;
};
/**
 * @deprecated in favor of transformRuleAttributesToRuleDomain
 */
export function getAlertFromRaw<Params extends RuleTypeParams>(
  opts: GetAlertFromRawOpts
): Rule | RuleWithLegacyId {
  const ruleType = opts.ruleTypeRegistry.get(opts.ruleTypeId);
  const res = getPartialRuleFromRaw<Params>({
    id: opts.id,
    isSystemAction: opts.isSystemAction,
    logger: opts.logger,
    rawRule: opts.rawRule,
    references: opts.references,
    ruleTypeId: opts.ruleTypeId,
    ruleType,
  });

  return res as Rule;
}

function getPartialRuleFromRaw<Params extends RuleTypeParams>(
  opts: GetPartialRuleFromRawOpts
): PartialRule<Params> | PartialRuleWithLegacyId<Params> {
  const { rawRule } = opts;

  const {
    createdAt,
    updatedAt,
    meta,
    notifyWhen,
    legacyId,
    scheduledTaskId,
    params,
    executionStatus,
    monitoring,
    nextRun,
    lastEnabledAt,
    schedule,
    actions,
    snoozeSchedule,
    lastRun,
    isSnoozedUntil: DoNotUseIsSnoozedUntil,
    artifacts,
    snoozedInstances,
    ...partialRawRule
  } = rawRule;

  const snoozeScheduleDates = snoozeSchedule?.map((s) => ({
    ...s,
    rRule: {
      ...s.rRule,
      dtstart: new Date(s.rRule.dtstart).toISOString(),
      ...(s.rRule.until ? { until: new Date(s.rRule.until).toISOString() } : {}),
    },
  }));
  const isSnoozedUntil = getRuleSnoozeEndTime({
    muteAll: partialRawRule.muteAll ?? false,
    snoozeSchedule,
  });

  const activeSnoozes = getActiveScheduledSnoozes({
    snoozeSchedule,
    muteAll: partialRawRule.muteAll ?? false,
  })?.map((s) => s.id);

  const includeMonitoring = monitoring;

  const rule: PartialRule<Params> = {
    id: opts.id,
    notifyWhen,
    ...partialRawRule,
    // we currently only support the Interval Schedule type
    // Once we support additional types, this type signature will likely change
    schedule: schedule as IntervalSchedule,
    actions: actions
      ? transformRawActionsToDomainActions({
          ruleId: opts.id,
          actions,
          references: opts.references || [],
          isSystemAction: opts.isSystemAction,
        })
      : [],
    systemActions: actions
      ? transformRawActionsToDomainSystemActions({
          ruleId: opts.id,
          actions,
          references: opts.references || [],
          isSystemAction: opts.isSystemAction,
        })
      : [],
    artifacts: transformRawArtifactsToDomainArtifacts(opts.id, artifacts, opts.references),
    params: injectReferencesIntoParams(
      opts.id,
      opts.ruleType,
      params,
      opts.references || []
    ) as Params,
    snoozeSchedule: snoozeScheduleDates ?? [],
    activeSnoozes,
    isSnoozedUntil,
    ...(snoozedInstances?.length ? { snoozedInstances } : {}),
    ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
    ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
    ...(lastEnabledAt ? { lastEnabledAt: new Date(lastEnabledAt) } : {}),
    ...(scheduledTaskId ? { scheduledTaskId } : {}),
    ...(executionStatus
      ? { executionStatus: ruleExecutionStatusFromRaw(opts.logger, opts.id, executionStatus) }
      : {}),
    ...(includeMonitoring
      ? { monitoring: convertMonitoringFromRawAndVerify(opts.logger, opts.id, monitoring) }
      : {}),
    ...(nextRun ? { nextRun: new Date(nextRun) } : {}),
    ...(lastRun
      ? {
          lastRun: {
            ...lastRun,
            ...(lastRun.outcomeMsg && !Array.isArray(lastRun.outcomeMsg)
              ? { outcomeMsg: lastRun.outcomeMsg ? [lastRun.outcomeMsg] : null }
              : { outcomeMsg: lastRun.outcomeMsg }),
          },
        }
      : {}),
  };

  // Need the `rule` object to build a URL
  const viewInAppRelativeUrl =
    opts.ruleType.getViewInAppRelativeUrl && opts.ruleType.getViewInAppRelativeUrl({ rule });

  if (viewInAppRelativeUrl) {
    rule.viewInAppRelativeUrl = viewInAppRelativeUrl;
  }

  return rule;
}
