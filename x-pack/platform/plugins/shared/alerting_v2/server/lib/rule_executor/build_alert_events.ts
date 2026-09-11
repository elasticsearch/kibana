/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import { stableStringify } from '@kbn/std';

import type { EsqlQueryResponse } from '@elastic/elasticsearch/lib/api/types';
import { alertEventSeverity } from '@kbn/alerting-v2-schemas';
import type { AlertEventSeverity, RuleResponse } from '@kbn/alerting-v2-schemas';
import type { AlertEvent, AlertEventType } from '../../resources/datastreams/alert_events';
import { alertEventType, buildRuleEventDocument } from '../../resources/datastreams/alert_events';
import type { ActiveAlertGroupHash } from './queries';

/**
 * Maps a `rule.kind` to the `AlertEventType` its events should be stamped
 * with at creation time.
 *
 * A stateful (`kind: 'alert'`) rule produces `type: 'alert'` events, tracked
 * as episodes by the director. A stateless (`kind: 'signal'`) rule produces
 * `type: 'signal'` events, never episode-tracked.
 *
 * The `switch` is written exhaustively over `RuleKind`: the `default` branch
 * assigns `rule.kind` to a `never`-typed local, which produces a compile
 * error the moment a new `RuleKind` variant is added but not handled here.
 * This prevents a future kind from silently defaulting to one branch.
 */
export const resolveAlertEventType = (rule: Pick<RuleResponse, 'kind'>): AlertEventType => {
  switch (rule.kind) {
    case 'alert':
      return alertEventType.alert;
    case 'signal':
      return alertEventType.signal;
    default: {
      const unhandled: never = rule.kind;
      throw new Error(`Unhandled rule.kind: ${unhandled as string}`);
    }
  }
};

const SEVERITY_COLUMN = 'severity';
const SUPPORTED_SEVERITIES = new Set<AlertEventSeverity>(
  Object.values(alertEventSeverity) as AlertEventSeverity[]
);

/**
 * Best-effort severity extraction for breached alert events.
 *
 * The framework supports a fixed set of severity values. Users map their
 * source data severities into these values via the rule's ES|QL query,
 * which may emit a `severity` column. This helper:
 *
 * - returns `undefined` when the column is missing or not a string
 * - lowercases the value before comparing against the supported set
 * - returns the matching {@link AlertEventSeverity} or `undefined`
 *
 * Recovered and no-data events do not carry severity, so this is only
 * applied to breached events.
 */
