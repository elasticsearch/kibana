/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isPlainObject } from 'lodash';
import type { Logger } from '@kbn/logging';
import { RESOLUTION_RULE_IDS } from '../../../common/domain/resolution_rules/constants';
import type { AutomatedResolutionState, PerRuleLastRunStats, PerRuleState } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> => isPlainObject(value);

// The watermark is the one field fed back to Elasticsearch (as a range filter), so a
// malformed value is normalized to null (a full re-scan) rather than passed through.
const toWatermark = (value: unknown, logger: Logger): string | null => {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value;
  }
  logger.warn(`Dropping malformed automated-resolution watermark: ${String(value)}`);
  return null;
};

const toLastRun = (value: unknown): PerRuleLastRunStats | null => {
  if (
    isRecord(value) &&
    typeof value.resolutionsCreated === 'number' &&
    typeof value.skippedAmbiguousBuckets === 'number'
  ) {
    return {
      resolutionsCreated: value.resolutionsCreated,
      skippedAmbiguousBuckets: value.skippedAmbiguousBuckets,
    };
  }
  return null;
};

/**
 * Reshapes the persisted automated-resolution task state into the per-rule map.
 * Runs every cycle, so it must never throw and must be idempotent.
 *
 * In practice there are only two real inputs:
 *  - the current `{ rules }` shape — passed through untouched, which also preserves
 *    rule ids this version may not know yet (e.g. written by a newer node during a
 *    rolling upgrade);
 *  - the original flat `{ lastProcessedTimestamp, lastRun }` — the email rule's
 *    watermark, moved into `rules[email_exact_match]`.
 *
 * Anything else (empty / null / garbage) yields an empty map; a rule with no entry
 * backfills on its first run.
 */
export function migrate(input: unknown, logger: Logger): AutomatedResolutionState {
  const source = isRecord(input) ? input : {};
  const emailRuleId = RESOLUTION_RULE_IDS.EMAIL_EXACT_MATCH;

  const rules: Record<string, PerRuleState> = isRecord(source.rules)
    ? { ...(source.rules as Record<string, PerRuleState>) }
    : {};

  // Move the legacy flat state into the email rule slot — unless it was already
  // migrated, in which case keep the newer progress (idempotent / crash-retry safe).
  const hasLegacyState =
    Object.hasOwn(source, 'lastProcessedTimestamp') || Object.hasOwn(source, 'lastRun');
  if (hasLegacyState && !Object.hasOwn(rules, emailRuleId)) {
    rules[emailRuleId] = {
      lastProcessedTimestamp: toWatermark(source.lastProcessedTimestamp, logger),
      lastRun: toLastRun(source.lastRun),
    };
  }

  return { rules };
}
