/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock, type MockedLogger } from '@kbn/logging-mocks';
import { WorkflowEventPublisher, ALL_WORKFLOW_WATCHED_FIELDS } from './workflow_event_publisher';
import {
  ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
  ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
} from '../../../common/workflow/triggers';
import type { Entity } from '../../../common';

// Drains all pending microtasks so fire-and-forget Promise chains complete.
const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('WorkflowEventPublisher', () => {
  let emit: jest.Mock;
  let fetchDocsFn: jest.Mock;
  let logger: MockedLogger;
  let publisher: WorkflowEventPublisher;

  beforeEach(() => {
    emit = jest.fn().mockResolvedValue(undefined);
    fetchDocsFn = jest.fn().mockResolvedValue(new Map());
    logger = loggerMock.create();
    publisher = new WorkflowEventPublisher({ emit, fetchDocsFn, logger });
  });

  describe('maybeGetExistingDocs', () => {
    it('returns empty Map without calling fetchDocsFn when emit is not configured', async () => {
      const publisherNoEmit = new WorkflowEventPublisher({ fetchDocsFn, logger });
      const result = await publisherNoEmit.maybeGetExistingDocs([
        { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
      ]);

      expect(result).toEqual(new Map());
      expect(fetchDocsFn).not.toHaveBeenCalled();
    });

    it('returns empty Map without calling fetchDocsFn when docs array is empty', async () => {
      const result = await publisher.maybeGetExistingDocs([]);

      expect(result).toEqual(new Map());
      expect(fetchDocsFn).not.toHaveBeenCalled();
    });

    it('returns empty Map without calling fetchDocsFn when no doc has a watched field', async () => {
      const result = await publisher.maybeGetExistingDocs([
        { entity: { id: 'host-1' } },
        { entity: { id: 'host-2' }, asset: {} },
      ]);

      expect(result).toEqual(new Map());
      expect(fetchDocsFn).not.toHaveBeenCalled();
    });

    it('calls fetchDocsFn with ALL_WORKFLOW_WATCHED_FIELDS when asset.criticality is present', async () => {
      await publisher.maybeGetExistingDocs([
        { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
      ]);

      expect(fetchDocsFn).toHaveBeenCalledTimes(1);
      expect(fetchDocsFn).toHaveBeenCalledWith(['host-1'], ALL_WORKFLOW_WATCHED_FIELDS);
    });

    it('calls fetchDocsFn when entity.risk.calculated_score_norm is present', async () => {
      await publisher.maybeGetExistingDocs([
        { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
      ]);

      expect(fetchDocsFn).toHaveBeenCalledWith(['host-1'], ALL_WORKFLOW_WATCHED_FIELDS);
    });

    it('passes all entity IDs to fetchDocsFn for multiple docs', async () => {
      await publisher.maybeGetExistingDocs([
        { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
        { entity: { id: 'host-2' }, asset: { criticality: 'low_impact' } },
      ]);

      expect(fetchDocsFn).toHaveBeenCalledWith(['host-1', 'host-2'], ALL_WORKFLOW_WATCHED_FIELDS);
    });

    it('returns the Map returned by fetchDocsFn', async () => {
      const previousDoc = { entity: { risk: { calculated_score_norm: 50 } } } as Entity;
      fetchDocsFn.mockResolvedValue(new Map([['host-1', previousDoc]]));

      const result = await publisher.maybeGetExistingDocs([
        { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
      ]);

      expect(result.get('host-1')).toBe(previousDoc);
    });

    it('excludes docs without entity.id from the fetchDocsFn call', async () => {
      await publisher.maybeGetExistingDocs([
        { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
        { asset: { criticality: 'low_impact' } } as Entity,
      ]);

      expect(fetchDocsFn).toHaveBeenCalledWith(['host-1'], ALL_WORKFLOW_WATCHED_FIELDS);
    });
  });

  describe('emitAssetCriticalityUpdated', () => {
    it('does nothing when emit is not configured', async () => {
      const publisherNoEmit = new WorkflowEventPublisher({ fetchDocsFn, logger });
      publisherNoEmit.emitAssetCriticalityUpdated([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
        },
      ]);

      await flushPromises();
      expect(emit).not.toHaveBeenCalled();
    });

    it('does nothing when targets array is empty', async () => {
      publisher.emitAssetCriticalityUpdated([]);

      await flushPromises();
      expect(emit).not.toHaveBeenCalled();
    });

    it('does nothing when no target has asset.criticality', async () => {
      publisher.emitAssetCriticalityUpdated([
        { entityId: 'host-1', entityType: 'generic', doc: { entity: { id: 'host-1' } } },
        {
          entityId: 'host-2',
          entityType: 'generic',
          doc: { entity: { id: 'host-2' }, asset: {} },
        },
      ]);

      await flushPromises();
      expect(emit).not.toHaveBeenCalled();
    });

    it('emits with correct payload when asset.criticality is set', async () => {
      publisher.emitAssetCriticalityUpdated([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
        },
      ]);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID, {
        entityId: 'host-1',
        entityType: 'generic',
        criticalityLevel: 'high_impact',
      });
    });

    it('emits with criticalityLevel: null when criticality is null', async () => {
      publisher.emitAssetCriticalityUpdated([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1' }, asset: { criticality: null } },
        },
      ]);

      expect(emit).toHaveBeenCalledWith(ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID, {
        entityId: 'host-1',
        entityType: 'generic',
        criticalityLevel: null,
      });
    });

    it('emits once per target that has a criticality field', async () => {
      publisher.emitAssetCriticalityUpdated([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
        },
        {
          entityId: 'host-2',
          entityType: 'generic',
          doc: { entity: { id: 'host-2' }, asset: { criticality: 'low_impact' } },
        },
      ]);

      expect(emit).toHaveBeenCalledTimes(2);
    });

    it('logs a single warning when emit fails', async () => {
      emit.mockRejectedValue(new Error('emit failed'));
      publisher.emitAssetCriticalityUpdated([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
        },
      ]);

      await flushPromises();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('1 of 1'));
    });

    it('does not log when all emits succeed', async () => {
      publisher.emitAssetCriticalityUpdated([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
        },
      ]);

      await flushPromises();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('emitRiskScoreChanged', () => {
    it('does nothing when emit is not configured', async () => {
      const publisherNoEmit = new WorkflowEventPublisher({ fetchDocsFn, logger });
      publisherNoEmit.emitRiskScoreChanged([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          previousScore: null,
        },
      ]);

      await flushPromises();
      expect(emit).not.toHaveBeenCalled();
    });

    it('does nothing when targets array is empty', async () => {
      publisher.emitRiskScoreChanged([]);

      await flushPromises();
      expect(emit).not.toHaveBeenCalled();
    });

    it('does nothing when no target has the risk score field', async () => {
      publisher.emitRiskScoreChanged([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1' } },
          previousScore: null,
        },
      ]);

      await flushPromises();
      expect(emit).not.toHaveBeenCalled();
    });

    it('emits with correct payload when previousScore is null', async () => {
      publisher.emitRiskScoreChanged([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          previousScore: null,
        },
      ]);

      expect(emit).toHaveBeenCalledWith(ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID, {
        entityId: 'host-1',
        entityType: 'generic',
        score: 75,
        previousScore: null,
        delta: null,
        direction: null,
      });
    });

    it('computes positive delta and increase direction', async () => {
      publisher.emitRiskScoreChanged([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          previousScore: 50,
        },
      ]);

      expect(emit).toHaveBeenCalledWith(
        ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
        expect.objectContaining({ score: 75, previousScore: 50, delta: 25, direction: 'increase' })
      );
    });

    it('computes negative delta and decrease direction', async () => {
      publisher.emitRiskScoreChanged([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 60 } } },
          previousScore: 80,
        },
      ]);

      expect(emit).toHaveBeenCalledWith(
        ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
        expect.objectContaining({ delta: 20, direction: 'decrease' })
      );
    });

    it('uses increase direction when delta is zero', async () => {
      publisher.emitRiskScoreChanged([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 50 } } },
          previousScore: 50,
        },
      ]);

      expect(emit).toHaveBeenCalledWith(
        ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
        expect.objectContaining({ delta: 0, direction: 'increase' })
      );
    });

    it('logs a single warning when emit fails', async () => {
      emit.mockRejectedValue(new Error('emit failed'));
      publisher.emitRiskScoreChanged([
        {
          entityId: 'host-1',
          entityType: 'generic',
          doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          previousScore: null,
        },
      ]);

      await flushPromises();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('1 of 1'));
    });
  });

  describe('emitEvents', () => {
    it('does nothing when emit is not configured', async () => {
      const publisherNoEmit = new WorkflowEventPublisher({ fetchDocsFn, logger });
      publisherNoEmit.emitEvents(
        [
          {
            entityId: 'host-1',
            entityType: 'generic',
            doc: { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
          },
        ],
        new Map()
      );

      await flushPromises();
      expect(emit).not.toHaveBeenCalled();
    });

    it('does nothing when targets array is empty', async () => {
      publisher.emitEvents([], new Map());

      await flushPromises();
      expect(emit).not.toHaveBeenCalled();
    });

    it('emits asset criticality trigger for targets with asset.criticality', async () => {
      publisher.emitEvents(
        [
          {
            entityId: 'host-1',
            entityType: 'generic',
            doc: { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
          },
        ],
        new Map()
      );

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(
        ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
        expect.objectContaining({ criticalityLevel: 'high_impact' })
      );
    });

    it('emits risk score trigger for targets with entity.risk.calculated_score_norm', async () => {
      publisher.emitEvents(
        [
          {
            entityId: 'host-1',
            entityType: 'generic',
            doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          },
        ],
        new Map()
      );

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(
        ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
        expect.objectContaining({ score: 75, previousScore: null })
      );
    });

    it('looks up previous score from previousDocs by entityId', async () => {
      const previousDoc = { entity: { risk: { calculated_score_norm: 50 } } } as Entity;
      publisher.emitEvents(
        [
          {
            entityId: 'host-1',
            entityType: 'generic',
            doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          },
        ],
        new Map([['host-1', previousDoc]])
      );

      expect(emit).toHaveBeenCalledWith(
        ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
        expect.objectContaining({ previousScore: 50, delta: 25, direction: 'increase' })
      );
    });

    it('uses null previousScore for entities not found in previousDocs', async () => {
      publisher.emitEvents(
        [
          {
            entityId: 'host-1',
            entityType: 'generic',
            doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          },
        ],
        new Map([['host-2', { entity: { risk: { calculated_score_norm: 50 } } } as Entity]])
      );

      expect(emit).toHaveBeenCalledWith(
        ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
        expect.objectContaining({ previousScore: null, delta: null })
      );
    });

    it('emits both triggers for a target with both watched fields', async () => {
      publisher.emitEvents(
        [
          {
            entityId: 'host-1',
            entityType: 'generic',
            doc: {
              entity: { id: 'host-1', risk: { calculated_score_norm: 75 } },
              asset: { criticality: 'high_impact' },
            },
          },
        ],
        new Map()
      );

      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenCalledWith(
        ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
        expect.any(Object)
      );
      expect(emit).toHaveBeenCalledWith(ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID, expect.any(Object));
    });

    it('only emits risk score trigger when asset.criticality is absent', async () => {
      publisher.emitEvents(
        [
          {
            entityId: 'host-1',
            entityType: 'generic',
            doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          },
        ],
        new Map()
      );

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).not.toHaveBeenCalledWith(
        ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
        expect.any(Object)
      );
    });
  });
});
