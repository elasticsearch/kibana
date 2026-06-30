/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import { get } from 'lodash';
import type { Entity, EntityType } from '../../../common';
import {
  ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
  ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
  ASSET_CRITICALITY_UPDATED_WATCHED_FIELDS,
  RISK_SCORE_CHANGED_WATCHED_FIELDS,
} from '../../../common/workflow/triggers';

export const ALL_WORKFLOW_WATCHED_FIELDS = [
  ...ASSET_CRITICALITY_UPDATED_WATCHED_FIELDS,
  ...RISK_SCORE_CHANGED_WATCHED_FIELDS,
] as const;

export interface WorkflowEmitTarget {
  entityId: string;
  entityType: EntityType;
  doc: Entity;
}

type RiskScoreWorkflowEmitTarget = WorkflowEmitTarget & {
  previousScore: number | null;
};

interface WorkflowEventPublisherOpts {
  emit?: (triggerId: string, payload: Record<string, unknown>) => Promise<void>;
  fetchDocsFn: (ids: string[], fields: readonly string[]) => Promise<Map<string, Entity>>;
  logger: Logger;
}

export class WorkflowEventPublisher {
  private readonly logger: Logger;
  private readonly emit?: (triggerId: string, payload: Record<string, unknown>) => Promise<void>;
  private readonly fetchDocsFn: (
    ids: string[],
    fields: readonly string[]
  ) => Promise<Map<string, Entity>>;

  constructor({ logger, emit, fetchDocsFn }: WorkflowEventPublisherOpts) {
    this.logger = logger;
    this.emit = emit;
    this.fetchDocsFn = fetchDocsFn;
  }

  public async maybeGetExistingDocs(docs: Entity[]): Promise<Map<string, Entity>> {
    if (!this.emit || docs.length === 0) return new Map<string, Entity>();
    const shouldEmit = docs.some((doc) =>
      ALL_WORKFLOW_WATCHED_FIELDS.some((field) => get(doc, field) !== undefined)
    );

    if (shouldEmit) {
      return await this.fetchDocsFn(
        docs.filter((doc) => !!doc?.entity?.id).map((doc) => doc?.entity?.id!),
        ALL_WORKFLOW_WATCHED_FIELDS
      );
    }

    return new Map<string, Entity>();
  }

  public emitAssetCriticalityUpdated(targets: WorkflowEmitTarget[]): void {
    if (!this.emit || targets.length === 0) return;
    const emitPromises = targets.flatMap(({ entityId, entityType, doc }) => {
      const updatedCriticalityLevel = get(doc, ASSET_CRITICALITY_UPDATED_WATCHED_FIELDS[0]);
      if (updatedCriticalityLevel === undefined) return [];
      return [
        this.emit?.(ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID, {
          entityId,
          entityType,
          criticalityLevel: updatedCriticalityLevel,
        }),
      ];
    });

    if (emitPromises.length === 0) return;
    Promise.allSettled(emitPromises).then((results) => {
      const failCount = results.filter((r) => r.status === 'rejected').length;
      if (failCount > 0) {
        this.logger.warn(
          `Failed to emit asset criticality trigger for ${failCount} of ${emitPromises.length} entities`
        );
      }
    });
  }

  public emitRiskScoreChanged(targets: RiskScoreWorkflowEmitTarget[]): void {
    if (!this.emit || targets.length === 0) return;
    const emitPromises = targets.flatMap(({ entityId, entityType, doc, previousScore }) => {
      const newScore = get(doc, RISK_SCORE_CHANGED_WATCHED_FIELDS[0]);
      if (newScore === undefined) return [];
      const signedDelta = previousScore != null ? newScore - previousScore : null;
      if (signedDelta === 0) return [];
      const direction = signedDelta != null ? (signedDelta > 0 ? 'increase' : 'decrease') : null;
      const delta = signedDelta != null ? Math.abs(signedDelta) : null;
      return [
        this.emit?.(ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID, {
          entityId,
          entityType,
          score: newScore,
          previousScore,
          delta,
          direction,
        }),
      ];
    });

    if (emitPromises.length === 0) return;
    Promise.allSettled(emitPromises).then((results) => {
      const failCount = results.filter((r) => r.status === 'rejected').length;
      if (failCount > 0) {
        this.logger.warn(
          `Failed to emit risk score changed trigger for ${failCount} of ${emitPromises.length} entities`
        );
      }
    });
  }

  public emitEvents(targets: WorkflowEmitTarget[], previousDocs: Map<string, Entity>): void {
    if (!this.emit || targets.length === 0) return;
    this.emitAssetCriticalityUpdated(
      targets.filter(({ doc }) =>
        ASSET_CRITICALITY_UPDATED_WATCHED_FIELDS.some((field) => get(doc, field) !== undefined)
      )
    );

    this.emitRiskScoreChanged(
      targets
        .filter(({ doc }) =>
          RISK_SCORE_CHANGED_WATCHED_FIELDS.some((field) => get(doc, field) !== undefined)
        )
        .map((target) => ({
          ...target,
          previousScore:
            (previousDocs.get(target.entityId)?.entity?.risk?.calculated_score_norm as number) ??
            null,
        }))
    );
  }
}
