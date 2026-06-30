/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { EntityRelationshipKey } from '@kbn/entity-store/common/domain/definitions/common_fields';

import type { EntityRelationshipRecord, BucketTargetByThresholdConfig } from './types';
import { entityTypeFromEuid } from './types';
import { ENGINE_COLUMNS } from './columns';

interface EsqlColumn {
  name: string;
  type: string;
}

function toStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

/**
 * Minimal projection of `RelationshipIntegrationConfig` that the parser reads.
 * Mirrors the engine's three variants on `kind` so consumers (and tests) can
 * supply tightly-typed fixtures without filling in the engine fields the
 * parser doesn't touch (`name`, `indexPattern`, `targetEntityType`, etc.).
 *
 * `Pick` over a discriminated union does not preserve the discriminator
 * narrowing for fields that are absent on some variants (`bucketTargetByThreshold`
 * collapses to `unknown`), so the projection is written out explicitly here.
 *
 * Bucketed configs do not carry `relationshipKey` — the bucket pair declares
 * both schema keys this maintainer writes to.
 */
interface ParseConfigBase {
  id: string;
}
type ParseConfig =
  | (ParseConfigBase & { kind: 'standard'; relationshipKey: EntityRelationshipKey })
  | (ParseConfigBase & { kind: 'bucketed'; bucketTargetByThreshold: BucketTargetByThresholdConfig })
  | (ParseConfigBase & { kind: 'override'; relationshipKey: EntityRelationshipKey });

/**
 * Safety net for developer-provided `kind: 'override'` configs.
 *
 * Overrides are required to emit a fixed set of column names (see the column
 * contract documented on `OverrideRelationshipIntegrationConfig`). If they
 * don't, every row below silently parses as null/empty and the engine produces
 * zero records — a slow, silent failure that's painful to debug.
 *
 * This emits a single actionable warning naming the missing columns. It only
 * runs on the override path because the default builder generates the columns
 * itself and cannot drift.
 */
function warnIfOverrideColumnsMissing(
  columns: EsqlColumn[],
  config: ParseConfig,
  logger: Logger
): void {
  if (config.kind !== 'override') return;
  const colNames = new Set(columns.map((c) => c.name));
  const expected = [ENGINE_COLUMNS.actor, ENGINE_COLUMNS.flat(config.relationshipKey)];
  const missing = expected.filter((n) => !colNames.has(n));
  if (missing.length > 0) {
    logger.warn(
      `[${config.id}] esqlQueryOverride is missing expected columns: ${missing.join(
        ', '
      )} — results will be empty`
    );
  }
}

export const parseTargetsPerActorRows = (
  columns: EsqlColumn[],
  values: unknown[][],
  config: ParseConfig,
  logger: Logger
): EntityRelationshipRecord[] => {
  warnIfOverrideColumnsMissing(columns, config, logger);

  return values.map((row): EntityRelationshipRecord => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      record[col.name] = row[idx];
    });

    const actorRaw = record[ENGINE_COLUMNS.actor];
    const actorUserId = actorRaw != null ? String(actorRaw) : null;

    // TODO(#266748): entityType hardcoded to 'user' — use actorEntityType from config.
    if (config.kind === 'bucketed') {
      const { aboveThresholdRelationship: above, belowThresholdRelationship: below } =
        config.bucketTargetByThreshold;
      const aboveCol = ENGINE_COLUMNS.bucketAbove(above);
      const belowCol = ENGINE_COLUMNS.bucketBelow(below);
      return {
        entityId: actorUserId,
        entityType: entityTypeFromEuid(actorUserId),
        relationships: {
          [above]: toStringArray(record[aboveCol]),
          [below]: toStringArray(record[belowCol]),
        },
      };
    }

    const flatCol = ENGINE_COLUMNS.flat(config.relationshipKey);
    return {
      entityId: actorUserId,
      entityType: entityTypeFromEuid(actorUserId),
      relationships: {
        [config.relationshipKey]: toStringArray(record[flatCol]),
      },
    };
  });
};
