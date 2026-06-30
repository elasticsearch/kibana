/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  QueryDslQueryContainer,
  SortCombinations,
} from '@elastic/elasticsearch/lib/api/types';
import type { RuleTypeSolution } from '@kbn/alerting-types';
import type { ChangeHistoryDocument, GetHistoryResult } from '@kbn/change-history';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import { AlertingAuthorizationEntity, ReadOperations } from '../../authorization';
import { ruleAuditEvent, RuleAuditAction } from '../common/audit_events';
import { RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import type { RulesClientContext } from '../types';
import { transformRuleDomainToRule } from '../../application/rule/transforms';
import type { Rule, RuleDomain, RuleParams } from '../../application/rule/types';
import type { RuleChangeHistorySnapshot } from '../lib/change_tracking';
import { getRuleSo } from '../../data/rule';

/**
 * Thrown by {@link RulesClient.getHistory} when rule change tracking is
 * disabled at the framework level (`xpack.alerting.ruleChangeTracking.enabled = false`).
 */
export class RuleChangeTrackingDisabledError extends Error {
  constructor(message = 'Rule change tracking is disabled.') {
    super(message);
    this.name = 'RuleChangeTrackingDisabledError';
  }
}

export interface GetRuleHistoryParams {
  /** Solution module that owns the rule (e.g. `'security'`). */
  module: RuleTypeSolution;
  /** Rule id to fetch history for. */
  ruleId: string;
  /** ES `from` offset. Defaults to 0. */
  from?: number;
  /** ES `size`. Defaults to 20. */
  size?: number;
  /** ES sort. When omitted, the underlying change-history client's default applies. */
  sort?: SortCombinations[];
  /** Extra ES query clauses ANDed into the history search (e.g. a term filter on event.id). */
  filters?: QueryDslQueryContainer[];
}

/**
 * A single rule change-history document with the rule snapshot rehydrated
 * into a `SanitizedRule` shape so callers don't have to deal with the raw
 * stored `object.snapshot` directly.
 */
export interface RuleChangeHistoryDocument<Params extends RuleParams = RuleParams>
  extends ChangeHistoryDocument {
  rule: Rule<Params>;
}

/**
 * Page of rule change-history documents returned by {@link RulesClient.getHistory}.
 */
export interface GetRuleHistoryResult extends GetHistoryResult {
  items: RuleChangeHistoryDocument[];
}

const DEFAULT_FROM = 0;
const DEFAULT_SIZE = 20;

export async function getRuleHistory(
  context: RulesClientContext,
  { module, ruleId, from = DEFAULT_FROM, size = DEFAULT_SIZE, sort, filters }: GetRuleHistoryParams
): Promise<GetRuleHistoryResult> {
  if (!context.changeTrackingService) {
    throw new RuleChangeTrackingDisabledError();
  }

  // Resolve auth info from the rule saved object. When the rule is deleted, fall back to
  // the most recent history snapshot so we can still authorize and serve the history.
  let ruleTypeId: string | undefined;
  let consumer: string | undefined;
  let ruleName: string | undefined;

  try {
    const currentRule = await getRuleSo({
      savedObjectsClient: context.unsecuredSavedObjectsClient,
      id: ruleId,
    });
    ruleTypeId = currentRule.attributes.alertTypeId;
    consumer = currentRule.attributes.consumer;
    ruleName = currentRule.attributes.name;
  } catch (error) {
    if (!SavedObjectsErrorHelpers.isNotFoundError(error)) {
      throw error;
    }

    // Rule was deleted. Extract auth info from the most recent history snapshot.
    const latestHistory = await context.changeTrackingService.getHistory(
      module,
      context.spaceId,
      ruleId,
      { from: 0, size: 1, sort: [{ '@timestamp': { order: 'desc' } }] }
    );

    if (latestHistory.items.length === 0) {
      return { total: 0, items: [] };
    }

    const snapshot = latestHistory.items[0].object.snapshot as
      | RuleChangeHistorySnapshot
      | undefined;
    ruleTypeId = snapshot?.alertTypeId;
    consumer = snapshot?.consumer;
    ruleName = snapshot?.name;
  }

  if (!ruleTypeId || !consumer) {
    return { total: 0, items: [] };
  }

  try {
    await context.authorization.ensureAuthorized({
      ruleTypeId,
      consumer,
      operation: ReadOperations.GetHistory,
      entity: AlertingAuthorizationEntity.Rule,
    });
  } catch (error) {
    context.auditLogger?.log(
      ruleAuditEvent({
        action: RuleAuditAction.GET_HISTORY,
        savedObject: {
          type: RULE_SAVED_OBJECT_TYPE,
          id: ruleId,
          name: ruleName,
        },
        error,
      })
    );
    throw error;
  }

  context.auditLogger?.log(
    ruleAuditEvent({
      action: RuleAuditAction.GET_HISTORY,
      savedObject: { type: RULE_SAVED_OBJECT_TYPE, id: ruleId, name: ruleName },
    })
  );

  const result = await context.changeTrackingService.getHistory(module, context.spaceId, ruleId, {
    from,
    size,
    sort,
    additionalFilters: filters,
  });

  const itemsRule: RuleChangeHistoryDocument[] = [];

  for (const item of result.items) {
    const ruleSnapshot = hydrateRuleSnapshot(item.object, context.logger);

    if (ruleSnapshot) {
      itemsRule.push({ ...item, rule: ruleSnapshot });
    }
  }

  return {
    ...result,
    items: itemsRule,
  };
}

/**
 * Reconstructs the `SanitizedRule` for a single history entry from its
 * `object.snapshot` (a serialized `RuleChangeHistorySnapshot` with ISO date strings).
 */
function hydrateRuleSnapshot(
  obj: ChangeHistoryDocument['object'],
  logger: RulesClientContext['logger']
): Rule | undefined {
  const snapshot = obj.snapshot;

  if (!isRuleDomainSnapshot(snapshot)) {
    return;
  }

  try {
    const ruleDomain = {
      ...snapshot,
      createdAt: hydrateDateField(snapshot.createdAt),
      updatedAt: hydrateDateField(snapshot.updatedAt),
    };

    return transformRuleDomainToRule(ruleDomain as RuleDomain);
  } catch (error) {
    logger.warn(`Unable to hydrate rule snapshot for [${obj.id}]: ${error}`);
    return;
  }
}

function hydrateDateField(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }

  return null;
}

/**
 * Minimal guard on-read. Full field-level validation is omitted.
 * This is because snapshots are stored as unmapped JSON and never migrated
 * (stricter checks would silently invalidate records after schema changes),
 * and `transformRuleDomainToRule` never throws.
 * Missing fields produce `undefined` output rather than errors.
 * We may wish to review the logic here later to cater for more complex cases around corrupt records.
 * In particular, we want to avoid 2 scenarios:
 * - Returning 500 for whole response on single corrupt record.
 * - Silently chomping out valid historical records when schema diverges far enough.
 */
function isRuleDomainSnapshot(
  maybeRuleDomain: unknown
): maybeRuleDomain is RuleChangeHistorySnapshot {
  return (
    typeof maybeRuleDomain === 'object' &&
    maybeRuleDomain !== null &&
    typeof (maybeRuleDomain as Record<string, unknown>).id === 'string'
  );
}
