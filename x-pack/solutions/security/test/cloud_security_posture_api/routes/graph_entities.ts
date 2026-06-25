/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ELASTIC_HTTP_VERSION_HEADER,
  X_ELASTIC_INTERNAL_ORIGIN_REQUEST,
} from '@kbn/core-http-common';
import expect from '@kbn/expect';
import { expect as expectExpect } from 'expect';
import type { Agent } from 'supertest';
import type { EntitiesRequest } from '@kbn/cloud-security-posture-common/types/graph_entities/latest';
import { getEntitiesLatestIndexName } from '@kbn/cloud-security-posture-common/utils/helpers';
import type { FtrProviderContext } from '../ftr_provider_context';
import { result, loadAlertArchive, waitForEntityDataIndexed } from '../utils';
import { CspSecurityCommonProvider } from './helper/user_roles_utilites';

// eslint-disable-next-line import/no-default-export
export default function (providerContext: FtrProviderContext) {
  const { getService } = providerContext;

  const es = getService('es');
  const logger = getService('log');
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const retry = getService('retry');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const cspSecurity = CspSecurityCommonProvider(providerContext);

  const postGraphEntities = (
    agent: Agent,
    body: EntitiesRequest,
    auth?: { user: string; pass: string },
    spaceId?: string
  ) => {
    logger.debug(
      `POST ${spaceId ? `/s/${spaceId}` : ''}/internal/cloud_security_posture/graph/entities`
    );
    let req = agent
      .post(`${spaceId ? `/s/${spaceId}` : ''}/internal/cloud_security_posture/graph/entities`)
      .set(ELASTIC_HTTP_VERSION_HEADER, '1')
      .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
      .set('kbn-xsrf', 'xxxx');

    if (auth) {
      req = req.auth(auth.user, auth.pass);
    }

    return req.send(body);
  };

  describe('POST /internal/cloud_security_posture/graph/entities', () => {
    describe('Authorization', () => {
      it('should return 403 for user without read access', async () => {
        await postGraphEntities(
          supertestWithoutAuth,
          {
            query: {
              entityIds: ['partial-host-instance-1'],
              start: 'now-1d/d',
              end: 'now/d',
            },
            page: { index: 0, size: 10 },
          },
          {
            user: 'role_security_no_read_user',
            pass: cspSecurity.getPasswordForUser('role_security_no_read_user'),
          }
        ).expect(result(403, logger));
      });
    });

    describe('Validation', () => {
      it('should return 400 when missing `entityIds` field', async () => {
        await postGraphEntities(supertest, {
          // @ts-expect-error ignore error for testing
          query: {
            start: 'now-1d/d',
            end: 'now/d',
          },
          page: { index: 0, size: 10 },
        }).expect(result(400, logger));
      });

      it('should return 400 when entityIds is an empty array', async () => {
        await postGraphEntities(supertest, {
          query: {
            entityIds: [],
            start: 'now-1d/d',
            end: 'now/d',
          },
          page: { index: 0, size: 10 },
        }).expect(result(400, logger));
      });

      it('should return 400 when missing `page` field', async () => {
        await postGraphEntities(supertest, {
          query: {
            entityIds: ['partial-host-instance-1'],
            start: 'now-1d/d',
            end: 'now/d',
          },
        } as any).expect(result(400, logger));
      });

      it('should return 400 when page.index is negative', async () => {
        await postGraphEntities(supertest, {
          query: {
            entityIds: ['partial-host-instance-1'],
            start: 'now-1d/d',
            end: 'now/d',
          },
          page: { index: -1, size: 10 },
        }).expect(result(400, logger));
      });

      it('should return 400 when page.size is less than 1', async () => {
        await postGraphEntities(supertest, {
          query: {
            entityIds: ['partial-host-instance-1'],
            start: 'now-1d/d',
            end: 'now/d',
          },
          page: { index: 0, size: 0 },
        }).expect(result(400, logger));
      });

      it('should return 400 when page.size exceeds 100', async () => {
        await postGraphEntities(supertest, {
          query: {
            entityIds: ['partial-host-instance-1'],
            start: 'now-1d/d',
            end: 'now/d',
          },
          page: { index: 0, size: 101 },
        }).expect(result(400, logger));
      });
    });

    describe('Happy flows', () => {
      const defaultSpaceIndex = getEntitiesLatestIndexName('default');

      before(async () => {
        // Load the entity_store_v2 archive (targets 'entities-space' space index)
        await esArchiver.load(
          'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/entity_store_v2'
        );

        // The entity_store_v2 archive creates its index for 'entities-space' space.
        // The entities API uses LOOKUP JOIN, which requires the concrete index name
        // (not an alias). Reindex the data into the default space index.
        const archiveIndex = '.entities.v2.latest.security_entities-space-00001';
        const archiveSettings = await es.indices.getSettings({ index: archiveIndex });
        const archiveMappings = await es.indices.getMapping({ index: archiveIndex });

        await es.indices.create({
          index: defaultSpaceIndex,
          settings: {
            index: {
              mode: archiveSettings[archiveIndex]?.settings?.index?.mode ?? 'lookup',
            },
          },
          mappings: archiveMappings[archiveIndex]?.mappings,
        });

        await es.reindex({
          source: { index: archiveIndex },
          dest: { index: defaultSpaceIndex },
          refresh: true,
        });

        await loadAlertArchive({
          es,
          esArchiver,
          logger,
          archivePath:
            'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/security_alerts_ecs',
        });
        await esArchiver.load(
          'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/logs_gcp_audit'
        );

        await waitForEntityDataIndexed({
          es,
          logger,
          retry,
          entitiesIndex: defaultSpaceIndex,
          expectedCount: 48,
        });
      });

      after(async () => {
        // Delete the default-space entity index we created
        try {
          await es.indices.delete({ index: defaultSpaceIndex });
        } catch (e) {
          // Ignore if already deleted
        }

        await esArchiver.unload(
          'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/entity_store_v2'
        );

        // Using unload destroys index's alias of .alerts-security.alerts-default which causes a failure in other tests
        // Instead we delete all alerts from the index
        await es.deleteByQuery({
          index: '.internal.alerts-*',
          query: { match_all: {} },
          conflicts: 'proceed',
        });

        // Try to unload logs archive - might have been replaced by nested test suites
        try {
          await esArchiver.unload(
            'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/logs_gcp_audit'
          );
        } catch (e) {
          // Ignore if already unloaded or replaced by another archive
          logger.debug(`Could not unload logs_gcp_audit: ${e.message}`);
        }
      });

      it.skip('should return entities for known entity IDs', async () => {
        const response = await postGraphEntities(supertest, {
          query: {
            entityIds: ['partial-host-instance-1', 'admin@example.com'],
            start: '2024-09-01T00:00:00.000Z',
            end: '2024-09-02T00:00:00.000Z',
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
          },
          page: { index: 0, size: 10 },
        }).expect(result(200, logger));

        expect(response.body).to.have.property('entities');
        expect(response.body).to.have.property('totalRecords');
        expect(response.body.totalRecords).to.equal(2);
        expect(response.body.entities).to.have.length(2);
        expectExpect(response.body.entities).toContainEqual(
          expectExpect.objectContaining({
            id: 'partial-host-instance-1',
            availableInEntityStore: true,
            ecsParentField: expectExpect.stringMatching(/host|entity/),
          })
        );
        expectExpect(response.body.entities).toContainEqual(
          expectExpect.objectContaining({
            id: 'admin@example.com',
            ecsParentField: 'user',
          })
        );
        expect(response.body).not.to.have.property('messages');
      });

      it('should return a fallback entity when an entity is not found', async () => {
        const response = await postGraphEntities(supertest, {
          query: {
            entityIds: ['missing-entity-id'],
            start: '2024-09-01T00:00:00.000Z',
            end: '2024-09-02T00:00:00.000Z',
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
          },
          page: { index: 0, size: 10 },
        }).expect(result(200, logger));

        expect(response.body).to.have.property('entities');
        expect(response.body).to.have.property('totalRecords');
        expect(response.body.totalRecords).to.equal(1);
        expect(response.body.entities).to.have.length(1);
        expect(response.body.entities[0]).to.eql({
          id: 'missing-entity-id',
          name: 'missing-entity-id',
          availableInEntityStore: false,
        });
        expect(response.body).not.to.have.property('messages');
      });

      it('should paginate entities correctly (page 1)', async () => {
        const response = await postGraphEntities(supertest, {
          query: {
            entityIds: ['partial-host-instance-1', 'admin@example.com', 'user1@example.com'],
            start: '2024-09-01T00:00:00.000Z',
            end: '2024-09-02T00:00:00.000Z',
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
          },
          page: { index: 0, size: 2 },
        }).expect(result(200, logger));

        expect(response.body).to.have.property('entities');
        expect(response.body).to.have.property('totalRecords');
        expect(response.body.totalRecords).to.equal(3);
        expect(response.body.entities).to.have.length(2);
      });

      it('should paginate entities correctly (page 2)', async () => {
        const response = await postGraphEntities(supertest, {
          query: {
            entityIds: ['partial-host-instance-1', 'admin@example.com', 'user1@example.com'],
            start: '2024-09-01T00:00:00.000Z',
            end: '2024-09-02T00:00:00.000Z',
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
          },
          page: { index: 1, size: 2 },
        }).expect(result(200, logger));

        expect(response.body).to.have.property('entities');
        expect(response.body).to.have.property('totalRecords');
        expect(response.body.totalRecords).to.equal(3);
        expect(response.body.entities).to.have.length(1); // Last page has 1 remaining item
      });
    });
  });
}
