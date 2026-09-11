/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup, EventTypeOpts, Logger } from '@kbn/core/server';
import type { RuleResponse } from '../../../../../../common/api/detection_engine/model/rule_schema';
import { isCustomizedPrebuiltRule } from '../../../../../../common/api/detection_engine/model/rule_schema/utils';
import type { RuleAlertType } from '../../../rule_schema';
import { DETECTION_RULE_DUPLICATE_EVENT } from '../../../../telemetry/event_based/events';

export type RuleLifecycleTelemetryData = Pick<RuleResponse, 'id' | 'type' | 'rule_source'>;

export interface RuleLifecycleTelemetry {
  ruleId: string;
  ruleType: RuleResponse['type'];
  isPrebuilt: boolean;
  isCustomized: boolean;
}

export function sendRuleLifecycleTelemetryEvent(
  analytics: AnalyticsServiceSetup,
  eventType: EventTypeOpts<RuleLifecycleTelemetry>,
  rule: RuleLifecycleTelemetryData,
  logger?: Logger
): void {
  try {
    analytics.reportEvent(eventType.eventType, createRuleLifecycleTelemetryEvent(rule));
  } catch (e) {
    // we don't want telemetry errors to impact the main flow
    logger?.debug(`Failed to send ${eventType.eventType} telemetry`, e);
  }
}

export interface RuleDuplicateTelemetry {
  ruleId: string;
  sourceRuleId: string;
  ruleType: string;
  isPrebuiltSource: boolean;
  isCustomizedSource: boolean;
}

export function sendRuleDuplicateTelemetryEvent(
  analytics: AnalyticsServiceSetup,
  params: { createdRule: RuleAlertType; sourceRule: RuleAlertType },
  logger?: Logger
): void {
  try {
    const event = createRuleDuplicateTelemetryEvent(params);
    analytics.reportEvent(DETECTION_RULE_DUPLICATE_EVENT.eventType, event);
  } catch (e) {
    // we don't want telemetry errors to impact the main flow
    logger?.debug('Failed to send detection rule duplicate telemetry', e);
  }
}

function createRuleLifecycleTelemetryEvent(
  rule: RuleLifecycleTelemetryData
): RuleLifecycleTelemetry {
  return {
    ruleId: rule.id,
    ruleType: rule.type,
    isPrebuilt: rule.rule_source.type === 'external',
    isCustomized: isCustomizedPrebuiltRule(rule),
  };
}

function createRuleDuplicateTelemetryEvent({
  createdRule,
  sourceRule,
}: {
  createdRule: RuleAlertType;
  sourceRule: RuleAlertType;
}): RuleDuplicateTelemetry {
  const ruleSource = sourceRule.params.ruleSource;

  return {
    ruleId: createdRule.id,
    sourceRuleId: sourceRule.id,
    ruleType: sourceRule.params.type,
    isPrebuiltSource: ruleSource?.type === 'external',
    isCustomizedSource: ruleSource?.type === 'external' && ruleSource.isCustomized,
  };
}