function extractSeverity(rowDoc: Record<string, unknown>): AlertEventSeverity | undefined {
  const raw = rowDoc[SEVERITY_COLUMN];

  if (typeof raw !== 'string') {
    return undefined;
  }

  const normalized = raw.toLowerCase() as AlertEventSeverity;

  return SUPPORTED_SEVERITIES.has(normalized) ? normalized : undefined;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export const buildExecutionUuid = ({
  ruleId,
  spaceId,
  scheduledTimestamp,
  suffix,
}: {
  ruleId: string;
  spaceId: string;
  scheduledTimestamp: string;
  suffix?: string;
}): string => sha256(`${ruleId}|${spaceId}|${scheduledTimestamp}${suffix ? `|${suffix}` : ''}`);

export function buildGroupHash({
  rowDoc,
  groupKeyFields,
  fallbackSeed,
}: {
  rowDoc: Record<string, unknown>;
  groupKeyFields: string[];
  fallbackSeed: string;
}): string {
  if (!groupKeyFields || groupKeyFields.length === 0) {
    return sha256(fallbackSeed);
  }

  const keyPart = groupKeyFields.join('|');
  const valuePart = groupKeyFields.map((f) => String(rowDoc[f] ?? '')).join('|');

  return sha256(`${keyPart}|${valuePart}`);
}

export interface BuildAlertEventsBaseOpts {
  ruleId: string;
  ruleVersion: number;
  spaceId: string;
  ruleAttributes: Pick<RuleResponse, 'grouping'>;
  type: AlertEventType;
  /**
   * Stable identifier for this task run (used for deterministic ids to avoid duplicates on retry).
   */
  scheduledTimestamp: string;
  maxGroupsPerExecution: number;
  activeGroupHashes?: ReadonlySet<string>;
}

export interface AlertEventsBatchBuilder {
  buildBatch(batch: Array<Record<string, unknown>>): AlertEvent[];
  readonly droppedGroupCount: number;
}

export function createAlertEventsBatchBuilder({
  ruleId,
  ruleVersion,
  spaceId,
  ruleAttributes,
  type,
  scheduledTimestamp,
  maxGroupsPerExecution,
  activeGroupHashes = new Set<string>(),
}: BuildAlertEventsBaseOpts): AlertEventsBatchBuilder {
  // Stable per run to support retries without duplicating documents.
  // Include spaceId to avoid collisions when multiple spaces write into the same data stream.
  const executionUuid = buildExecutionUuid({ ruleId, spaceId, scheduledTimestamp });

  const source = 'internal';
  const groupingFields = ruleAttributes.grouping?.fields ?? [];
  const hasGroupingFields = groupingFields.length > 0;
  const groupHashes = new Set<string>();
  const droppedGroupHashes = new Set<string>();
  let index = 0;

  const buildBatch = (batch: Array<Record<string, unknown>>): AlertEvent[] => {
    // Timestamp when the alert event is written to the index.
    const wroteAt = new Date().toISOString();
    const alertEventsBatch: AlertEvent[] = [];

    for (const rowDoc of batch) {
      // Advance per row (even when dropped) so non-dropped rows keep deterministic hashes across retries.
      const rowIndex = index++;

      const groupHash = buildGroupHash({
        rowDoc,
        groupKeyFields: groupingFields,
        get fallbackSeed(): string {
          return `${executionUuid}|row:${rowIndex}|${stableStringify(rowDoc)}`;
        },
      });

      const isNewGroup = !groupHashes.has(groupHash);
      const isActiveGroup = activeGroupHashes.has(groupHash);
      if (
        // Only check maxGroupsPerExecution for grouped rules
        hasGroupingFields &&
        isNewGroup &&
        // Active groups with an existing episode should not be dropped.
        !isActiveGroup &&
        groupHashes.size >= maxGroupsPerExecution
      ) {
        droppedGroupHashes.add(groupHash);
        continue;
      }

      if (isNewGroup) {
        groupHashes.add(groupHash);
      }

      const doc = buildRuleEventDocument({
        '@timestamp': wroteAt,
        scheduled_timestamp: scheduledTimestamp,
        rule: { id: ruleId, version: ruleVersion },
        group_hash: groupHash,
        data: rowDoc,
        status: 'breached',
        source,
        type,
        space_id: spaceId,
        severity: extractSeverity(rowDoc),
      });

      alertEventsBatch.push(doc);
    }

    return alertEventsBatch;
  };

  return {
    buildBatch,
    get droppedGroupCount() {
      return droppedGroupHashes.size;
    },
  };
}

export interface BuildRecoveryAlertEventsOpts {
  ruleId: string;
  ruleVersion: number;
  spaceId: string;
  activeGroupHashes: ActiveAlertGroupHash[];
  breachedGroupHashes: ReadonlySet<string>;
  scheduledTimestamp: string;
  type: AlertEventType;
  dataPresentGroupHashes?: ReadonlySet<string>;
}

/**
 * Creates `recovered` alert events for groups that were previously in a non-inactive
 * episode state but are no longer present in the current breached set.
 *
 * Used when no recover query is configured on the rule.
 */
export function buildRecoveryAlertEvents({
  ruleId,
  ruleVersion,
  spaceId,
  activeGroupHashes,
  breachedGroupHashes,
  scheduledTimestamp,
  type,
  dataPresentGroupHashes,
}: BuildRecoveryAlertEventsOpts): AlertEvent[] {
  const wroteAt = new Date().toISOString();

  return activeGroupHashes
    .filter(
      ({ group_hash }) =>
        !breachedGroupHashes.has(group_hash) &&
        (dataPresentGroupHashes == null || dataPresentGroupHashes.has(group_hash))
    )
    .map(({ group_hash }) =>
      buildRuleEventDocument({
        '@timestamp': wroteAt,
        scheduled_timestamp: scheduledTimestamp,
        rule: { id: ruleId, version: ruleVersion },
        group_hash,
        data: {},
        status: 'recovered',
        source: 'internal',
        type,
        space_id: spaceId,
      })
    );
}

export interface BuildContinuedBreachAlertEventsOpts {
  ruleId: string;
  ruleVersion: number;
  spaceId: string;
  groupHashes: string[];
  scheduledTimestamp: string;
  type: AlertEventType;
}

/**
 * Creates continued `breached` alert events for the supplied group hashes.
 *
 * Used when active group that is absent from the breach batch and did not match the
 * recovery query, but still has data.
 */
export function buildContinuedBreachAlertEvents({
  ruleId,
  ruleVersion,
  spaceId,
  groupHashes,
  scheduledTimestamp,
  type,
}: BuildContinuedBreachAlertEventsOpts): AlertEvent[] {
  const wroteAt = new Date().toISOString();

  return groupHashes.map((groupHash) => ({
    '@timestamp': wroteAt,
    scheduled_timestamp: scheduledTimestamp,
    rule: { id: ruleId, version: ruleVersion },
    group_hash: groupHash,
    data: {},
    status: 'breached' as const,
    source: 'internal',
    type,
    space_id: spaceId,
  }));
}

export interface BuildNoDataAlertEventsOpts {
  ruleId: string;
  ruleVersion: number;
  spaceId: string;
  groupHashes: string[];
  scheduledTimestamp: string;
  type: AlertEventType;
}

/**
 * Creates `no_data` alert events for the supplied group hashes.
 *
 * Used when no_data_strategy is configured on the rule.
 */
export function buildNoDataAlertEvents({
  ruleId,
  ruleVersion,
  spaceId,
  groupHashes,
  scheduledTimestamp,
  type,
}: BuildNoDataAlertEventsOpts): AlertEvent[] {
  const wroteAt = new Date().toISOString();

  return groupHashes.map((groupHash) => ({
    '@timestamp': wroteAt,
    scheduled_timestamp: scheduledTimestamp,
    rule: { id: ruleId, version: ruleVersion },
    group_hash: groupHash,
    data: {},
    status: 'no_data' as const,
    source: 'internal',
    type,
    space_id: spaceId,
  }));
}

export function rowToDocument(
  columns: EsqlQueryResponse['columns'],
  row: unknown[]
): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    doc[columns[i].name] = row[i];
  }
  return doc;
}

