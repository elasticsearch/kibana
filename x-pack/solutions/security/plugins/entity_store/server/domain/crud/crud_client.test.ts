/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock, type MockedLogger } from '@kbn/logging-mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { CRUDClient } from './crud_client';
import { EntityStoreNotInstalledError } from '../errors';
import { hashEuid, getEuidFromObject } from '../../../common/domain/euid';
import {
  ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
  ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
} from '../../../common/workflow/triggers';
import type { Entity } from '../../../common';

// Drains all pending microtasks so fire-and-forget Promise chains complete.
const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('CRUDClient', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let logger: MockedLogger;
  let client: CRUDClient;

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    logger = loggerMock.create();
    client = new CRUDClient({ esClient, logger, namespace: 'default' });
  });

  describe('assertInstalled', () => {
    const entity = { entity: { id: 'test-id' } };

    it('createEntity throws EntityStoreNotInstalledError when index does not exist', async () => {
      esClient.indices.exists.mockResolvedValue(false);

      await expect(client.createEntity('generic', entity)).rejects.toThrow(
        EntityStoreNotInstalledError
      );
    });

    it('updateEntity throws EntityStoreNotInstalledError when index does not exist', async () => {
      esClient.indices.exists.mockResolvedValue(false);

      await expect(client.updateEntity('generic', entity, false)).rejects.toThrow(
        EntityStoreNotInstalledError
      );
    });

    it('bulkUpdateEntity throws EntityStoreNotInstalledError when index does not exist', async () => {
      esClient.indices.exists.mockResolvedValue(false);

      await expect(
        client.bulkUpdateEntity({ objects: [{ type: 'generic', doc: entity }] })
      ).rejects.toThrow(EntityStoreNotInstalledError);
    });
  });

  describe('asset criticality trigger emit', () => {
    let emitWorkflowTriggerEvent: jest.Mock;
    let clientWithEmit: CRUDClient;

    beforeEach(() => {
      esClient.indices.exists.mockResolvedValue(true);
      emitWorkflowTriggerEvent = jest.fn().mockResolvedValue(undefined);
      clientWithEmit = new CRUDClient({
        esClient,
        logger,
        namespace: 'default',
        emitWorkflowTriggerEvent,
      });
    });

    describe('updateEntity', () => {
      beforeEach(() => {
        esClient.update.mockResolvedValue({ result: 'updated' } as any);
        esClient.mget.mockResolvedValue({ docs: [] } as any);
      });

      it('emits trigger with correct payload when asset.criticality is patched', async () => {
        await clientWithEmit.updateEntity(
          'generic',
          { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
          true
        );

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1')] })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledTimes(1);
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
          expect.objectContaining({ entityType: 'generic', criticalityLevel: 'high_impact' })
        );
      });

      it('emits with criticalityLevel: null when criticality is cleared', async () => {
        await clientWithEmit.updateEntity(
          'generic',
          { entity: { id: 'host-1' }, asset: { criticality: null } },
          true
        );

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1')] })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
          expect.objectContaining({ criticalityLevel: null })
        );
      });

      it('does not emit when asset field is absent from the patch', async () => {
        await clientWithEmit.updateEntity('generic', { entity: { id: 'host-1' } }, true);

        expect(esClient.mget).not.toHaveBeenCalled();
        expect(emitWorkflowTriggerEvent).not.toHaveBeenCalled();
      });

      it('does not emit when asset is present but criticality field is absent', async () => {
        await clientWithEmit.updateEntity('generic', { entity: { id: 'host-1' }, asset: {} }, true);

        expect(esClient.mget).not.toHaveBeenCalled();
        expect(emitWorkflowTriggerEvent).not.toHaveBeenCalled();
      });

      it('does not emit when emitWorkflowTriggerEvent is not provided', async () => {
        // client without emit; should not throw
        await expect(
          client.updateEntity(
            'generic',
            { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
            true
          )
        ).resolves.not.toThrow();

        expect(esClient.mget).not.toHaveBeenCalled();
      });
    });

    describe('bulkUpdateEntity', () => {
      beforeEach(() => {
        esClient.mget.mockResolvedValue({ docs: [] } as any);
      });

      it('emits trigger for each successful entity with criticality', async () => {
        esClient.bulk.mockResolvedValue({ errors: false, items: [] } as any);

        await clientWithEmit.bulkUpdateEntity({
          force: true,
          objects: [
            {
              type: 'generic',
              doc: { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
            },
            {
              type: 'generic',
              doc: { entity: { id: 'host-2' }, asset: { criticality: 'low_impact' } },
            },
          ],
        });

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1'), hashEuid('host-2')] })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledTimes(2);
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
          expect.objectContaining({ criticalityLevel: 'high_impact' })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
          expect.objectContaining({ criticalityLevel: 'low_impact' })
        );
      });

      it('does not emit for entities that failed in the bulk operation', async () => {
        const doc = { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } };
        const failedId = hashEuid(getEuidFromObject('generic', doc)!);

        esClient.bulk.mockResolvedValue({
          errors: true,
          items: [
            {
              update: {
                _id: failedId,
                status: 404,
                error: { type: 'document_missing_exception', reason: 'not found' },
              },
            },
          ],
        } as any);

        await clientWithEmit.bulkUpdateEntity({
          force: true,
          objects: [{ type: 'generic', doc: doc as unknown as Entity }],
        });

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1')] })
        );
        expect(emitWorkflowTriggerEvent).not.toHaveBeenCalled();
      });

      it('emits only for successful entities when the bulk response has mixed results', async () => {
        const failDoc = { entity: { id: 'host-fail' }, asset: { criticality: 'high_impact' } };
        const successDoc = { entity: { id: 'host-ok' }, asset: { criticality: 'low_impact' } };
        const failedId = hashEuid(getEuidFromObject('generic', failDoc)!);

        esClient.bulk.mockResolvedValue({
          errors: true,
          items: [
            {
              update: {
                _id: failedId,
                status: 404,
                error: { type: 'document_missing_exception', reason: 'not found' },
              },
            },
            { update: { _id: hashEuid(getEuidFromObject('generic', successDoc)!), status: 200 } },
          ],
        } as any);

        await clientWithEmit.bulkUpdateEntity({
          force: true,
          objects: [
            { type: 'generic', doc: failDoc as unknown as Entity },
            { type: 'generic', doc: successDoc as unknown as Entity },
          ],
        });

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-fail'), hashEuid('host-ok')] })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledTimes(1);
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
          expect.objectContaining({ criticalityLevel: 'low_impact' })
        );
      });

      it('does not emit for entities without criticality in the patch', async () => {
        esClient.bulk.mockResolvedValue({ errors: false, items: [] } as any);

        await clientWithEmit.bulkUpdateEntity({
          force: true,
          objects: [
            { type: 'generic', doc: { entity: { id: 'host-1' } } },
            { type: 'generic', doc: { entity: { id: 'host-2' }, asset: {} } },
          ],
        });

        expect(esClient.mget).not.toHaveBeenCalled();
        expect(emitWorkflowTriggerEvent).not.toHaveBeenCalled();
      });

      it('logs a single warning when emit fails for multiple entities', async () => {
        esClient.bulk.mockResolvedValue({ errors: false, items: [] } as any);
        emitWorkflowTriggerEvent.mockRejectedValue(new Error('emit failed'));

        await clientWithEmit.bulkUpdateEntity({
          force: true,
          objects: [
            {
              type: 'generic',
              doc: { entity: { id: 'host-1' }, asset: { criticality: 'high_impact' } },
            },
            {
              type: 'generic',
              doc: { entity: { id: 'host-2' }, asset: { criticality: 'low_impact' } },
            },
          ],
        });

        await flushPromises();

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1'), hashEuid('host-2')] })
        );
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('2 of 2'));
      });
    });
  });

  describe('risk score trigger emit', () => {
    let emitWorkflowTriggerEvent: jest.Mock;
    let clientWithEmit: CRUDClient;

    beforeEach(() => {
      esClient.indices.exists.mockResolvedValue(true);
      emitWorkflowTriggerEvent = jest.fn().mockResolvedValue(undefined);
      clientWithEmit = new CRUDClient({
        esClient,
        logger,
        namespace: 'default',
        emitWorkflowTriggerEvent,
      });
    });

    describe('updateEntity', () => {
      beforeEach(() => {
        esClient.update.mockResolvedValue({ result: 'updated' } as any);
        esClient.mget.mockResolvedValue({ docs: [] } as any);
      });

      it('emits trigger when entity.risk.calculated_score_norm is present', async () => {
        await clientWithEmit.updateEntity(
          'generic',
          { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          true
        );

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1')] })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
          expect.objectContaining({
            entityType: 'generic',
            score: 75,
            previousScore: null,
            delta: null,
            direction: null,
          })
        );
      });

      it('emits with delta and direction when previous doc is found via mget', async () => {
        esClient.mget.mockResolvedValue({
          docs: [{ found: true, _source: { entity: { risk: { calculated_score_norm: 50 } } } }],
        } as any);

        await clientWithEmit.updateEntity(
          'generic',
          { entity: { id: 'host-1', risk: { calculated_score_norm: 75 } } },
          true
        );

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1')] })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
          expect.objectContaining({ previousScore: 50, delta: 25, direction: 'increase' })
        );
      });

      it('emits with decrease direction when new score is lower than previous', async () => {
        esClient.mget.mockResolvedValue({
          docs: [{ found: true, _source: { entity: { risk: { calculated_score_norm: 80 } } } }],
        } as any);

        await clientWithEmit.updateEntity(
          'generic',
          { entity: { id: 'host-1', risk: { calculated_score_norm: 60 } } },
          true
        );

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1')] })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
          expect.objectContaining({ delta: 20, direction: 'decrease' })
        );
      });

      it('does not emit when risk score field is absent from the patch', async () => {
        await clientWithEmit.updateEntity('generic', { entity: { id: 'host-1' } }, true);

        expect(esClient.mget).not.toHaveBeenCalled();
        expect(emitWorkflowTriggerEvent).not.toHaveBeenCalled();
      });
    });

    describe('bulkUpdateEntity', () => {
      beforeEach(() => {
        esClient.bulk.mockResolvedValue({ errors: false, items: [] } as any);
        esClient.mget.mockResolvedValue({ docs: [] } as any);
      });

      it('emits trigger for each successful entity with a risk score', async () => {
        await clientWithEmit.bulkUpdateEntity({
          force: true,
          objects: [
            {
              type: 'generic',
              doc: { entity: { id: 'host-1', risk: { calculated_score_norm: 70 } } },
            },
            {
              type: 'generic',
              doc: { entity: { id: 'host-2', risk: { calculated_score_norm: 30 } } },
            },
          ],
        });

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1'), hashEuid('host-2')] })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledTimes(2);
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
          expect.objectContaining({ score: 70 })
        );
        expect(emitWorkflowTriggerEvent).toHaveBeenCalledWith(
          ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
          expect.objectContaining({ score: 30 })
        );
      });

      it('does not emit for entities that failed in the bulk operation', async () => {
        const doc = { entity: { id: 'host-1', risk: { calculated_score_norm: 70 } } };
        const failedId = hashEuid(getEuidFromObject('generic', doc)!);

        esClient.bulk.mockResolvedValue({
          errors: true,
          items: [
            {
              update: {
                _id: failedId,
                status: 404,
                error: { type: 'document_missing_exception', reason: 'not found' },
              },
            },
          ],
        } as any);

        await clientWithEmit.bulkUpdateEntity({
          force: true,
          objects: [{ type: 'generic', doc: doc as unknown as Entity }],
        });

        expect(esClient.mget).toHaveBeenCalledTimes(1);
        expect(esClient.mget).toHaveBeenCalledWith(
          expect.objectContaining({ ids: [hashEuid('host-1')] })
        );
        expect(emitWorkflowTriggerEvent).not.toHaveBeenCalled();
      });
    });
  });
});