export interface BuildQueryRecoveryAlertEventsOpts {
  ruleId: string;
  ruleVersion: number;
  spaceId: string;
  ruleAttributes: Pick<RuleResponse, 'grouping'>;
  activeGroupHashes: ActiveAlertGroupHash[];
  breachedGroupHashes: ReadonlySet<string>;
  esqlResponse: EsqlQueryResponse;
  scheduledTimestamp: string;
  type: AlertEventType;
}
/**
 * Creates `recovered` alert events by running a custom recovery query.
 *
 * Active groups whose group hash matches a row in the recovery query results
 * are considered recovered. Used when the rule has a recover query configured.
 *
 * Breach always takes priority: groups present in the current breach batch are
 * excluded even if the recovery query also matched them.
 */
export function buildQueryRecoveryAlertEvents({
  ruleId,
  ruleVersion,
  spaceId,
  ruleAttributes,
  activeGroupHashes,
  breachedGroupHashes,
  esqlResponse,
  scheduledTimestamp,
  type,
}: BuildQueryRecoveryAlertEventsOpts): AlertEvent[] {
  const columns = esqlResponse.columns ?? [];
  const values = esqlResponse.values ?? [];

  if (columns.length === 0 || values.length === 0) {
    return [];
  }

  const executionUuid = buildExecutionUuid({
    ruleId,
    spaceId,
    scheduledTimestamp,
    suffix: 'recovery',
  });
  const groupingFields = ruleAttributes.grouping?.fields ?? [];
  const activeGroupHashSet = new Set(activeGroupHashes.map(({ group_hash }) => group_hash));

  // Keep the first matching row's data per group hash.
  const recoveredByGroupHash = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < values.length; i++) {
    const rowDoc = rowToDocument(columns, values[i]);
    const groupHash = buildGroupHash({
      rowDoc,
      groupKeyFields: groupingFields,
      get fallbackSeed(): string {
        return `${executionUuid}|row:${i}|${stableStringify(rowDoc)}`;
      },
    });

    if (
      activeGroupHashSet.has(groupHash) &&
      !breachedGroupHashes.has(groupHash) &&
      !recoveredByGroupHash.has(groupHash)
    ) {
      recoveredByGroupHash.set(groupHash, rowDoc);
    }
  }

  if (recoveredByGroupHash.size === 0) {
    return [];
  }

  const wroteAt = new Date().toISOString();

  return Array.from(recoveredByGroupHash).map(([groupHash, data]) =>
    buildRuleEventDocument({
      '@timestamp': wroteAt,
      scheduled_timestamp: scheduledTimestamp,
      rule: { id: ruleId, version: ruleVersion },
      group_hash: groupHash,
      data,
      status: 'recovered',
      source: 'internal',
      type,
      space_id: spaceId,
    })
  );
}
