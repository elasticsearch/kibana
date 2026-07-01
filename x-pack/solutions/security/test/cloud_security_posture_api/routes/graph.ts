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
import { ApiMessageCode } from '@kbn/cloud-security-posture-common/types/graph/latest';
import type {
  GraphRequest,
  NodeDataModel,
  EntityNodeDataModel,
  LabelNodeDataModel,
  EdgeDataModel,
  RelationshipNodeDataModel,
} from '@kbn/cloud-security-posture-common/types/graph/latest';
import { isEntityNode, isLabelNode } from '@kbn/cloud-security-posture-graph/src/components/utils';
import { getEntitiesLatestIndexName } from '@kbn/cloud-security-posture-common/utils/helpers';
import type { FtrProviderContext } from '../ftr_provider_context';
import {
  result,
  loadAlertArchive,
  dataViewRouteHelpersFactory,
  installCloudAssetInventoryPackage,
  initEntityEnginesWithRetry,
  waitForEntityDataIndexed,
} from '../utils';
import { CspSecurityCommonProvider } from './helper/user_roles_utilites';

// eslint-disable-next-line import/no-default-export
export default function (providerContext: FtrProviderContext) {
  const { getService } = providerContext;

  const es = getService('es');
  const logger = getService('log');
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const spacesService = getService('spaces');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const cspSecurity = CspSecurityCommonProvider(providerContext);
  const kibanaServer = getService('kibanaServer');
  const retry = getService('retry');

  const postGraph = (
    agent: Agent,
    body: GraphRequest,
    auth?: { user: string; pass: string },
    spaceId?: string
  ) => {
    logger.debug(`POST ${spaceId ? `/s/${spaceId}` : ''}/internal/cloud_security_posture/graph`);
    let req = agent
      .post(`${spaceId ? `/s/${spaceId}` : ''}/internal/cloud_security_posture/graph`)
      .set(ELASTIC_HTTP_VERSION_HEADER, '1')
      .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
      .set('kbn-xsrf', 'xxxx');

    if (auth) {
      req = req.auth(auth.user, auth.pass);
    }

    return req.send(body);
  };

  describe('POST /internal/cloud_security_posture/graph', () => {
    describe('Authorization', () => {
      it('should return 403 for user without read access', async () => {
        await postGraph(
          supertestWithoutAuth,
          {
            query: {
              originEventIds: [],
              start: 'now-1d/d',
              end: 'now/d',
            },
          },
          {
            user: 'role_security_no_read_user',
            pass: cspSecurity.getPasswordForUser('role_security_no_read_user'),
          }
        ).expect(result(403, logger));
      });
    });

    describe('Validation', () => {
      it('should return 200 with empty results when neither `originEventIds` nor `entityIds` is provided', async () => {
        const resp = await postGraph(supertest, {
          query: {
            start: 'now-1d/d',
            end: 'now/d',
          },
        });
        expect(resp.status).to.be(200);
        expect(resp.body.nodes).to.have.length(0);
        expect(resp.body.edges).to.have.length(0);
      });

      it('should return 200 with empty results when both `originEventIds` and `entityIds` are empty arrays', async () => {
        const resp = await postGraph(supertest, {
          query: {
            originEventIds: [],
            entityIds: [],
            start: 'now-1d/d',
            end: 'now/d',
          },
        });
        expect(resp.status).to.be(200);
        expect(resp.body.nodes).to.have.length(0);
        expect(resp.body.edges).to.have.length(0);
      });

      it('should return 400 when missing `esQuery` field is not of type bool', async () => {
        await postGraph(supertest, {
          query: {
            originEventIds: [],
            start: 'now-1d/d',
            end: 'now/d',
            esQuery: {
              // @ts-expect-error ignore error for testing
              match_all: {},
            },
          },
        }).expect(result(400, logger));
      });

      it('should return 400 with unsupported `esQuery`', async () => {
        await postGraph(supertest, {
          query: {
            originEventIds: [],
            start: 'now-1d/d',
            end: 'now/d',
            esQuery: {
              bool: {
                filter: [
                  {
                    unsupported: 'unsupported',
                  },
                ],
              },
            },
          },
        }).expect(result(400, logger));
      });

      it('should return 400 when index patterns is an empty array', async () => {
        await postGraph(supertest, {
          query: {
            originEventIds: [],
            start: 'now-1d/d',
            end: 'now/d',
            indexPatterns: [],
          },
        }).expect(result(400, logger));
      });

      it('should return 400 when index patterns has empty string value', async () => {
        await postGraph(supertest, {
          query: {
            originEventIds: [],
            start: 'now-1d/d',
            end: 'now/d',
            indexPatterns: ['logs-*', ''],
          },
        }).expect(result(400, logger));
      });

      it('should return 400 when index patterns has illegal character (space, |)', async () => {
        await postGraph(supertest, {
          query: {
            originEventIds: [],
            start: 'now-1d/d',
            end: 'now/d',
            indexPatterns: ['logs-*', '.alerts-security-*| FROM *'],
          },
        }).expect(result(400, logger));
      });

      it('should return 500 when space id is invalid', async () => {
        await postGraph(
          supertest,
          {
            query: {
              originEventIds: [],
              start: 'now-1d/d',
              end: 'now/d',
            },
          },
          undefined,
          encodeURIComponent('foo | FROM *').replace('*', '%2A')
        ).expect(result(500, logger));
      });

      it('should return 400 when index pattern contains illegal characters', async () => {
        await postGraph(supertest, {
          query: {
            indexPatterns: ['foo | FROM *'],
            originEventIds: [],
            start: 'now-1d/d',
            end: 'now/d',
          },
        }).expect(result(400, logger));
      });

      it('should return 400 when pinnedIds exceeds max size', async () => {
        const pinnedIds = Array.from({ length: 1025 }, (_, idx) => `id-${idx}`);

        await postGraph(supertest, {
          query: {
            pinnedIds,
            originEventIds: [],
            start: 'now-1d/d',
            end: 'now/d',
          },
        }).expect(result(400, logger));
      });
    });

    describe('Happy flows', () => {
      before(async () => {
        // security_alerts_ecs - contains ECS mappings for actor and target
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

        try {
          await spacesService.delete('foo');
        } catch (e) {
          // Ignore if the space does not exist yet.
        }

        await spacesService.create({
          id: 'foo',
          name: 'foo',
          disabledFeatures: [],
        });
      });

      after(async () => {
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

        await spacesService.delete('foo');
      });

      it('should return an empty graph / should return 200 when missing `esQuery` field', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [],
            start: 'now-1d/d',
            end: 'now/d',
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(0);
        expect(response.body).to.have.property('edges').length(0);
        expect(response.body).not.to.have.property('messages');
      });

      describe('Pinning', () => {
        const groupAction = 'test.pin.group';
        const soloAction = 'test.pin.solo';
        const groupEventIds = [
          'group-evt-1',
          'group-evt-2',
          'group-evt-3',
          'group-evt-4',
          'group-evt-5',
          'group-evt-6',
        ];
        const soloEventId = 'solo-evt-1';
        const pinTestOriginEventIds = [...groupEventIds, soloEventId].map((id) => ({
          id,
          isAlert: false,
        }));
        const groupedActorIds = [
          'user:group-actor-1@example.com@gcp',
          'user:group-actor-2@example.com@gcp',
          'user:group-actor-3@example.com@gcp',
          'user:group-actor-4@example.com@gcp',
          'user:group-actor-5@example.com@gcp',
          'user:group-actor-6@example.com@gcp',
        ];
        const groupedTargetIds = [
          'group-target-1',
          'group-target-2',
          'group-target-3',
          'group-target-4',
          'group-target-5',
        ];
        const soloActorId = 'user:solo-actor@example.com@gcp';
        const soloTargetId = 'solo-target';
        const groupActionQuery = {
          bool: {
            must: [],
            filter: [
              {
                bool: {
                  should: [
                    {
                      bool: {
                        must: [],
                        filter: [
                          {
                            match_phrase: {
                              'event.action': groupAction,
                            },
                          },
                        ],
                        should: [],
                        must_not: [],
                      },
                    },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
            should: [],
            must_not: [],
          },
        };
        const groupAndSoloQuery = {
          bool: {
            must: [],
            filter: [
              {
                bool: {
                  should: [
                    {
                      bool: {
                        must: [],
                        filter: [
                          {
                            match_phrase: {
                              'event.action': groupAction,
                            },
                          },
                        ],
                        should: [],
                        must_not: [],
                      },
                    },
                    {
                      bool: {
                        must: [],
                        filter: [
                          {
                            match_phrase: {
                              'event.action': soloAction,
                            },
                          },
                        ],
                        should: [],
                        must_not: [],
                      },
                    },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
            should: [],
            must_not: [],
          },
        };

        it('should keep grouped and single entities without pinning', async () => {
          // Render: actor group of 6 + solo actor; target group of 5 + solo target.
          const response = await postGraph(supertest, {
            query: {
              indexPatterns: ['logs-*'],
              originEventIds: pinTestOriginEventIds,
              start: '2024-09-01T00:00:00Z',
              end: '2024-09-02T00:00:00Z',
            },
          }).expect(result(200));

          const entityNodes = response.body.nodes.filter(isEntityNode) as EntityNodeDataModel[];
          const isActorNode = (node: EntityNodeDataModel) =>
            node.documentsData?.some((doc) => doc.id.startsWith('user:'));
          const actorNodes = entityNodes.filter(isActorNode);
          const targetNodes = entityNodes.filter((node) => !isActorNode(node));

          expect(actorNodes).to.have.length(2);
          expect(targetNodes).to.have.length(2);

          const actorGroupNode = actorNodes.find(
            (node) => (node.documentsData?.length ?? 0) === groupedActorIds.length
          )!;
          const actorGroupIds = (actorGroupNode.documentsData ?? []).map((doc) => doc.id).sort();
          expect(actorGroupIds).to.eql([...groupedActorIds].sort());

          const soloActorNode = actorNodes.find((node) => (node.documentsData?.length ?? 0) === 1)!;
          const soloActorIds = (soloActorNode.documentsData ?? []).map((doc) => doc.id);
          expect(soloActorIds).to.eql([soloActorId]);

          const targetGroupNode = targetNodes.find(
            (node) => (node.documentsData?.length ?? 0) === groupedTargetIds.length
          )!;
          const targetGroupIds = (targetGroupNode.documentsData ?? []).map((doc) => doc.id).sort();
          expect(targetGroupIds).to.eql([...groupedTargetIds].sort());

          const soloTargetNode = targetNodes.find(
            (node) => (node.documentsData?.length ?? 0) === 1
          )!;
          const soloTargetIds = (soloTargetNode.documentsData ?? []).map((doc) => doc.id);
          expect(soloTargetIds).to.eql([soloTargetId]);
        });

        it('should treat empty pinnedIds the same as missing pinnedIds', async () => {
          const baseResponse = await postGraph(supertest, {
            query: {
              indexPatterns: ['logs-*'],
              originEventIds: pinTestOriginEventIds,
              start: '2024-09-01T00:00:00Z',
              end: '2024-09-02T00:00:00Z',
            },
          }).expect(result(200));

          const emptyPinnedResponse = await postGraph(supertest, {
            query: {
              pinnedIds: [],
              indexPatterns: ['logs-*'],
              originEventIds: pinTestOriginEventIds,
              start: '2024-09-01T00:00:00Z',
              end: '2024-09-02T00:00:00Z',
            },
          }).expect(result(200));

          const normalizeNodes = (nodes: NodeDataModel[]) =>
            [...nodes].sort((a, b) => a.id.localeCompare(b.id));
          const normalizeEdges = (edges: EdgeDataModel[]) =>
            [...edges].sort((a, b) => a.id.localeCompare(b.id));

          expect(normalizeNodes(emptyPinnedResponse.body.nodes)).to.eql(
            normalizeNodes(baseResponse.body.nodes)
          );
          expect(normalizeEdges(emptyPinnedResponse.body.edges)).to.eql(
            normalizeEdges(baseResponse.body.edges)
          );
          expect(emptyPinnedResponse.body.messages).to.eql(baseResponse.body.messages);
        });

        it('should extract pinned actors and targets from grouped nodes', async () => {
          // Render: 3 single actors + 1 actor group; 3 single targets + 1 target group.
          const response = await postGraph(supertest, {
            query: {
              pinnedIds: [
                'user:group-actor-1@example.com@gcp',
                'user:group-actor-2@example.com@gcp',
                'group-target-3',
              ],
              indexPatterns: ['logs-*'],
              originEventIds: [],
              start: '2024-09-01T00:00:00Z',
              end: '2024-09-02T00:00:00Z',
              esQuery: groupActionQuery,
            },
          }).expect(result(200));

          const entityNodes = response.body.nodes.filter(isEntityNode) as EntityNodeDataModel[];
          const isActorNode = (node: EntityNodeDataModel) =>
            node.documentsData?.some((doc) => doc.id.startsWith('user:'));
          const actorNodes = entityNodes.filter(isActorNode);
          const targetNodes = entityNodes.filter((node) => !isActorNode(node));

          expect(actorNodes).to.have.length(4);
          expect(targetNodes).to.have.length(4);

          const actorGroupNode = actorNodes.find(
            (node) => (node.documentsData?.length ?? 0) === 3
          )!;
          const actorGroupIds = (actorGroupNode.documentsData ?? []).map((doc) => doc.id).sort();
          expect(actorGroupIds).to.eql(
            [
              'user:group-actor-4@example.com@gcp',
              'user:group-actor-5@example.com@gcp',
              'user:group-actor-6@example.com@gcp',
            ].sort()
          );

          const targetGroupNode = targetNodes.find(
            (node) => (node.documentsData?.length ?? 0) === 2
          )!;
          const targetGroupIds = (targetGroupNode.documentsData ?? []).map((doc) => doc.id).sort();
          expect(targetGroupIds).to.eql(['group-target-4', 'group-target-5']);

          const actorSingleIds = actorNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => node.documentsData?.[0]?.id)
            .sort();
          const targetSingleIds = targetNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => node.documentsData?.[0]?.id)
            .sort();

          expect(actorSingleIds).to.eql(
            [
              'user:group-actor-1@example.com@gcp',
              'user:group-actor-2@example.com@gcp',
              'user:group-actor-3@example.com@gcp',
            ].sort()
          );
          expect(targetSingleIds).to.eql(
            ['group-target-1', 'group-target-2', 'group-target-3'].sort()
          );

          const actorGroupIndex = response.body.nodes.indexOf(actorGroupNode);
          const targetGroupIndex = response.body.nodes.indexOf(targetGroupNode);
          const actorSingleIndexes = actorNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => response.body.nodes.indexOf(node));
          const targetSingleIndexes = targetNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => response.body.nodes.indexOf(node));

          // Verify pinned singles are returned before their remaining group node.
          expect(Math.max(...actorSingleIndexes)).to.be.lessThan(actorGroupIndex);
          expect(Math.max(...targetSingleIndexes)).to.be.lessThan(targetGroupIndex);
        });

        it('should not change already single entities when pinned alongside grouped ones', async () => {
          // Render: solo actor + pinned actor + grouped actors (5); solo target + pinned target + grouped targets (4).
          const response = await postGraph(supertest, {
            query: {
              pinnedIds: ['user:solo-actor@example.com@gcp', 'user:group-actor-1@example.com@gcp'],
              indexPatterns: ['logs-*'],
              originEventIds: [],
              start: '2024-09-01T00:00:00Z',
              end: '2024-09-02T00:00:00Z',
              esQuery: groupAndSoloQuery,
            },
          }).expect(result(200));

          const entityNodes = response.body.nodes.filter(isEntityNode) as EntityNodeDataModel[];
          const isActorNode = (node: EntityNodeDataModel) =>
            node.documentsData?.some((doc) => doc.id.startsWith('user:'));
          const actorNodes = entityNodes.filter(isActorNode);
          const targetNodes = entityNodes.filter((node) => !isActorNode(node));

          expect(actorNodes).to.have.length(3);
          expect(targetNodes).to.have.length(3);

          const actorGroupNode = actorNodes.find(
            (node) => (node.documentsData?.length ?? 0) === 5
          )!;
          const actorGroupIds = (actorGroupNode.documentsData ?? []).map((doc) => doc.id).sort();
          expect(actorGroupIds).to.eql(
            [
              'user:group-actor-2@example.com@gcp',
              'user:group-actor-3@example.com@gcp',
              'user:group-actor-4@example.com@gcp',
              'user:group-actor-5@example.com@gcp',
              'user:group-actor-6@example.com@gcp',
            ].sort()
          );

          const targetGroupNode = targetNodes.find(
            (node) => (node.documentsData?.length ?? 0) === 4
          )!;
          const targetGroupIds = (targetGroupNode.documentsData ?? []).map((doc) => doc.id).sort();
          expect(targetGroupIds).to.eql(
            ['group-target-2', 'group-target-3', 'group-target-4', 'group-target-5'].sort()
          );

          const actorSingleIds = actorNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => node.documentsData?.[0]?.id)
            .sort();
          const targetSingleIds = targetNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => node.documentsData?.[0]?.id)
            .sort();

          expect(actorSingleIds).to.eql([soloActorId, 'user:group-actor-1@example.com@gcp'].sort());
          expect(targetSingleIds).to.eql([soloTargetId, 'group-target-1'].sort());
        });

        it('should pin an event by document id and pin related entities', async () => {
          // Render: event is pinned by doc id, so its actor/target become single nodes; remaining entities stay grouped.
          const response = await postGraph(supertest, {
            query: {
              pinnedIds: ['group-doc-1'],
              indexPatterns: ['logs-*'],
              originEventIds: [],
              start: '2024-09-01T00:00:00Z',
              end: '2024-09-02T00:00:00Z',
              esQuery: groupActionQuery,
            },
          }).expect(result(200));

          const entityNodes = response.body.nodes.filter(isEntityNode) as EntityNodeDataModel[];
          const isActorNode = (node: EntityNodeDataModel) =>
            node.documentsData?.some((doc) => doc.id.startsWith('user:'));
          const actorNodes = entityNodes.filter(isActorNode);
          const targetNodes = entityNodes.filter((node) => !isActorNode(node));

          expect(actorNodes).to.have.length(2);
          expect(targetNodes).to.have.length(2);

          const actorSingleIds = actorNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => node.documentsData?.[0]?.id)
            .sort();
          const targetSingleIds = targetNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => node.documentsData?.[0]?.id)
            .sort();

          expect(actorSingleIds).to.eql(['user:group-actor-1@example.com@gcp']);
          expect(targetSingleIds).to.eql(['group-target-1']);

          const actorGroupNode = actorNodes.find(
            (node) => (node.documentsData?.length ?? 0) === groupedActorIds.length - 1
          )!;
          const targetGroupNode = targetNodes.find(
            (node) => (node.documentsData?.length ?? 0) === groupedTargetIds.length - 1
          )!;
          const actorGroupIndex = response.body.nodes.indexOf(actorGroupNode);
          const targetGroupIndex = response.body.nodes.indexOf(targetGroupNode);
          const actorSingleIndexes = actorNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => response.body.nodes.indexOf(node));
          const targetSingleIndexes = targetNodes
            .filter((node) => (node.documentsData?.length ?? 0) === 1)
            .map((node) => response.body.nodes.indexOf(node));

          // Verify pinned singles are returned before their remaining group node.
          expect(Math.max(...actorSingleIndexes)).to.be.lessThan(actorGroupIndex);
          expect(Math.max(...targetSingleIndexes)).to.be.lessThan(targetGroupIndex);
        });

        it('should ignore pinnedIds that do not exist', async () => {
          // Render: actor group of 6 + target group of 5 (no extra singles).
          const response = await postGraph(supertest, {
            query: {
              pinnedIds: ['non-existent-entity-id'],
              indexPatterns: ['logs-*'],
              originEventIds: [],
              start: '2024-09-01T00:00:00Z',
              end: '2024-09-02T00:00:00Z',
              esQuery: groupActionQuery,
            },
          }).expect(result(200));

          const entityNodes = response.body.nodes.filter(isEntityNode) as EntityNodeDataModel[];
          const isActorNode = (node: EntityNodeDataModel) =>
            node.documentsData?.some((doc) => doc.id.startsWith('user:'));
          const actorNodes = entityNodes.filter(isActorNode);
          const targetNodes = entityNodes.filter((node) => !isActorNode(node));

          expect(actorNodes).to.have.length(1);
          expect(targetNodes).to.have.length(1);

          const actorGroupIds = (actorNodes[0].documentsData ?? []).map((doc) => doc.id).sort();
          const targetGroupIds = (targetNodes[0].documentsData ?? []).map((doc) => doc.id).sort();

          expect(actorGroupIds).to.eql([...groupedActorIds].sort());
          expect(targetGroupIds).to.eql([...groupedTargetIds].sort());
        });
      });

      it('should return a graph with nodes and edges by actor', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
            esQuery: {
              bool: {
                filter: [
                  {
                    match_phrase: {
                      'user.id': 'admin@example.com',
                    },
                  },
                ],
                must_not: [
                  {
                    match_phrase: {
                      'event.action': 'google.iam.admin.v1.UpdateRole',
                    },
                  },
                ],
              },
            },
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3);
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).not.to.have.property('messages');

        response.body.nodes.forEach((node: EntityNodeDataModel | LabelNodeDataModel) => {
          expect(node).to.have.property('color');
          expect(node.color).equal(
            'primary',
            `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
          );

          if (isLabelNode(node)) {
            // Check for both document types flexibly
            const hasAlert = node.documentsData!.some((doc) => doc.type === 'alert');
            const hasEvent = node.documentsData!.some((doc) => doc.type === 'event');
            expect(hasAlert).to.be(true);
            expect(hasEvent).to.be(true);
          }

          if (node.id === 'user:admin@example.com@gcp') {
            expect(node).to.not.be(undefined);
            expect(node!.documentsData).to.not.be(undefined);
            expect(node!.documentsData!.length).to.equal(1);

            expectExpect(node!.documentsData).toContainEqual(
              expectExpect.objectContaining({
                id: 'user:admin@example.com@gcp',
                type: 'entity',
                entity: expectExpect.objectContaining({
                  availableInEntityStore: false,
                  sourceFields: expectExpect.objectContaining({
                    'user.id': 'admin@example.com',
                  }),
                }),
              })
            );
          }

          if (node.id === 'projects/your-project-id/roles/customRole') {
            expect(node).to.not.be(undefined);
            expect(node!.documentsData).to.not.be(undefined);
            expect(node!.documentsData!.length).to.equal(1);

            expectExpect(node!.documentsData).toContainEqual(
              expectExpect.objectContaining({
                id: 'projects/your-project-id/roles/customRole',
                type: 'entity',
                entity: expectExpect.objectContaining({
                  availableInEntityStore: false,
                  sourceFields: expectExpect.objectContaining({
                    'entity.id': 'projects/your-project-id/roles/customRole',
                  }),
                }),
              })
            );
          }
        });

        response.body.edges.forEach((edge: EdgeDataModel) => {
          expect(edge).to.have.property('color');
          expect(edge.color).equal(
            'subdued',
            `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
          );
          expect(edge.type).equal('solid');
        });
      });

      it('should return a graph with nodes and edges by alert', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [{ id: 'kabcd1234efgh5678', isAlert: true }],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3);
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).not.to.have.property('messages');

        response.body.nodes.forEach((node: EntityNodeDataModel | LabelNodeDataModel) => {
          expect(node).to.have.property('color');
          expect(node.color).equal(
            isLabelNode(node) &&
              Number(node.uniqueAlertsCount) > 0 &&
              Number(node.uniqueEventsCount) === 0
              ? 'danger'
              : 'primary',
            `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
          );

          if (isLabelNode(node)) {
            expect(node.documentsData).to.have.length(2);
            // Check for both document types flexibly
            const hasAlert = node.documentsData!.some((doc) => doc.type === 'alert');
            const hasEvent = node.documentsData!.some((doc) => doc.type === 'event');
            expect(hasAlert).to.be(true);
            expect(hasEvent).to.be(true);
          }
        });

        response.body.edges.forEach((edge: EdgeDataModel) => {
          expect(edge).to.have.property('color');
          expect(edge.color).equal(
            'subdued',
            `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
          );
          expect(edge.type).equal('solid');
        });
      });

      it('should return a graph with nodes and edges by origin event', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [{ id: 'kabcd1234efgh5678', isAlert: false }],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3);
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).not.to.have.property('messages');

        response.body.nodes.forEach((node: EntityNodeDataModel | LabelNodeDataModel) => {
          expect(node).to.have.property('color');
          expect(node.color).equal(
            'primary',
            `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
          );

          if (node.shape === 'label') {
            expect(node.documentsData).to.have.length(2);
            // Check document types based on actual content
            const hasAlert = node.documentsData!.some((doc) => doc.type === 'alert');
            const hasEvent = node.documentsData!.some((doc) => doc.type === 'event');
            expect(hasAlert).to.be(true);
            expect(hasEvent).to.be(true);
          }
        });
        response.body.edges.forEach((edge: EdgeDataModel) => {
          expect(edge).to.have.property('color');
          expect(edge.color).equal(
            'subdued',
            `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
          );
          expect(edge.type).equal('solid');
        });
      });

      it('color of alert of failed event should be primary', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [{ id: 'failed-event', isAlert: true }],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3);
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).not.to.have.property('messages');

        response.body.nodes.forEach((node: EntityNodeDataModel | LabelNodeDataModel) => {
          expect(node).to.have.property('color');
          expect(node.color).equal(
            'primary',
            `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
          );
          if (node.shape === 'label') {
            expect(node.documentsData).to.have.length(1);
            expect(node.documentsData?.[0]).to.have.property(
              'type',
              node.shape === 'label' ? 'event' : 'entity'
            );
          }
        });

        response.body.edges.forEach((edge: EdgeDataModel) => {
          expect(edge).to.have.property('color');
          expect(edge.color).equal(
            'subdued',
            `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
          );
          expect(edge.type).equal('solid');
        });
      });

      it('color of event of failed event should be primary', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
            esQuery: {
              bool: {
                filter: [
                  {
                    match_phrase: {
                      'user.id': 'admin2@example.com',
                    },
                  },
                ],
              },
            },
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3);
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).not.to.have.property('messages');

        response.body.nodes.forEach((node: EntityNodeDataModel | LabelNodeDataModel) => {
          expect(node).to.have.property('color');
          expect(node.color).equal(
            'primary',
            `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
          );
          if (node.shape === 'label') {
            expect(node.documentsData).to.have.length(1);
            expect(node.documentsData?.[0]).to.have.property(
              'type',
              node.shape === 'label' ? 'event' : 'entity'
            );
          }
        });

        response.body.edges.forEach((edge: EdgeDataModel) => {
          expect(edge).to.have.property('color');
          expect(edge.color).equal(
            'subdued',
            `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
          );
          expect(edge.type).equal('solid');
        });
      });

      it('two label nodes, one single and one grouped', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
            esQuery: {
              bool: {
                filter: [
                  {
                    match_phrase: {
                      'user.id': 'admin@example.com',
                    },
                  },
                ],
              },
            },
          },
        }).expect(result(200));

        // 2 entities + 2 labels + 1 group (labels are stacked since they share same actor-target pair)
        expect(response.body).to.have.property('nodes').length(5);
        // actor→group, group→target, plus 4 internal group edges (group↔label1, group↔label2)
        expect(response.body).to.have.property('edges').length(6);
        expect(response.body).not.to.have.property('messages');

        const groupNodes = response.body.nodes.filter(
          (node: NodeDataModel) => node.shape === 'group'
        );
        expect(groupNodes).to.have.length(1);

        // Find the group node
        const groupNode = response.body.nodes.find((node: NodeDataModel) => node.shape === 'group');
        expect(groupNode).to.be.ok();

        // Find label nodes and verify they have parentId pointing to group
        const labelNodes = response.body.nodes.filter(
          (node: NodeDataModel) => node.shape === 'label'
        );
        expect(labelNodes).to.have.length(2);
        labelNodes.forEach((labelNode: LabelNodeDataModel) => {
          expect(labelNode).to.have.property('parentId');
          expect(labelNode.parentId).to.equal(groupNode.id);
        });

        response.body.nodes.forEach((node: NodeDataModel) => {
          if (node.shape !== 'group' && node.shape !== 'relationship') {
            expect(node).to.have.property('color');
            expect(node.color).equal(
              'primary',
              `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
            );

            if (node.shape === 'label') {
              // Handle flexible document patterns
              if (node.documentsData && node.documentsData.length === 1) {
                // Single document - check its actual type
                expect(node.documentsData[0]).to.have.property('type');
                // Accept either event or alert as valid
              } else if (node.documentsData && node.documentsData.length === 2) {
                // Two documents - check for both types
                const hasAlert = node.documentsData.some((doc) => doc.type === 'alert');
                const hasEvent = node.documentsData.some((doc) => doc.type === 'event');
                expect(hasAlert).to.be(true);
                expect(hasEvent).to.be(true);
              }
            }
          }
        });
        response.body.edges.forEach((edge: EdgeDataModel) => {
          expect(edge).to.have.property('color');
          expect(edge.color).equal(
            'subdued',
            `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
          );
          expect(edge.type).equal('solid');
        });
      });

      it('handles multi-value actor and target entity IDs with MV_EXPAND - single field', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [{ id: 'multivalue-event-1', isAlert: false }],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
          },
        }).expect(result(200));

        // After MV_EXPAND, the Cartesian product of 2 actors × 3 targets = 6 records
        // These are grouped by hash into 2 entity nodes (one for actors, one for targets)
        // and 1 label node representing all 6 relationships
        expect(response.body).to.have.property('nodes');
        expect(response.body).to.have.property('edges');

        // Filter entity nodes (non-label nodes) - should be 2 (one actor group, one target group)
        const entityNodes = response.body.nodes.filter(
          (node: NodeDataModel) => node.shape !== 'label'
        );
        expect(entityNodes).to.have.length(
          2,
          'Should have 2 entity nodes (actor and target groups)'
        );

        // Find actor node (should have count: 2 for 2 actor IDs)
        const actorNode = entityNodes.find((node: EntityNodeDataModel) => node.count === 2);
        expect(actorNode).to.not.be(undefined);
        expect(actorNode).to.have.property('shape', 'rectangle');
        expect(actorNode).to.have.property('color', 'primary');
        expect(actorNode).to.have.property('tag', 'Entities');
        expect(actorNode).to.have.property('icon', 'magnifyExclamation');
        // entity.id is multi-value ["actor-mv-1", "actor-mv-2"]. These are generic entities
        // (no typed EUID source fields present), so entity.id is used as-is via COALESCE fallback.
        // Each entity gets its own correct sourceFields value from the EUID column post MV_EXPAND.
        expect(actorNode.documentsData).to.have.length(2);
        expectExpect(actorNode.documentsData).toContainEqual(
          expectExpect.objectContaining({
            id: 'actor-mv-1',
            type: 'entity',
            entity: expectExpect.objectContaining({
              availableInEntityStore: false,
              sourceFields: expectExpect.objectContaining({
                'entity.id': 'actor-mv-1',
              }),
            }),
          })
        );
        expectExpect(actorNode.documentsData).toContainEqual(
          expectExpect.objectContaining({
            id: 'actor-mv-2',
            type: 'entity',
            entity: expectExpect.objectContaining({
              availableInEntityStore: false,
              sourceFields: expectExpect.objectContaining({
                'entity.id': 'actor-mv-2',
              }),
            }),
          })
        );

        // Find target node (should have count: 3 for 3 multi-value target IDs)
        // Same as actors: generic entities, EUID column used directly for sourceFields.
        const targetNode = entityNodes.find((node: EntityNodeDataModel) => node.count === 3);
        expect(targetNode).to.not.be(undefined);
        expect(targetNode).to.have.property('shape', 'rectangle');
        expect(targetNode).to.have.property('color', 'primary');
        expect(targetNode).to.have.property('tag', 'Entities');
        expect(targetNode).to.have.property('icon', 'magnifyExclamation');
        expect(targetNode.documentsData).to.have.length(3);
        expectExpect(targetNode.documentsData).toContainEqual(
          expectExpect.objectContaining({
            id: 'target-mv-1',
            type: 'entity',
            entity: expectExpect.objectContaining({
              availableInEntityStore: false,
              sourceFields: expectExpect.objectContaining({
                'entity.id': 'target-mv-1',
              }),
            }),
          })
        );
        expectExpect(targetNode.documentsData).toContainEqual(
          expectExpect.objectContaining({
            id: 'target-mv-2',
            type: 'entity',
            entity: expectExpect.objectContaining({
              availableInEntityStore: false,
              sourceFields: expectExpect.objectContaining({
                'entity.id': 'target-mv-2',
              }),
            }),
          })
        );
        expectExpect(targetNode.documentsData).toContainEqual(
          expectExpect.objectContaining({
            id: 'target-mv-3',
            type: 'entity',
            entity: expectExpect.objectContaining({
              availableInEntityStore: false,
              sourceFields: expectExpect.objectContaining({
                'entity.id': 'target-mv-3',
              }),
            }),
          })
        );

        // Verify label node exists for the action with count of 6 (2 actors × 3 targets)
        const labelNodes = response.body.nodes.filter(
          (node: LabelNodeDataModel) => node.shape === 'label'
        );
        expect(labelNodes).to.have.length(
          1,
          'Should have 1 label node representing all relationships'
        );

        const labelNode = labelNodes[0];
        expect(labelNode).to.have.property('label', 'test.multivalue.action');
        expect(labelNode).to.have.property('color', 'primary');
        expect(labelNode).to.have.property('count', 6); // 2 actors × 3 targets = 6 relationships
        expect(labelNode).to.have.property('uniqueEventsCount', 1); // 1 source event

        // Verify edges connect actor group -> label -> target group
        // Expected: 1 actor->label edge + 1 label->target edge = 2 edges
        expect(response.body.edges).to.have.length(
          2,
          'Should have 2 edges (actor group -> label -> target group)'
        );

        // Verify edge from actor to label
        const actorToLabelEdge = response.body.edges.find(
          (edge: EdgeDataModel) => edge.source === actorNode!.id && edge.target === labelNode.id
        );
        expect(actorToLabelEdge).to.not.be(undefined);
        expect(actorToLabelEdge).to.have.property('color', 'subdued');
        expect(actorToLabelEdge).to.have.property('type', 'solid');

        // Verify edge from label to target
        const labelToTargetEdge = response.body.edges.find(
          (edge: EdgeDataModel) => edge.source === labelNode.id && edge.target === targetNode!.id
        );
        expect(labelToTargetEdge).to.not.be(undefined);
        expect(labelToTargetEdge).to.have.property('color', 'subdued');
        expect(labelToTargetEdge).to.have.property('type', 'solid');
      });

      it('should support more than 1 originEventIds', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [
              { id: 'kabcd1234efgh5678', isAlert: true },
              { id: 'failed-event', isAlert: true },
            ],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3);
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).not.to.have.property('messages');

        response.body.nodes.forEach((node: EntityNodeDataModel | LabelNodeDataModel) => {
          expect(node).to.have.property('color');
          expect(node.color).equal(
            isLabelNode(node) &&
              Number(node.uniqueAlertsCount) > 0 &&
              Number(node.uniqueEventsCount) === 0
              ? 'danger'
              : 'primary',
            `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
          );
          if (node.id === 'failed-event') {
            expect(node.documentsData).to.have.length(1);
            expect(node.documentsData?.[0]).to.have.property('type', 'event');
          }
          if (node.id === 'kabcd1234efgh5678') {
            expect(node.documentsData).to.have.length(2);
            expect(node.documentsData?.[0]).to.have.property('type', 'event');
            expect(node.documentsData?.[1]).to.have.property('type', 'alert');
          }
        });

        response.body.edges.forEach((edge: EdgeDataModel) => {
          expect(edge).to.have.property('color');
          expect(edge.color).equal(
            'subdued',
            `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
          );
          expect(edge.type).equal('solid');
        });
      });

      it('should return a graph with nodes and edges by alert and actor', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [{ id: 'kabcd1234efgh5678', isAlert: true }],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
            esQuery: {
              bool: {
                filter: [
                  {
                    match_phrase: {
                      'user.id': 'admin2@example.com',
                    },
                  },
                ],
              },
            },
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(5); // 3 entities + 2 labels
        expect(response.body).to.have.property('edges').length(4); // Simple connections without group
        expect(response.body).not.to.have.property('messages');

        response.body.nodes.forEach(
          (node: EntityNodeDataModel | LabelNodeDataModel, idx: number) => {
            expect(node).to.have.property('color');
            expect(node.color).equal(
              'primary',
              `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
            );
            if (node.shape === 'label') {
              // Some nodes may have different document patterns
              if (node.documentsData && node.documentsData.length === 1) {
                expect(node.documentsData?.[0]).to.have.property('type', 'event');
              } else if (node.documentsData && node.documentsData.length === 2) {
                const hasAlert = node.documentsData.some((doc) => doc.type === 'alert');
                const hasEvent = node.documentsData.some((doc) => doc.type === 'event');
                expect(hasAlert).to.be(true);
                expect(hasEvent).to.be(true);
              }
            }
          }
        );

        response.body.edges.forEach((edge: EdgeDataModel, idx: number) => {
          expect(edge).to.have.property('color');
          expect(edge.color).equal(
            'subdued',
            `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
          );
          expect(edge.type).equal('solid');
        });
      });

      it('should filter unknown targets', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
            esQuery: {
              bool: {
                filter: [
                  {
                    match_phrase: {
                      'user.id': 'admin5@example.com',
                    },
                  },
                ],
              },
            },
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(0);
        expect(response.body).to.have.property('edges').length(0);
        expect(response.body).not.to.have.property('messages');
      });

      it('should return unknown targets', async () => {
        const response = await postGraph(supertest, {
          showUnknownTarget: true,
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
            esQuery: {
              bool: {
                filter: [
                  {
                    match_phrase: {
                      'user.id': 'admin5@example.com',
                    },
                  },
                ],
              },
            },
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3);
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).not.to.have.property('messages');
      });

      it('should limit number of nodes', async () => {
        const response = await postGraph(supertest, {
          nodesLimit: 1,
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
            esQuery: {
              bool: {
                filter: [
                  {
                    exists: {
                      field: 'user.id',
                    },
                  },
                ],
              },
            },
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3); // Minimal number of nodes in a single relationship
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).to.have.property('messages').length(1);
        expect(response.body.messages[0]).equal(ApiMessageCode.ReachedNodesLimit);
      });

      it('should support date math', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [{ id: 'kabcd1234efgh5678', isAlert: true }],
            start: '2024-09-01T12:30:00.000Z||-30m',
            end: '2024-09-01T12:30:00.000Z||+30m',
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3);
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).not.to.have.property('messages');
      });

      it('should return related alerts by default when fetching event', async () => {
        const response = await postGraph(supertest, {
          query: {
            originEventIds: [{ id: 'kabcd1234efgh5678', isAlert: false }],
            start: '2024-09-01T12:30:00.000Z||-30m',
            end: '2024-09-01T12:30:00.000Z||+30m',
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes').length(3);
        expect(response.body).to.have.property('edges').length(2);
        expect(response.body).not.to.have.property('messages');

        response.body.nodes.forEach((node: EntityNodeDataModel | LabelNodeDataModel) => {
          expect(node).to.have.property('color');
          expect(node.color).equal(
            isLabelNode(node) &&
              Number(node.uniqueAlertsCount) > 0 &&
              Number(node.uniqueEventsCount) === 0
              ? 'danger'
              : 'primary',
            `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
          );
          if (node.shape === 'label') {
            expect(node.documentsData).to.have.length(2);
            expectExpect(node.documentsData).toContainEqual(
              expectExpect.objectContaining({
                type: 'alert',
                alert: { ruleName: 'GCP IAM Custom Role Creation' },
              })
            );
          }
        });

        response.body.edges.forEach((edge: EdgeDataModel) => {
          expect(edge).to.have.property('color');
          expect(edge.color).equal(
            'subdued',
            `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
          );
          expect(edge.type).equal('solid');
        });
      });

      it('should return label nodes with correct ID pattern confirming boolean handling', async () => {
        const response = await postGraph(supertest, {
          query: {
            indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
            originEventIds: [
              { id: 'kabcd1234efgh5678', isAlert: true },
              { id: 'failed-event', isAlert: false },
            ],
            start: '2024-09-01T00:00:00Z',
            end: '2024-09-02T00:00:00Z',
          },
        }).expect(result(200));

        expect(response.body).to.have.property('nodes');

        const labelNodes = response.body.nodes.filter(
          (n: NodeDataModel) => n.shape === 'label'
        ) as LabelNodeDataModel[];

        // Verify we have label nodes to test
        expect(labelNodes.length).to.be.greaterThan(0, 'Should have at least one label node');

        // Verify label node IDs contain the expected pattern oe([01])oa([01])
        // This confirms isOrigin and isOriginAlert booleans are converted to 0/1
        // CRITICAL: If COALESCE(..., false) is missing, events with null event.id
        // would result in isOrigin=null which would break this pattern
        labelNodes.forEach((labelNode: LabelNodeDataModel) => {
          expect(labelNode.id).to.match(
            /oe\([01]\)oa\([01]\)/,
            `Label node ID should contain oe(0|1)oa(0|1) pattern but got: ${labelNode.id}. ` +
              'This pattern validates that isOrigin and isOriginAlert are properly coalesced to boolean values.'
          );
        });

        // At least one label should be from an origin event (oe(1))
        const originLabelNodes = labelNodes.filter((n: LabelNodeDataModel) =>
          n.id.includes('oe(1)')
        );
        expect(originLabelNodes.length).to.be.greaterThan(
          0,
          'Should have at least one label node from origin event'
        );

        // Verify the origin alert label has the correct pattern (oe(1)oa(1))
        const originAlertLabels = labelNodes.filter((n: LabelNodeDataModel) =>
          n.id.includes('oe(1)oa(1)')
        );
        expect(originAlertLabels.length).to.be.greaterThan(
          0,
          'Should have at least one label node from origin alert (kabcd1234efgh5678 is marked as isAlert: true)'
        );
      });

      it('should handle events with null event.id gracefully', async () => {
        // Create a test event with null event.id to test the edge case
        // Use logs-* pattern which is a data stream, requires op_type: 'create'
        const testDataStream = 'logs-test.graph-default';

        const createResponse = await es.index({
          index: testDataStream,
          op_type: 'create', // Required for data streams
          document: {
            '@timestamp': '2024-09-01T12:00:00.000Z',
            'event.action': 'test_action_null_event_id',
            // Deliberately omit event.id to test null handling
            'user.id': 'test-user-null-event-id',
            'entity.target.id': 'test-target-null-event-id',
          },
          refresh: 'wait_for',
        });

        const createdDocId = createResponse._id;
        const createdIndex = createResponse._index;

        try {
          // Verify the event was created without event.id
          const verifyResponse = await es.search({
            index: testDataStream,
            query: {
              bool: {
                filter: [
                  {
                    term: {
                      _id: createdDocId,
                    },
                  },
                ],
                must_not: [
                  {
                    exists: {
                      field: 'event.id',
                    },
                  },
                ],
              },
            },
          });

          expect(verifyResponse.hits.hits.length).to.be.greaterThan(
            0,
            'Test event with null event.id should exist'
          );

          // Query specifically for the event with null event.id using esQuery filter
          // Also provide originEventIds to trigger the COALESCE logic for isOrigin/isOriginAlert
          // This tests that events with null event.id get isOrigin=false (not null)
          const response = await postGraph(supertest, {
            query: {
              indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
              // Include originEventIds to test that isOrigin evaluates to false (not null)
              // when event.id is null - the COALESCE(..., false) is critical here
              originEventIds: [{ id: 'kabcd1234efgh5678', isAlert: true }],
              start: '2024-09-01T00:00:00Z',
              end: '2024-09-02T00:00:00Z',
              esQuery: {
                bool: {
                  filter: [
                    {
                      match_phrase: {
                        'user.id': 'test-user-null-event-id',
                      },
                    },
                  ],
                },
              },
            },
          }).expect(result(200));

          expect(response.body).to.have.property('nodes');
          expect(response.body).to.have.property('edges');

          // Should find the event with null event.id
          expect(response.body.nodes.length).to.be.greaterThan(
            0,
            'Should return nodes for event with null event.id'
          );

          const labelNodes = response.body.nodes.filter(
            (n: NodeDataModel) => n.shape === 'label'
          ) as LabelNodeDataModel[];

          // Verify we got at least one label node for the null event.id event
          expect(labelNodes.length).to.be.greaterThan(
            0,
            'Should have label node for event with null event.id'
          );

          // All label nodes should have valid IDs with the pattern oe([01])oa([01])
          // This confirms COALESCE ensures boolean isOrigin and isOriginAlert values
          // even when event.id is null (should be oe(0)oa(0) for non-origin events)
          labelNodes.forEach((labelNode: LabelNodeDataModel) => {
            expect(labelNode.id).to.match(
              /oe\([01]\)oa\([01]\)/,
              `Label node ID should contain oe(0|1)oa(0|1) pattern but got: ${labelNode.id}. ` +
                'If the pattern shows null instead of 0/1, the COALESCE fix is missing.'
            );
          });

          // The event with null event.id should have isOrigin=false (oe(0)) since
          // event.id IN (...) returns null when event.id is null, and COALESCE should
          // convert that to false
          const nullEventIdLabelNode = labelNodes.find((n: LabelNodeDataModel) =>
            n.label?.includes('test_action_null_event_id')
          );
          expect(nullEventIdLabelNode).to.not.be(undefined);
          expect(nullEventIdLabelNode!.id).to.match(
            /oe\(0\)oa\(0\)/,
            'Event with null event.id should have isOrigin=false (oe(0)) and isOriginAlert=false (oa(0))'
          );
        } finally {
          // Clean up: delete the test event using the actual backing index
          if (createdDocId && createdIndex) {
            await es
              .delete({
                index: createdIndex,
                id: createdDocId,
                refresh: 'wait_for',
              })
              .catch(() => {
                // Ignore errors if already deleted
              });
          }
        }
      });

      describe('Graph without data enrichment', () => {
        before(async () => {
          await kibanaServer.uiSettings.update({ 'securitySolution:enableAssetInventory': true });
        });

        after(async () => {
          await kibanaServer.uiSettings.update({ 'securitySolution:enableAssetInventory': false });
        });

        it('should return 200 when securitySolution:enableAssetInventory is true without enrich policy', async () => {
          const response = await postGraph(supertest, {
            query: {
              originEventIds: [],
              start: '2024-09-01T00:00:00Z',
              end: '2024-09-02T00:00:00Z',
              esQuery: {
                bool: {
                  filter: [
                    {
                      match_phrase: {
                        'user.id': 'admin@example.com',
                      },
                    },
                  ],
                  must_not: [
                    {
                      match_phrase: {
                        'event.action': 'google.iam.admin.v1.UpdateRole',
                      },
                    },
                  ],
                },
              },
            },
          }).expect(result(200));

          expect(response.body).to.have.property('nodes').length(3);
          expect(response.body).to.have.property('edges').length(2);
        });

        // v2 index without lookup mode - enrichment now works via a follow-up ES|QL query
        // against the entity store, so lookup mode is no longer required.
        describe('v2 index without lookup mode (enrichment still applies)', () => {
          before(async () => {
            // Delete the v2 lookup index if it exists
            try {
              await es.indices.delete({
                index: getEntitiesLatestIndexName(),
                ignore_unavailable: true,
              });
            } catch (e) {
              // Ignore if index doesn't exist
            }

            // Create a new index with the same name but with standard mode (no lookup mode)
            // This simulates having an entity index that's not configured for LOOKUP JOIN
            await es.indices.create({
              index: getEntitiesLatestIndexName(),
              settings: {
                index: {
                  mode: 'standard', // Not 'lookup' mode
                },
              },
              mappings: {
                properties: {
                  'entity.id': { type: 'keyword' },
                  'entity.name': { type: 'keyword' },
                  'entity.type': { type: 'keyword' },
                  'entity.sub_type': { type: 'keyword' },
                },
              },
            });

            // Index some entity data directly (without lookup mode, enrichment won't work)
            await es.index({
              index: getEntitiesLatestIndexName(),
              id: 'user:admin@example.com@gcp',
              document: {
                'entity.id': 'user:admin@example.com@gcp',
                'entity.name': 'AdminExample',
                'entity.type': 'Identity',
                'entity.sub_type': 'GCP IAM User',
              },
              refresh: true,
            });
          });

          after(async () => {
            // Clean up the standard mode v2 index
            try {
              await es.indices.delete({
                index: getEntitiesLatestIndexName(),
                ignore_unavailable: true,
              });
            } catch (e) {
              // Ignore if index doesn't exist
            }
          });

          it('should still return enriched graph data when v2 index is not in lookup mode', async () => {
            // The graph API enriches via a follow-up ES|QL query against the entity store
            // (no LOOKUP JOIN), so lookup mode is not required for enrichment to apply.
            const response = await postGraph(supertest, {
              query: {
                originEventIds: [],
                start: '2024-09-01T00:00:00Z',
                end: '2024-09-02T00:00:00Z',
                esQuery: {
                  bool: {
                    filter: [
                      {
                        match_phrase: {
                          'user.id': 'admin@example.com',
                        },
                      },
                    ],
                    must_not: [
                      {
                        match_phrase: {
                          'event.action': 'google.iam.admin.v1.UpdateRole',
                        },
                      },
                    ],
                  },
                },
              },
            }).expect(result(200));

            expect(response.body).to.have.property('nodes').length(3);
            expect(response.body).to.have.property('edges').length(2);
            expect(response.body).not.to.have.property('messages');

            // Find the actor node - enrichment applies even without lookup mode
            const actorNode = response.body.nodes.find(
              (node: EntityNodeDataModel) => node.id === 'user:admin@example.com@gcp'
            ) as EntityNodeDataModel;

            expect(actorNode).not.to.be(undefined);
            expect(actorNode.label).to.equal('AdminExample');
            expect(actorNode.icon).to.equal('user');
            expect(actorNode.documentsData).to.have.length(1);
            expectExpect(actorNode.documentsData).toContainEqual(
              expectExpect.objectContaining({
                id: 'user:admin@example.com@gcp',
                type: 'entity',
                entity: expectExpect.objectContaining({
                  availableInEntityStore: true,
                  name: 'AdminExample',
                  type: 'Identity',
                  sub_type: 'GCP IAM User',
                  sourceFields: expectExpect.objectContaining({
                    'user.id': 'admin@example.com',
                  }),
                }),
              })
            );

            // The customRole target is not in the entity store; it should remain unenriched.
            const targetNode = response.body.nodes.find(
              (node: EntityNodeDataModel) => node.id === 'projects/your-project-id/roles/customRole'
            ) as EntityNodeDataModel;
            expect(targetNode).not.to.be(undefined);
            expect(targetNode.label).to.equal('projects/your-project-id/roles/customRole');
            expect(targetNode.icon).to.equal('magnifyExclamation');
            expect(targetNode.documentsData).to.have.length(1);
            expectExpect(targetNode.documentsData).toContainEqual(
              expectExpect.objectContaining({
                id: 'projects/your-project-id/roles/customRole',
                type: 'entity',
                entity: expectExpect.objectContaining({
                  availableInEntityStore: false,
                  sourceFields: expectExpect.objectContaining({
                    'entity.id': 'projects/your-project-id/roles/customRole',
                  }),
                }),
              })
            );
          });
        });
      });

      describe('Enrich graph with entity metadata', () => {
        // All enrichment tests run in a dedicated space called 'entities-space'
        const enrichmentRetryTimeout = 15000;
        const entitiesSpaceId = 'entities-space';
        let entitiesSpaceDataView: ReturnType<typeof dataViewRouteHelpersFactory>;

        // All tests run in the dedicated entities-space
        const runEnrichmentTests = () => {
          it('should contain entity data when asset inventory is enabled', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [],
                    start: '2024-09-01T00:00:00Z',
                    end: '2024-09-02T00:00:00Z',
                    esQuery: {
                      bool: {
                        filter: [
                          {
                            match_phrase: {
                              'user.id': 'admin@example.com',
                            },
                          },
                        ],
                        must_not: [
                          {
                            match_phrase: {
                              'event.action': 'google.iam.admin.v1.UpdateRole',
                            },
                          },
                        ],
                      },
                    },
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              expect(response.body).to.have.property('nodes').length(3);
              expect(response.body).to.have.property('edges').length(2);
              expect(response.body).not.to.have.property('messages');
              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const actorNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'user:admin@example.com@gcp'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(actorNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(actorNode.label).to.equal('AdminExample');
              expect(actorNode.icon).to.equal('user');
              expect(actorNode.shape).to.equal('ellipse');
              expect(actorNode.tag).to.equal('Identity');

              // Verify other nodes
              response.body.nodes.forEach((node: EntityNodeDataModel | LabelNodeDataModel) => {
                expect(node).to.have.property('color');

                if (node.shape === 'label') {
                  expect(node.color).equal(
                    'primary',
                    `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
                  );
                  expect(node.documentsData).to.have.length(2);
                  expectExpect(node.documentsData).toContainEqual(
                    expectExpect.objectContaining({
                      type: 'event',
                    })
                  );
                  expectExpect(node.documentsData).toContainEqual(
                    expectExpect.objectContaining({
                      type: 'alert',
                    })
                  );
                } else {
                  expect(node.color).equal(
                    'primary',
                    `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
                  );
                }
              });

              response.body.edges.forEach((edge: EdgeDataModel) => {
                expect(edge).to.have.property('color');
                expect(edge.color).equal(
                  'subdued',
                  `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
                );
                expect(edge.type).equal('solid');
              });
            });
          });

          it('should return enriched data when asset inventory is enabled - multi target', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
                    originEventIds: [{ id: 'service-host-event-id', isAlert: false }],
                    start: '2024-09-01T00:00:00Z',
                    end: '2024-09-02T00:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200, logger));

              // Should have 3 nodes: 1 actor (single service), 1 grouped target (2 hosts), 1 label
              expect(response.body).to.have.property('nodes').length(3);
              expect(response.body).to.have.property('edges').length(2);

              const actorNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'service:ServiceAccount123'
              ) as EntityNodeDataModel;

              // Verify entity enrichment for service actor (single entity)
              expect(actorNode).not.to.be(undefined);
              expect(actorNode.label).to.equal('ServiceAccount123');
              expect(actorNode.icon).to.equal('cloudStormy');
              expect(actorNode.shape).to.equal('rectangle');
              expect(actorNode.tag).to.equal('Service');
              expect(actorNode.count).to.be(undefined); // No count for single entity
              expect(actorNode.documentsData).to.have.length(1);
              expectExpect(actorNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'service:ServiceAccount123',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'ServiceAccount123',
                    type: 'Service',
                    sub_type: 'GCP Service Account',
                    availableInEntityStore: true,
                    engine_type: 'service',
                    sourceFields: expectExpect.objectContaining({
                      'service.name': 'ServiceAccount123',
                    }),
                  }),
                })
              );

              // Find grouped target node by checking for count property
              const targetNode = response.body.nodes.find(
                (node: EntityNodeDataModel) =>
                  node.id === '081f21718bb4b854bda72b01719d0febe88b10520dede17fc2640260002ea339'
              ) as EntityNodeDataModel;

              // Verify entity enrichment for grouped targets (2 hosts of same type/subtype)
              expect(targetNode).not.to.be(undefined);
              expect(targetNode.label).to.equal('GCP Compute Instance'); // Should show sub_type for grouped entities
              expect(targetNode.icon).to.equal('container'); // Default icon for unmapped entity type
              expect(targetNode.shape).to.equal('rectangle'); // Default shape for grouped entities
              expect(targetNode.tag).to.equal('Container');
              expect(targetNode.count).to.equal(2);
              expect(targetNode.documentsData).to.have.length(2);
              expectExpect(targetNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'host:host-instance-1',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'HostInstance1',
                    type: 'Container',
                    sub_type: 'GCP Compute Instance',
                    availableInEntityStore: true,
                    engine_type: 'host',
                    sourceFields: expectExpect.objectContaining({
                      'host.id': 'host-instance-1',
                    }),
                  }),
                })
              );
              expectExpect(targetNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'host:host-instance-2',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'HostInstance2',
                    type: 'Container',
                    sub_type: 'GCP Compute Instance',
                    availableInEntityStore: true,
                    engine_type: 'host',
                    sourceFields: expectExpect.objectContaining({
                      'host.id': 'host-instance-2',
                    }),
                  }),
                })
              );
            });
          });

          it('should enrich graph with entity metadata for actor acting on single target', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
                    originEventIds: [{ id: 'entity-enrichment-event-id', isAlert: true }],
                    start: '2024-09-10T14:00:00Z',
                    end: '2024-09-10T15:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              expect(response.body).to.have.property('nodes').length(3);
              expect(response.body).to.have.property('edges').length(2);
              expect(response.body).not.to.have.property('messages');

              const actorNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'user:entity-user@example.com@gcp'
              ) as EntityNodeDataModel;
              expect(actorNode).not.to.be(undefined);
              expect(actorNode.label).to.equal('EntityTestUser');
              expect(actorNode.icon).to.equal('user');
              expect(actorNode.shape).to.equal('ellipse');
              expect(actorNode.tag).to.equal('Identity');
              expect(actorNode!.documentsData!.length).to.equal(1);
              expectExpect(actorNode!.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:entity-user@example.com@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'EntityTestUser',
                    type: 'Identity',
                    sub_type: 'GCP IAM User',
                    availableInEntityStore: true,
                    engine_type: 'user',
                    sourceFields: expectExpect.objectContaining({
                      'user.id': 'entity-user@example.com',
                    }),
                  }),
                })
              );

              const serviceTargetNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'entity-service-target-1'
              ) as EntityNodeDataModel;
              expect(serviceTargetNode).not.to.be(undefined);
              expect(serviceTargetNode.label).to.equal('ComputeServiceTarget');
              expect(serviceTargetNode.shape).to.equal('rectangle');
              expect(serviceTargetNode.tag).to.equal('Compute');
              expect(serviceTargetNode!.documentsData!.length).to.be.greaterThan(0);

              expectExpect(serviceTargetNode!.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'entity-service-target-1',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'ComputeServiceTarget',
                    type: 'Compute',
                    sub_type: 'GCP Compute Instance',
                    availableInEntityStore: true,
                    engine_type: 'generic',
                    sourceFields: expectExpect.objectContaining({
                      'entity.id': 'entity-service-target-1',
                    }),
                  }),
                })
              );

              const labelNode = response.body.nodes.find(
                (node: NodeDataModel) => node.shape === 'label'
              ) as LabelNodeDataModel;
              expect(labelNode).not.to.be(undefined);
              expect(labelNode.color).equal('primary');
              expect(labelNode.documentsData).to.have.length(2);
              expectExpect(labelNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  type: 'event',
                })
              );
              expectExpect(labelNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  type: 'alert',
                })
              );

              response.body.edges.forEach((edge: EdgeDataModel) => {
                expect(edge).to.have.property('color');
                expect(edge.color).equal(
                  'subdued',
                  `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
                );
                expect(edge.type).equal('solid');
              });
            });
          });

          it('should enrich graph with multiple targets from different fields with mixed grouping', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
                    originEventIds: [{ id: 'multi-target-mixed-event-id', isAlert: false }],
                    start: '2024-09-11T09:00:00Z',
                    end: '2024-09-11T11:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              // Expected structure:
              // - 1 actor node (single user)
              // - 1 grouped target node for Storage entities (target-bucket-a, target-bucket-b from entity.target.id + target-bucket-c from service.target.entity.id)
              // - 1 single target node for Service entity (target-sa-different from service.target.entity.id)
              // - 1 label node (deduped - single action fans out to both targets)
              // Total: 4 nodes, 3 edges (actor→label, label→service, label→storage group)
              expect(response.body).to.have.property('nodes').length(4);
              expect(response.body).to.have.property('edges').length(3);
              expect(response.body).not.to.have.property('messages');

              // Verify actor node (single enriched user)
              const actorNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'user:multi-target-user@example.com@gcp'
              ) as EntityNodeDataModel;
              expect(actorNode).not.to.be(undefined);
              expect(actorNode.label).to.equal('MultiTargetUser');
              expect(actorNode.icon).to.equal('user');
              expect(actorNode.shape).to.equal('ellipse');
              expect(actorNode.tag).to.equal('Identity');
              expect(actorNode.count).to.be(undefined); // Single entity, no count
              expect(actorNode.documentsData).to.have.length(1);
              expectExpect(actorNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:multi-target-user@example.com@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'MultiTargetUser',
                    type: 'Identity',
                    sub_type: 'GCP IAM User',
                    availableInEntityStore: true,
                    engine_type: 'user',
                    sourceFields: expectExpect.objectContaining({
                      'user.id': 'multi-target-user@example.com',
                    }),
                  }),
                })
              );

              // Find grouped Storage target node (should have 3 buckets: target-bucket-a, target-bucket-b, target-bucket-c)
              const storageGroupNode = response.body.nodes.find(
                (node: EntityNodeDataModel) =>
                  node.id === '0b32687b565bbb4401472fad910ab3274f0cdf72ed77a785aed3b4a3712b5378'
              ) as EntityNodeDataModel;
              expect(storageGroupNode).not.to.be(undefined);
              expect(storageGroupNode.label).to.equal('GCP Storage Bucket'); // Shows sub_type for grouped entities
              expect(storageGroupNode.shape).to.equal('rectangle');
              expect(storageGroupNode.tag).to.equal('Storage');
              expect(storageGroupNode.count).to.equal(3);
              expect(storageGroupNode.documentsData).to.have.length(3);
              // Generic entities use the EUID column value directly for sourceFields,
              // so each entity gets its own correct entity.target.id value.
              expectExpect(storageGroupNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'projects/multi-target-project-id/buckets/target-bucket-a',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'TargetBucketA',
                    type: 'Storage',
                    sub_type: 'GCP Storage Bucket',
                    availableInEntityStore: true,
                    engine_type: 'generic',
                    sourceFields: expectExpect.objectContaining({
                      'entity.id': 'projects/multi-target-project-id/buckets/target-bucket-a',
                    }),
                  }),
                })
              );
              expectExpect(storageGroupNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'projects/multi-target-project-id/buckets/target-bucket-b',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'TargetBucketB',
                    type: 'Storage',
                    sub_type: 'GCP Storage Bucket',
                    availableInEntityStore: true,
                    engine_type: 'generic',
                    sourceFields: expectExpect.objectContaining({
                      'entity.id': 'projects/multi-target-project-id/buckets/target-bucket-b',
                    }),
                  }),
                })
              );
              expectExpect(storageGroupNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'projects/multi-target-project-id/buckets/target-bucket-c',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'TargetBucketC',
                    type: 'Storage',
                    sub_type: 'GCP Storage Bucket',
                    availableInEntityStore: true,
                    engine_type: 'generic',
                    sourceFields: expectExpect.objectContaining({
                      'entity.id': 'projects/multi-target-project-id/buckets/target-bucket-c',
                    }),
                  }),
                })
              );

              // Find single Service target node (TargetServiceDifferent)
              const serviceNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'service:TargetServiceDifferent'
              ) as EntityNodeDataModel;
              expect(serviceNode).not.to.be(undefined);
              expect(serviceNode.label).to.equal('TargetServiceDifferent');
              expect(serviceNode.icon).to.equal('cloudStormy'); // Service type icon
              expect(serviceNode.shape).to.equal('rectangle');
              expect(serviceNode.tag).to.equal('Service');
              expect(serviceNode.count).to.be(undefined); // Single entity, no count
              expect(serviceNode.documentsData).to.have.length(1);
              expectExpect(serviceNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'service:TargetServiceDifferent',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'TargetServiceDifferent',
                    type: 'Service',
                    sub_type: 'GCP Service Account',
                    availableInEntityStore: true,
                    engine_type: 'service',
                    sourceFields: expectExpect.objectContaining({
                      'service.name': 'TargetServiceDifferent',
                    }),
                  }),
                })
              );

              // Verify label node (should have 1 - deduped label fans out to both targets)
              const labelNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'label'
              ) as LabelNodeDataModel[];
              expect(labelNodes).to.have.length(1);
              const labelNode = labelNodes[0];
              expect(labelNode.color).equal('primary');
              expect(labelNode.label).to.equal('google.cloud.multi.target.action');
              expect(labelNode.documentsData).to.have.length(1);
              expectExpect(labelNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  type: 'event',
                })
              );

              // Verify edges
              response.body.edges.forEach((edge: EdgeDataModel) => {
                expect(edge).to.have.property('color');
                expect(edge.color).equal(
                  'subdued',
                  `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
                );
                expect(edge.type).equal('solid');
              });
            });
          });

          it('should handle entities with partial data (name only or type/subtype only)', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    indexPatterns: ['.alerts-security.alerts-*', 'logs-*'],
                    originEventIds: [{ id: 'partial-entity-event-id', isAlert: false }],
                    start: '2024-09-12T09:00:00Z',
                    end: '2024-09-12T11:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              expect(response.body).to.have.property('nodes').length(3);
              expect(response.body).to.have.property('edges').length(2);
              expect(response.body).not.to.have.property('messages');

              // Verify actor node - entity with only name (no type/sub_type)
              const actorNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'user:partial-user@example.com@gcp'
              ) as EntityNodeDataModel;
              expect(actorNode).not.to.be(undefined);
              // Label should be the entity name since it exists
              expect(actorNode.label).to.equal('user:partial-user@example.com@gcp');
              // Icon and shape should be defaults since type is missing
              expect(actorNode.icon).to.equal('magnifyExclamation');
              expect(actorNode.shape).to.equal('rectangle');
              expect(actorNode.documentsData).to.have.length(1);
              expectExpect(actorNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:partial-user@example.com@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'PartialUserNameOnly',
                    availableInEntityStore: true,
                    engine_type: 'user',
                    sourceFields: expectExpect.objectContaining({
                      'user.id': 'partial-user@example.com',
                    }),
                  }),
                })
              );
              // Verify type and sub_type are NOT present in the entity data
              expectExpect(actorNode.documentsData![0].entity).not.toHaveProperty('type');
              expectExpect(actorNode.documentsData![0].entity).not.toHaveProperty('sub_type');

              // Verify target node - entity with only type/sub_type (no name)
              const targetNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'host:partial-host-instance-1'
              ) as EntityNodeDataModel;
              expect(targetNode).not.to.be(undefined);
              // Icon and shape should be based on type since it exists
              expect(targetNode.icon).to.equal('container');
              expect(targetNode.shape).to.equal('rectangle');
              expect(targetNode.tag).to.equal('Container');
              expect(targetNode.documentsData).to.have.length(1);
              expectExpect(targetNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'host:partial-host-instance-1',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    type: 'Container',
                    sub_type: 'GCP Compute Instance',
                    availableInEntityStore: true,
                    engine_type: 'host',
                    sourceFields: expectExpect.objectContaining({
                      'host.id': 'partial-host-instance-1',
                    }),
                  }),
                })
              );
              // Verify name is NOT present in the entity data
              expectExpect(targetNode.documentsData![0].entity).not.toHaveProperty('name');

              // Verify label node
              const labelNode = response.body.nodes.find(
                (node: NodeDataModel) => node.shape === 'label'
              ) as LabelNodeDataModel;
              expect(labelNode).not.to.be(undefined);
              expect(labelNode.label).to.equal('google.compute.v1.Instances.start');
              expect(labelNode.color).to.equal('primary');
            });
          });

          it('should return doc data when host ip is singular', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [],
                    entityIds: [{ id: 'host:host-with-single-ip', isOrigin: false }],
                    start: '2024-09-01T00:00:00Z',
                    end: '2024-09-02T00:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              expect(response.body).to.have.property('nodes').length(1);
              expect(response.body).to.have.property('edges').length(0);
              expect(response.body).not.to.have.property('messages');
              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const entityNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'host:host-with-single-ip'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(entityNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(entityNode.label).to.equal('Host with single ip');
              expect(entityNode.icon).to.equal('storage');
              expect(entityNode.shape).to.equal('hexagon');
              expect(entityNode.tag).to.equal('Host');
              expect(entityNode.documentsData).to.have.length(1);
              expect(entityNode.documentsData![0].entity?.host?.ip).to.have.length(1);
            });
          });

          it('should return doc data when host ip is missing', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [],
                    entityIds: [{ id: 'host:host-with-no-ip', isOrigin: false }],
                    start: '2024-09-01T00:00:00Z',
                    end: '2024-09-02T00:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              expect(response.body).to.have.property('nodes').length(1);
              expect(response.body).to.have.property('edges').length(0);
              expect(response.body).not.to.have.property('messages');
              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const entityNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'host:host-with-no-ip'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(entityNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(entityNode.label).to.equal('Host with no ip');
              expect(entityNode.icon).to.equal('storage');
              expect(entityNode.shape).to.equal('hexagon');
              expect(entityNode.tag).to.equal('Host');
              expect(entityNode.documentsData).to.have.length(1);
              expect(entityNode.documentsData![0].entity).not.to.have.property('host');
            });
          });

          it('should return doc data when host ip is multiple', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [],
                    entityIds: [{ id: 'host:host-with-multiple-ips', isOrigin: false }],
                    start: '2024-09-01T00:00:00Z',
                    end: '2024-09-02T00:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              expect(response.body).to.have.property('nodes').length(1);
              expect(response.body).to.have.property('edges').length(0);
              expect(response.body).not.to.have.property('messages');
              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const entityNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'host:host-with-multiple-ips'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(entityNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(entityNode.label).to.equal('Host with multiple ips');
              expect(entityNode.icon).to.equal('storage');
              expect(entityNode.shape).to.equal('hexagon');
              expect(entityNode.tag).to.equal('Host');
              expect(entityNode.documentsData).to.have.length(1);
              expect(entityNode.documentsData![0].entity?.host?.ip).to.have.length(3);
            });
          });

          it('should return doc data when relationship actor host ip is multiple', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [],
                    entityIds: [{ id: 'host:host-with-multiple-ips-actor', isOrigin: false }],
                    start: '2024-09-01T00:00:00Z',
                    end: '2024-09-02T00:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              expect(response.body).to.have.property('nodes').length(3);
              expect(response.body).to.have.property('edges').length(2);
              expect(response.body).not.to.have.property('messages');
              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const actorEntityNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'host:host-with-multiple-ips-actor'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(actorEntityNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(actorEntityNode.label).to.equal('Actor Host with multiple ips');
              expect(actorEntityNode.icon).to.equal('storage');
              expect(actorEntityNode.shape).to.equal('hexagon');
              expect(actorEntityNode.tag).to.equal('Host');
              expect(actorEntityNode.documentsData).to.have.length(1);
              expect(actorEntityNode.documentsData![0].entity?.host?.ip).to.have.length(3);

              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const targetEntityNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'host:host-with-multiple-ips-target'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(targetEntityNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(targetEntityNode.label).to.equal('Target Host with multiple ips');
              expect(targetEntityNode.icon).to.equal('storage');
              expect(targetEntityNode.shape).to.equal('hexagon');
              expect(targetEntityNode.tag).to.equal('Host');
              expect(targetEntityNode.documentsData).to.have.length(1);
              expect(targetEntityNode.documentsData![0].entity?.host?.ip).to.have.length(3);
            });
          });

          it('should return doc data when relationship target host ip is multiple', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [],
                    entityIds: [{ id: 'host:host-with-multiple-ips-target', isOrigin: false }],
                    start: '2024-09-01T00:00:00Z',
                    end: '2024-09-02T00:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              expect(response.body).to.have.property('nodes').length(3);
              expect(response.body).to.have.property('edges').length(2);
              expect(response.body).not.to.have.property('messages');
              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const actorEntityNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'host:host-with-multiple-ips-actor'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(actorEntityNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(actorEntityNode.label).to.equal('Actor Host with multiple ips');
              expect(actorEntityNode.icon).to.equal('storage');
              expect(actorEntityNode.shape).to.equal('hexagon');
              expect(actorEntityNode.tag).to.equal('Host');
              expect(actorEntityNode.documentsData).to.have.length(1);
              expect(actorEntityNode.documentsData![0].entity?.host?.ip).to.have.length(3);

              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const targetEntityNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'host:host-with-multiple-ips-target'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(targetEntityNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(targetEntityNode.label).to.equal('Target Host with multiple ips');
              expect(targetEntityNode.icon).to.equal('storage');
              expect(targetEntityNode.shape).to.equal('hexagon');
              expect(targetEntityNode.tag).to.equal('Host');
              expect(targetEntityNode.documentsData).to.have.length(1);
              expect(targetEntityNode.documentsData![0].entity?.host?.ip).to.have.length(3);
            });
          });

          it('should return doc data for event nodes when both actor and target host have multiple IPs', async () => {
            await retry.tryForTime(enrichmentRetryTimeout, async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [{ id: 'entities-host-multiple-ips-event-id', isAlert: false }],
                    start: '2024-09-01T00:00:00Z',
                    end: '2024-09-02T00:00:00Z',
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200));

              expect(response.body).to.have.property('nodes').length(3);
              expect(response.body).to.have.property('edges').length(2);
              expect(response.body).not.to.have.property('messages');
              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const actorEntityNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'host:host-with-multiple-ips-actor'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(actorEntityNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(actorEntityNode.label).to.equal('Actor Host with multiple ips');
              expect(actorEntityNode.icon).to.equal('storage');
              expect(actorEntityNode.shape).to.equal('hexagon');
              expect(actorEntityNode.tag).to.equal('Host');
              expect(actorEntityNode.documentsData).to.have.length(1);
              expect(actorEntityNode.documentsData![0].entity?.host?.ip).to.have.length(3);

              // Find the actor node directly by entity ID (single entity uses entity ID as node ID)
              const targetEntityNode = response.body.nodes.find(
                (node: EntityNodeDataModel) => node.id === 'host:host-with-multiple-ips-target'
              ) as EntityNodeDataModel;

              // Verify entity enrichment
              expect(targetEntityNode).not.to.be(undefined);
              // For single enriched entities, label should be entity.name
              expect(targetEntityNode.label).to.equal('Target Host with multiple ips');
              expect(targetEntityNode.icon).to.equal('storage');
              expect(targetEntityNode.shape).to.equal('hexagon');
              expect(targetEntityNode.tag).to.equal('Host');
              expect(targetEntityNode.documentsData).to.have.length(1);
              expect(targetEntityNode.documentsData![0].entity?.host?.ip).to.have.length(3);
            });
          });
        };

        before(async () => {
          // delete v2 index manually since its not being deleted by the cleanupEntityStore function
          try {
            await es.indices.delete({
              index: getEntitiesLatestIndexName(entitiesSpaceId),
              ignore_unavailable: true,
            });
          } catch (e) {
            // Ignore if index doesn't exist
          }

          // Delete and recreate the entities-space
          await spacesService.delete(entitiesSpaceId);
          await spacesService.create({
            id: entitiesSpaceId,
            name: 'Entities Space',
            solution: 'security',
            disabledFeatures: [],
          });

          // Enable asset inventory setting in entities-space
          await kibanaServer.uiSettings.update(
            { 'securitySolution:enableAssetInventory': true },
            { space: entitiesSpaceId }
          );

          // Initialize security-solution data-view in entities-space
          entitiesSpaceDataView = dataViewRouteHelpersFactory(supertest, entitiesSpaceId);
          await entitiesSpaceDataView.create('security-solution');

          // Initialize entity engine for 'generic' type in entities-space
          await initEntityEnginesWithRetry({
            supertest,
            retry,
            logger,
            entityTypes: ['generic'],
            spaceId: entitiesSpaceId,
          });

          await installCloudAssetInventoryPackage({ supertest, logger, spaceId: entitiesSpaceId });
        });

        after(async () => {
          // Disable asset inventory setting in entities-space
          await kibanaServer.uiSettings.update(
            { 'securitySolution:enableAssetInventory': false },
            { space: entitiesSpaceId }
          );

          await entitiesSpaceDataView.delete('security-solution');
          await spacesService.delete(entitiesSpaceId);
        });

        describe('via LOOKUP JOIN (v2)', () => {
          before(async () => {
            await esArchiver.load(
              'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/entity_store_v2'
            );

            // Wait for entity data to be fully indexed
            await waitForEntityDataIndexed({
              es,
              logger,
              retry,
              entitiesIndex: getEntitiesLatestIndexName(entitiesSpaceId),
              expectedCount: 48,
            });
          });

          after(async () => {
            await esArchiver.unload(
              'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/entity_store_v2'
            );
          });

          runEnrichmentTests();

          describe('Entity Relationships', () => {
            it('should return both event and relationship nodes when originEventIds and entityIds are provided', async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [{ id: 'relationships-event-id-12345', isAlert: false }],
                    start: '2024-09-01T12:00:00.000Z',
                    end: '2024-09-01T13:00:00.000Z',
                    entityIds: [{ id: 'user:relationships-test-user@gcp', isOrigin: false }],
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200, logger));

              const userActorNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'user:relationships-test-user@gcp'
              ) as EntityNodeDataModel;

              expect(userActorNode).not.to.be(undefined);
              expect(userActorNode.label).to.equal('Relationships Test User');
              expect(userActorNode.shape).to.equal('ellipse');
              expect(userActorNode.tag).to.equal('Identity');
              expect(userActorNode.icon).to.equal('user');
              expect(userActorNode!.documentsData!.length).to.equal(1);

              expectExpect(userActorNode!.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:relationships-test-user@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    availableInEntityStore: true,
                    engine_type: 'user',
                    name: 'Relationships Test User',
                    type: 'Identity',
                    sub_type: 'AWS IAM User',
                    sourceFields: expectExpect.objectContaining({
                      'user.id': 'relationships-test-user',
                    }),
                  }),
                })
              );

              const serviceTargetNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'service:Relationships Target Service'
              ) as EntityNodeDataModel;
              expect(serviceTargetNode).not.to.be(undefined);
              expect(serviceTargetNode.label).to.equal('Relationships Target Service');
              expect(serviceTargetNode.shape).to.equal('rectangle');
              expect(serviceTargetNode.tag).to.equal('Service');
              expect(serviceTargetNode.icon).to.equal('cloudStormy');
              expect(serviceTargetNode!.documentsData!.length).to.equal(1);
              expectExpect(serviceTargetNode!.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'service:Relationships Target Service',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'Relationships Target Service',
                    type: 'Service',
                    sub_type: 'AWS Lambda',
                    availableInEntityStore: true,
                    engine_type: 'service',
                    sourceFields: expectExpect.objectContaining({
                      'service.name': 'Relationships Target Service',
                    }),
                  }),
                })
              );

              const relationshipGroupedNodeTarget = response.body.nodes.find(
                (node: NodeDataModel) =>
                  node.id === 'df6a654e7a91b7a1abd7fa722d0558b81a3a109fe009bd5be8046ddb606125af'
              ) as EntityNodeDataModel;
              expect(relationshipGroupedNodeTarget).not.to.be(undefined);
              expect(relationshipGroupedNodeTarget.label).to.equal('AWS EC2 Instance');
              expect(relationshipGroupedNodeTarget.shape).to.equal('hexagon');
              expect(relationshipGroupedNodeTarget.tag).to.equal('Host');
              expect(relationshipGroupedNodeTarget.icon).to.equal('storage');

              expect(relationshipGroupedNodeTarget.documentsData!.length).to.equal(2);
              expectExpect(relationshipGroupedNodeTarget.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'host:relationships-target-host-1',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'Relationships Target Host 1',
                    type: 'Host',
                    sub_type: 'AWS EC2 Instance',
                    availableInEntityStore: true,
                    engine_type: 'host',
                  }),
                })
              );

              // Should have label nodes for events
              const labelNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'label'
              );
              expect(labelNodes.length).to.equal(1);

              // Should have relationship nodes for entity relationships (Owns)
              const relationshipNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'relationship'
              );
              expect(relationshipNodes.length).to.equal(1);

              // Verify relationship node properties
              relationshipNodes.forEach((node: NodeDataModel) => {
                expect(node.shape).to.equal('relationship');
                expect(node.label).to.equal('Owns');
              });
            });

            it('should return only relationship nodes when only entityIds are provided - grouped targets', async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [],
                    start: '2024-09-01T12:00:00.000Z',
                    end: '2024-09-01T13:00:00.000Z',
                    entityIds: [{ id: 'user:relationships-test-user@gcp', isOrigin: true }],
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200, logger));

              // Should have no label nodes (no events)
              const labelNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'label'
              );
              expect(labelNodes.length).to.equal(0);

              // Should have relationship nodes for entity relationships (Owns)
              const relationshipNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'relationship'
              );
              expect(relationshipNodes.length).to.equal(1);

              // Should have entity nodes for source and targets
              const entityNodes = response.body.nodes.filter(
                (node: NodeDataModel) =>
                  node.shape === 'ellipse' || node.shape === 'rectangle' || node.shape === 'hexagon'
              );
              expect(entityNodes.length).to.equal(2);

              const userActorNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'user:relationships-test-user@gcp'
              ) as EntityNodeDataModel;

              expect(userActorNode).not.to.be(undefined);
              expect(userActorNode.label).to.equal('Relationships Test User');
              expect(userActorNode.shape).to.equal('ellipse');
              expect(userActorNode.tag).to.equal('Identity');
              expect(userActorNode.icon).to.equal('user');
              expect(userActorNode!.documentsData!.length).to.equal(1);

              expectExpect(userActorNode!.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:relationships-test-user@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    availableInEntityStore: true,
                    engine_type: 'user',
                    name: 'Relationships Test User',
                    type: 'Identity',
                    sub_type: 'AWS IAM User',
                  }),
                })
              );

              const relationshipGroupedNodeTarget = response.body.nodes.find(
                (node: NodeDataModel) =>
                  node.id === 'df6a654e7a91b7a1abd7fa722d0558b81a3a109fe009bd5be8046ddb606125af'
              ) as EntityNodeDataModel;
              expect(relationshipGroupedNodeTarget).not.to.be(undefined);
              expect(relationshipGroupedNodeTarget.label).to.equal('AWS EC2 Instance');
              expect(relationshipGroupedNodeTarget.shape).to.equal('hexagon');
              expect(relationshipGroupedNodeTarget.tag).to.equal('Host');
              expect(relationshipGroupedNodeTarget.icon).to.equal('storage');

              expect(relationshipGroupedNodeTarget.documentsData!.length).to.equal(2);
              expectExpect(relationshipGroupedNodeTarget.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'host:relationships-target-host-1',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'Relationships Target Host 1',
                    type: 'Host',
                    sub_type: 'AWS EC2 Instance',
                    availableInEntityStore: true,
                    engine_type: 'host',
                  }),
                })
              );
            });

            it('should return multiple events with GCP targets and their relationships', async () => {
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [
                      {
                        id: 'multi-relationships-event-id-12345',
                        isAlert: false,
                      },
                    ],
                    start: '2024-09-01T12:00:00.000Z',
                    end: '2024-09-01T13:00:00.000Z',
                    esQuery: {
                      bool: {
                        filter: [
                          {
                            match_phrase: {
                              'user.id':
                                'gcp-compute-operator@my-gcp-project.iam.gserviceaccount.com',
                            },
                          },
                        ],
                      },
                    },
                    entityIds: [
                      {
                        id: 'user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp',
                        isOrigin: false,
                      },
                      {
                        id: 'host:projects/my-gcp-project/zones/us-west1-a/instances/database-server-prod-1',
                        isOrigin: false,
                      },
                    ],
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200, logger));

              expect(response.body).to.have.property('nodes').length(11);
              expect(response.body).to.have.property('edges').length(12);

              // Find the group node (stacking Owns and Communicates_with relationships from same source)
              const groupNode = response.body.nodes.find(
                (node: NodeDataModel) => node.shape === 'group'
              );
              expect(groupNode).to.be.ok();

              // Should have label nodes for events (SetIamPolicy and instances.start actions)
              const labelNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'label'
              );
              expect(labelNodes.length).to.equal(2);

              // Verify SetIamPolicy label node
              const setIamPolicyLabel = labelNodes.find(
                (node: NodeDataModel) =>
                  (node as LabelNodeDataModel).label === 'google.iam.admin.v1.SetIamPolicy'
              ) as LabelNodeDataModel;
              expect(setIamPolicyLabel).not.to.be(undefined);
              expect(setIamPolicyLabel.shape).to.equal('label');
              expect(setIamPolicyLabel.color).to.equal('primary');

              // Verify instances.start label node
              const instancesStartLabel = labelNodes.find(
                (node: NodeDataModel) =>
                  (node as LabelNodeDataModel).label === 'google.compute.instances.start'
              ) as LabelNodeDataModel;
              expect(instancesStartLabel).not.to.be(undefined);
              expect(instancesStartLabel.shape).to.equal('label');
              expect(instancesStartLabel.color).to.equal('primary');

              // Should have 3 relationship nodes for Owns and Communicates_with relationships
              const relationshipNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'relationship'
              );
              expect(relationshipNodes.length).to.equal(3);

              // Verify Owns relationship node from data-pipeline (stacked with parentId)
              const ownsNode = relationshipNodes.find(
                (node: NodeDataModel) =>
                  node.id ===
                  'rel(user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp-owns)'
              ) as RelationshipNodeDataModel;
              expect(ownsNode).not.to.be(undefined);
              expect(ownsNode.label).to.equal('Owns');
              expect(ownsNode.shape).to.equal('relationship');
              expect(ownsNode.parentId).to.equal(groupNode.id);

              // Verify communicates_with relationship node from data-pipeline (stacked with parentId)
              const dataPipelineCommunicatesWithNode = relationshipNodes.find(
                (node: NodeDataModel) =>
                  node.id ===
                  'rel(user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp-communicates_with)'
              ) as RelationshipNodeDataModel;
              expect(dataPipelineCommunicatesWithNode).not.to.be(undefined);
              expect(dataPipelineCommunicatesWithNode.label).to.equal('Communicates with');
              expect(dataPipelineCommunicatesWithNode.shape).to.equal('relationship');
              expect(dataPipelineCommunicatesWithNode.parentId).to.equal(groupNode.id);

              // Verify communicates_with relationship node from database-server (NOT stacked)
              const dbServerCommunicatesWithNode = relationshipNodes.find(
                (node: NodeDataModel) =>
                  node.id ===
                  'rel(host:projects/my-gcp-project/zones/us-west1-a/instances/database-server-prod-1-communicates_with)'
              ) as RelationshipNodeDataModel;
              expect(dbServerCommunicatesWithNode).not.to.be(undefined);
              expect(dbServerCommunicatesWithNode.label).to.equal('Communicates with');
              expect(dbServerCommunicatesWithNode.shape).to.equal('relationship');
              expect(dbServerCommunicatesWithNode.parentId).to.be(undefined);

              // Check for entity nodes - should have actors and targets
              const entityNodes = response.body.nodes.filter(
                (node: NodeDataModel) =>
                  node.shape === 'ellipse' || node.shape === 'rectangle' || node.shape === 'hexagon'
              );
              expect(entityNodes.length).to.be.greaterThan(0);

              // Verify the first actor entity (user.entity.id from first event)
              // Type: Service Account, Sub_type: GCP Service Account
              const actorNode1 = response.body.nodes.find(
                (node: NodeDataModel) =>
                  node.id === 'user:gcp-admin-user@my-gcp-project.iam.gserviceaccount.com@gcp'
              ) as EntityNodeDataModel;
              expect(actorNode1).not.to.be(undefined);
              expect(actorNode1.label).to.equal('GCP Admin User');
              expect(actorNode1.shape).to.equal('ellipse');
              expect(actorNode1.icon).to.equal('user');
              expect(actorNode1.tag).to.equal('Service Account');
              expect(actorNode1.documentsData!.length).to.equal(1);
              expectExpect(actorNode1.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:gcp-admin-user@my-gcp-project.iam.gserviceaccount.com@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    availableInEntityStore: true,
                    engine_type: 'user',
                    name: 'GCP Admin User',
                    type: 'Service Account',
                    sub_type: 'GCP Service Account',
                    sourceFields: expectExpect.objectContaining({
                      'user.id': 'gcp-admin-user@my-gcp-project.iam.gserviceaccount.com',
                    }),
                  }),
                })
              );

              // Verify the second actor entity (user.entity.id from second event)
              // Type: Identity, Sub_type: GCP IAM User
              const actorNode2 = response.body.nodes.find(
                (node: NodeDataModel) =>
                  node.id === 'user:gcp-compute-operator@my-gcp-project.iam.gserviceaccount.com@gcp'
              ) as EntityNodeDataModel;
              expect(actorNode2).not.to.be(undefined);
              expect(actorNode2.label).to.equal('GCP Compute Operator');
              expect(actorNode2.shape).to.equal('ellipse');
              expect(actorNode2.icon).to.equal('user');
              expect(actorNode2.tag).to.equal('Identity');
              expect(actorNode2.documentsData!.length).to.equal(1);
              expectExpect(actorNode2.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:gcp-compute-operator@my-gcp-project.iam.gserviceaccount.com@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    availableInEntityStore: true,
                    engine_type: 'user',
                    name: 'GCP Compute Operator',
                    type: 'Identity',
                    sub_type: 'GCP IAM User',
                    sourceFields: expectExpect.objectContaining({
                      'user.id': 'gcp-compute-operator@my-gcp-project.iam.gserviceaccount.com',
                    }),
                  }),
                })
              );

              // Verify the user target entity (user.target.id from first event — formerly service.target.entity.id)
              // Type: Service Account, Sub_type: GCP Service Account
              const serviceTargetNode = response.body.nodes.find(
                (node: NodeDataModel) =>
                  node.id === 'user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp'
              ) as EntityNodeDataModel;
              expect(serviceTargetNode).not.to.be(undefined);
              expect(serviceTargetNode.label).to.equal('data-pipeline Service Account');
              expect(serviceTargetNode.shape).to.equal('ellipse');
              expect(serviceTargetNode.icon).to.equal('user');
              expect(serviceTargetNode.tag).to.equal('Service Account');
              expect(serviceTargetNode.documentsData!.length).to.equal(1);
              expectExpect(serviceTargetNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    availableInEntityStore: true,
                    engine_type: 'user',
                    name: 'data-pipeline Service Account',
                    type: 'Service Account',
                    sub_type: 'GCP Service Account',
                    sourceFields: expectExpect.objectContaining({
                      'user.id': 'data-pipeline@my-gcp-project.iam.gserviceaccount.com',
                    }),
                  }),
                })
              );

              // Verify the host target entity (host.target.id from second event)
              // Type: Host, Sub_type: GCP Compute Instance
              const hostTargetNode = response.body.nodes.find(
                (node: NodeDataModel) =>
                  node.id ===
                  'host:projects/my-gcp-project/zones/us-west1-a/instances/database-server-prod-1'
              ) as EntityNodeDataModel;
              expect(hostTargetNode).not.to.be(undefined);
              expect(hostTargetNode.label).to.equal('database-server-prod-1');
              expect(hostTargetNode.shape).to.equal('hexagon');
              expect(hostTargetNode.icon).to.equal('storage');
              expect(hostTargetNode.tag).to.equal('Host');
              expect(hostTargetNode.documentsData!.length).to.equal(1);
              expectExpect(hostTargetNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'host:projects/my-gcp-project/zones/us-west1-a/instances/database-server-prod-1',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    availableInEntityStore: true,
                    engine_type: 'host',
                    name: 'database-server-prod-1',
                    type: 'Host',
                    sub_type: 'GCP Compute Instance',
                    sourceFields: expectExpect.objectContaining({
                      'host.id':
                        'projects/my-gcp-project/zones/us-west1-a/instances/database-server-prod-1',
                    }),
                  }),
                })
              );

              const relationshipsTargetNode = response.body.nodes.find(
                (node: NodeDataModel) =>
                  node.id === 'c7d2fb4084505889f751c7a8ffcee9eb7d836a60c2e34f751b64faf34ac0b932'
              ) as EntityNodeDataModel;
              expect(relationshipsTargetNode.label).to.equal('GCP Compute Instance');
              expect(relationshipsTargetNode.shape).to.equal('hexagon');
              expect(relationshipsTargetNode.icon).to.equal('storage');
              expect(relationshipsTargetNode.tag).to.equal('Host');
              expect(relationshipsTargetNode.count).to.equal(2);
              expect(relationshipsTargetNode.documentsData!.length).to.equal(2);

              expectExpect(relationshipsTargetNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'host:projects/my-gcp-project/zones/us-central1-a/instances/web-server-prod-1',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    availableInEntityStore: true,
                    engine_type: 'host',
                    name: 'web-server-prod-1',
                    type: 'Host',
                    sub_type: 'GCP Compute Instance',
                  }),
                })
              );
              expectExpect(relationshipsTargetNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'host:projects/my-gcp-project/zones/us-east1-b/instances/api-gateway-prod-1',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    availableInEntityStore: true,
                    engine_type: 'host',
                    name: 'api-gateway-prod-1',
                    type: 'Host',
                    sub_type: 'GCP Compute Instance',
                  }),
                })
              );
            });

            it('should return hierarchical relationships with grouped targets and events', async () => {
              // Test scenario:
              // - Root user owns 3 entities (Host, Service, Identity) - each with different type
              // - Each of those 3 entities communicates_with 2 entities of the same type
              // - Identity-1 supervises AND depends_on delegate entity (different type: User)
              // - Root user also performs an action (event) targeting host-1 and identity-1
              // - Identity-1 performs 2 different actions targeting delegate-1
              // - External-caller has Communicates_with relationship targeting identity-1
              // Expected:
              // - 9 entity nodes: root + 3 intermediate + 3 grouped targets + 1 delegate + 1 external-caller
              // - 7 relationship nodes: 1 Owns + 4 Communicates_with + 1 Supervises + 1 Depends_on
              // - 3 label nodes: 1 UpdatePolicy + 2 new events (AuditLog, UserOperation)
              // - 1 group node: stacking 2 relationships + 2 labels with same source-target pair (identity-1 → delegate-1)
              const response = await postGraph(
                supertest,
                {
                  query: {
                    originEventIds: [
                      { id: 'rel-hierarchy-event-id-12345', isAlert: false },
                      { id: 'rel-hierarchy-event-id-22222', isAlert: false },
                      { id: 'rel-hierarchy-event-id-33333', isAlert: false },
                    ],
                    start: '2024-09-01T12:00:00.000Z',
                    end: '2024-09-01T13:00:00.000Z',
                    entityIds: [
                      { id: 'user:rel-hierarchy-root-user@gcp', isOrigin: true },
                      { id: 'host:rel-hierarchy-host-1', isOrigin: false },
                      { id: 'service:Hierarchy Service 1', isOrigin: false },
                      { id: 'user:rel-hierarchy-identity-1@gcp', isOrigin: false },
                    ],
                  },
                },
                undefined,
                entitiesSpaceId
              ).expect(result(200, logger));

              // Verify label nodes count (3 event actions)
              const labelNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'label'
              );
              expect(labelNodes.length).to.equal(3);

              // Verify the original UpdatePolicy label node
              const updatePolicyLabel = labelNodes.find(
                (node: LabelNodeDataModel) => node.label === 'google.iam.admin.v1.UpdatePolicy'
              ) as LabelNodeDataModel;
              expect(updatePolicyLabel).not.to.be(undefined);
              expect(updatePolicyLabel.color).to.equal('primary');
              expect(updatePolicyLabel.shape).to.equal('label');

              // Verify the two new label nodes (from identity-1 to delegate-1)
              const auditLogLabel = labelNodes.find(
                (node: LabelNodeDataModel) => node.label === 'google.admin.reports.v1.AuditLog'
              ) as LabelNodeDataModel;
              expect(auditLogLabel).not.to.be(undefined);
              expect(auditLogLabel.color).to.equal('primary');

              const userOperationLabel = labelNodes.find(
                (node: LabelNodeDataModel) =>
                  node.label === 'google.admin.directory.v1.UserOperation'
              ) as LabelNodeDataModel;
              expect(userOperationLabel).not.to.be(undefined);
              expect(userOperationLabel.color).to.equal('primary');

              // Verify entity nodes count
              const entityNodes = response.body.nodes.filter(
                (node: NodeDataModel) =>
                  node.shape === 'ellipse' || node.shape === 'rectangle' || node.shape === 'hexagon'
              );
              // 1 root + 3 intermediate (host, service, identity) + 3 grouped targets + 1 delegate + 1 external-caller = 9
              expect(entityNodes.length).to.equal(9);

              // Verify relationship nodes count
              const relationshipNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'relationship'
              );
              // 1 Owns + 3 Communicates_with (original) + 1 Communicates_with (external-caller) + 1 Supervises + 1 Depends_on = 7
              expect(relationshipNodes.length).to.equal(7);

              // Verify group node exists (stacking 2 relationships + 2 labels with same source-target pair: identity-1 → delegate-1)
              const groupNodes = response.body.nodes.filter(
                (node: NodeDataModel) => node.shape === 'group'
              );
              expect(groupNodes.length).to.equal(1);
              const groupNode = groupNodes[0];

              // Verify the two label nodes are stacked in the group
              expect(auditLogLabel.parentId).to.equal(groupNode.id);
              expect(userOperationLabel.parentId).to.equal(groupNode.id);

              // Verify UpdatePolicy label is NOT stacked (different source-target pair)
              expect(updatePolicyLabel.parentId).to.be(undefined);

              // Verify the Supervises and Depends_on relationship nodes are stacked in the same group
              const supervisesNode = relationshipNodes.find(
                (node: NodeDataModel) => (node as RelationshipNodeDataModel).label === 'Supervises'
              ) as RelationshipNodeDataModel;
              expect(supervisesNode.parentId).to.equal(groupNode.id);

              const dependsOnNode = relationshipNodes.find(
                (node: NodeDataModel) => (node as RelationshipNodeDataModel).label === 'Depends on'
              ) as RelationshipNodeDataModel;
              expect(dependsOnNode).not.to.be(undefined);
              expect(dependsOnNode.parentId).to.equal(groupNode.id);

              // Total nodes: 9 entity + 7 relationship + 3 label + 1 group = 20
              expect(response.body).to.have.property('nodes').length(20);

              // Edges calculation:
              // root -> Owns -> (host, service, identity) = 1 + 3 = 4 edges
              // host -> Communicates_with -> storage_grouped = 2 edges
              // service -> Communicates_with -> database_grouped = 2 edges
              // identity -> Communicates_with -> network_grouped = 2 edges
              // external-caller -> Communicates_with -> identity = 2 edges
              // root -> UpdatePolicy label -> (host, identity) = 1 + 2 = 3 edges
              // identity -> group -> delegate = 2 edges
              // Group internal edges: group↔AuditLog, group↔UserOperation, group↔Supervises, group↔Depends_on = 8 edges
              // Total: 4 + 2 + 2 + 2 + 2 + 3 + 2 + 8 = 25 edges
              expect(response.body).to.have.property('edges').length(25);

              // Verify root user node
              const rootNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'user:rel-hierarchy-root-user@gcp'
              ) as EntityNodeDataModel;
              expect(rootNode).not.to.be(undefined);
              expect(rootNode.label).to.equal('Hierarchy Root User');
              expect(rootNode.shape).to.equal('ellipse');
              expect(rootNode.tag).to.equal('Identity');
              expect(rootNode.icon).to.equal('user');
              expect(rootNode.documentsData!.length).to.equal(1);
              expectExpect(rootNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:rel-hierarchy-root-user@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'Hierarchy Root User',
                    type: 'Identity',
                    sub_type: 'AWS IAM User',
                    availableInEntityStore: true,
                    engine_type: 'user',
                    sourceFields: expectExpect.objectContaining({
                      'user.id': 'rel-hierarchy-root-user',
                    }),
                  }),
                })
              );

              // Verify intermediate host node
              const hostNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'host:rel-hierarchy-host-1'
              ) as EntityNodeDataModel;
              expect(hostNode).not.to.be(undefined);
              expect(hostNode.label).to.equal('Hierarchy Host 1');
              expect(hostNode.shape).to.equal('hexagon');
              expect(hostNode.tag).to.equal('Host');
              expect(hostNode.icon).to.equal('storage');
              expect(hostNode.count).to.be(undefined); // Single entity, no count
              expectExpect(hostNode.ips).toEqual(['10.0.1.100']);

              // Verify intermediate service node
              const serviceNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'service:Hierarchy Service 1'
              ) as EntityNodeDataModel;
              expect(serviceNode).not.to.be(undefined);
              expect(serviceNode.label).to.equal('Hierarchy Service 1');
              expect(serviceNode.shape).to.equal('rectangle');
              expect(serviceNode.tag).to.equal('Service');
              expect(serviceNode.icon).to.equal('cloudStormy');
              expect(serviceNode.count).to.be(undefined);

              // Verify intermediate identity node (different from root - AWS IAM Role)
              const identityNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'user:rel-hierarchy-identity-1@gcp'
              ) as EntityNodeDataModel;
              expect(identityNode).not.to.be(undefined);
              expect(identityNode.label).to.equal('Hierarchy Identity 1');
              expect(identityNode.shape).to.equal('ellipse');
              expect(identityNode.tag).to.equal('Identity');
              expect(identityNode.icon).to.equal('user');
              expect(identityNode.count).to.be(undefined);

              // Verify grouped storage target (2 S3 buckets with same type/subtype)
              const storageGroupedNode = entityNodes.find(
                (node: EntityNodeDataModel) => node.tag === 'Storage' && node.count === 2
              ) as EntityNodeDataModel;
              expect(storageGroupedNode).not.to.be(undefined);
              expect(storageGroupedNode.label).to.equal('AWS S3 Bucket'); // Shows sub_type for grouped
              expect(storageGroupedNode.shape).to.equal('rectangle');
              expect(storageGroupedNode.documentsData!.length).to.equal(2);
              expectExpect(storageGroupedNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'rel-hierarchy-storage-1',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'Hierarchy Storage Bucket 1',
                    type: 'Storage',
                    sub_type: 'AWS S3 Bucket',
                  }),
                })
              );
              expectExpect(storageGroupedNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'rel-hierarchy-storage-2',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'Hierarchy Storage Bucket 2',
                    type: 'Storage',
                    sub_type: 'AWS S3 Bucket',
                  }),
                })
              );

              // Verify grouped database target (2 RDS instances with same type/subtype)
              const databaseGroupedNode = entityNodes.find(
                (node: EntityNodeDataModel) => node.tag === 'Database' && node.count === 2
              ) as EntityNodeDataModel;
              expect(databaseGroupedNode).not.to.be(undefined);
              expect(databaseGroupedNode.label).to.equal('AWS RDS Instance');
              expect(databaseGroupedNode.shape).to.equal('rectangle');
              expect(databaseGroupedNode.documentsData!.length).to.equal(2);

              // Verify grouped network target (2 VPCs with same type/subtype)
              const networkGroupedNode = entityNodes.find(
                (node: EntityNodeDataModel) => node.tag === 'Networking' && node.count === 2
              ) as EntityNodeDataModel;
              expect(networkGroupedNode).not.to.be(undefined);
              expect(networkGroupedNode.label).to.equal('AWS VPC');
              expect(networkGroupedNode.shape).to.equal('rectangle');
              expect(networkGroupedNode.icon).to.equal('globe');
              expectExpect(networkGroupedNode.ips).toEqual(
                expectExpect.arrayContaining(['172.16.0.1', '172.16.0.2'])
              );

              expect(networkGroupedNode.documentsData!.length).to.equal(2);

              // Verify delegate node (different type: User, sub_type: AWS Organizations Admin)
              const delegateNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'user:rel-hierarchy-delegate-1@gcp'
              ) as EntityNodeDataModel;
              expect(delegateNode).not.to.be(undefined);
              expect(delegateNode.label).to.equal('Hierarchy Delegate Agent');
              expect(delegateNode.shape).to.equal('ellipse');
              expect(delegateNode.tag).to.equal('User');
              expect(delegateNode.icon).to.equal('user');
              expect(delegateNode.count).to.be(undefined); // Single entity
              expect(delegateNode.documentsData!.length).to.equal(1);
              expectExpect(delegateNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'user:rel-hierarchy-delegate-1@gcp',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'Hierarchy Delegate Agent',
                    type: 'User',
                    sub_type: 'AWS Organizations Admin',
                    availableInEntityStore: true,
                    engine_type: 'user',
                    sourceFields: expectExpect.objectContaining({
                      'user.id': 'rel-hierarchy-delegate-1',
                    }),
                  }),
                })
              );

              // Verify external-caller entity (has Communicates_with relationship to identity-1)
              const externalCallerNode = response.body.nodes.find(
                (node: NodeDataModel) => node.id === 'service:Hierarchy External Caller'
              ) as EntityNodeDataModel;
              expect(externalCallerNode).not.to.be(undefined);
              expect(externalCallerNode.label).to.equal('Hierarchy External Caller');
              expect(externalCallerNode.shape).to.equal('rectangle');
              expect(externalCallerNode.tag).to.equal('Service');
              expect(externalCallerNode.icon).to.equal('cloudStormy');
              expect(externalCallerNode.count).to.be(undefined);
              expect(externalCallerNode.documentsData!.length).to.equal(1);
              expectExpect(externalCallerNode.documentsData).toContainEqual(
                expectExpect.objectContaining({
                  id: 'service:Hierarchy External Caller',
                  type: 'entity',
                  entity: expectExpect.objectContaining({
                    name: 'Hierarchy External Caller',
                    type: 'Service',
                    sub_type: 'AWS Lambda Function',
                    availableInEntityStore: true,
                    engine_type: 'service',
                  }),
                })
              );

              // Verify Owns relationship node (1 node connecting root to 3 different target types)
              const ownsNodes = relationshipNodes.filter(
                (node: NodeDataModel) => (node as RelationshipNodeDataModel).label === 'Owns'
              );
              expect(ownsNodes.length).to.equal(1);
              expect(ownsNodes[0].shape).to.equal('relationship');

              // Verify Communicates_with relationship nodes (4 nodes - 3 from intermediate entities + 1 from external-caller)
              const communicatesWithNodes = relationshipNodes.filter(
                (node: NodeDataModel) =>
                  (node as RelationshipNodeDataModel).label === 'Communicates with'
              );
              expect(communicatesWithNodes.length).to.equal(4);
              communicatesWithNodes.forEach((node: NodeDataModel) => {
                expect(node.shape).to.equal('relationship');
              });

              // Verify the external-caller's Communicates_with relationship node (NOT stacked)
              const externalCallerRelNode = communicatesWithNodes.find(
                (node: NodeDataModel) =>
                  node.id === 'rel(service:Hierarchy External Caller-communicates_with)'
              ) as RelationshipNodeDataModel;
              expect(externalCallerRelNode).not.to.be(undefined);
              expect(externalCallerRelNode.parentId).to.be(undefined);

              // Verify Supervises relationship node count (1 node connecting identity-1 to delegate)
              const supervisesNodes = relationshipNodes.filter(
                (node: NodeDataModel) => (node as RelationshipNodeDataModel).label === 'Supervises'
              );
              expect(supervisesNodes.length).to.equal(1);
              expect(supervisesNodes[0].shape).to.equal('relationship');

              // Verify edges
              response.body.edges.forEach((edge: EdgeDataModel) => {
                expect(edge).to.have.property('color');
                expect(edge.color).equal('subdued');
                expect(edge.type).equal('solid');
              });
            });

            it('should isolate the pinned origin entity and produce correct grouping when showing relationships of a target', async () => {
              // Scenario: user opens the entity flyout for origin-pinned-server (origin/pinned).
              // Then clicks "show entity relationships" on relationship-target-server.
              // The graph API receives:
              //   entityIds: [origin-pinned-server (isOrigin:true), relationship-target-server (isOrigin:false)]
              //   pinnedIds: ['host:origin-pinned-server']
              //
              // origin-pinned-server, grouped-actor-server-1, grouped-actor-server-2 share type "Linux Server" /
              // sub_type "AWS EC2 Instance", all communicating with relationship-target-server.
              // different-subtype-actor-server also communicates with relationship-target-server but has a different
              // sub_type ("GCP Compute Instance").
              //
              // Expected nodes:
              //   - origin-pinned-server: single entity node (pinned → never merged)
              //   - grouped-actor-server-1 + grouped-actor-server-2: grouped entity node (count=2, same type/subtype)
              //   - different-subtype-actor-server: single entity node (different subtype)
              //   - relationship-target-server: single target entity node
              //   - 3 relationship nodes (communicates_with):
              //       one for origin-pinned-server alone (pinned),
              //       one for the grouped-actor-server-1/2 merged group,
              //       one for different-subtype-actor-server (different subtype)
              await retry.tryForTime(enrichmentRetryTimeout, async () => {
                const response = await postGraph(
                  supertest,
                  {
                    query: {
                      originEventIds: [],
                      start: '2024-09-01T00:00:00Z',
                      end: '2024-09-02T00:00:00Z',
                      entityIds: [
                        { id: 'host:origin-pinned-server', isOrigin: true },
                        { id: 'host:relationship-target-server', isOrigin: false },
                      ],
                      pinnedIds: ['host:origin-pinned-server'],
                    },
                  },
                  undefined,
                  entitiesSpaceId
                ).expect(result(200, logger));

                const entityNodes = response.body.nodes.filter(
                  (node: NodeDataModel) =>
                    node.shape === 'ellipse' ||
                    node.shape === 'rectangle' ||
                    node.shape === 'hexagon'
                ) as EntityNodeDataModel[];

                // 4 entity nodes total: origin-pinned-server (single), grouped-actor-server-1+3 (grouped),
                // different-subtype-actor-server (single, different subtype), relationship-target-server (target)
                expect(entityNodes.length).to.equal(4);

                // origin-pinned-server must be a solo node (pinned → isolated from the merged group)
                const pinnedOriginNode = entityNodes.find(
                  (node) => node.id === 'host:origin-pinned-server'
                ) as EntityNodeDataModel;
                expect(pinnedOriginNode).not.to.be(undefined);
                expect(pinnedOriginNode.count).to.be(undefined);

                // grouped-actor-server-1 and grouped-actor-server-2 collapse into one grouped node (count=2)
                const groupedActorNode = entityNodes.find(
                  (node) => node.count === 2
                ) as EntityNodeDataModel;
                expect(groupedActorNode).not.to.be(undefined);
                expect(groupedActorNode.tag).to.equal('Linux Server');
                const groupedIds = (groupedActorNode.documentsData ?? [])
                  .map((doc) => doc.id)
                  .sort();
                expect(groupedIds).to.eql(
                  ['host:grouped-actor-server-1', 'host:grouped-actor-server-2'].sort()
                );

                // different-subtype-actor-server is a solo node (different sub_type → separate group)
                const differentSubtypeNode = entityNodes.find(
                  (node) => node.id === 'host:different-subtype-actor-server'
                ) as EntityNodeDataModel;
                expect(differentSubtypeNode).not.to.be(undefined);
                expect(differentSubtypeNode.count).to.be(undefined);

                // relationship-target-server is the single target
                const targetNode = entityNodes.find(
                  (node) => node.id === 'host:relationship-target-server'
                ) as EntityNodeDataModel;
                expect(targetNode).not.to.be(undefined);

                // 3 relationship nodes: one per distinct actor group
                const relationshipNodes = response.body.nodes.filter(
                  (node: NodeDataModel) => node.shape === 'relationship'
                );
                expect(relationshipNodes.length).to.equal(3);
                relationshipNodes.forEach((node: RelationshipNodeDataModel) => {
                  expect(node.label).to.equal('Communicates with');
                });
              });
            });

            it('should produce one relationship node when two actors of the same type share the same relationship', async () => {
              await retry.tryForTime(enrichmentRetryTimeout, async () => {
                const response = await postGraph(
                  supertest,
                  {
                    query: {
                      originEventIds: [],
                      start: '2024-09-01T00:00:00Z',
                      end: '2024-09-02T00:00:00Z',
                      entityIds: [
                        { id: 'host:over-split-actor-1', isOrigin: true },
                        { id: 'host:over-split-actor-2', isOrigin: false },
                      ],
                    },
                  },
                  undefined,
                  entitiesSpaceId
                ).expect(result(200, logger));

                // Both actors are "Host / Linux Host" with communicates_with → host:over-split-target.
                // Before the fix: 2 relationship nodes. After the fix: 1 merged relationship node.
                const relationshipNodes = response.body.nodes.filter(
                  (node: NodeDataModel) => node.shape === 'relationship'
                );
                expect(relationshipNodes.length).to.equal(1);
                expect(relationshipNodes[0].label).to.equal('Communicates with');

                // The merged actor node has count=2 (both actors collapsed)
                const entityNodes = response.body.nodes.filter(
                  (node: NodeDataModel) =>
                    node.shape === 'ellipse' ||
                    node.shape === 'rectangle' ||
                    node.shape === 'hexagon'
                );
                const actorNode = entityNodes.find(
                  (node: EntityNodeDataModel) => node.count === 2
                ) as EntityNodeDataModel;
                expect(actorNode).not.to.be(undefined);
                expect(actorNode.tag).to.equal('Host');

                // Target node is a single entity (no merge needed)
                const targetNode = entityNodes.find(
                  (node: NodeDataModel) => node.id === 'host:over-split-target'
                ) as EntityNodeDataModel;
                expect(targetNode).not.to.be(undefined);
              });
            });
          });
        });
      });

      describe('Without new ECS field mappings in alerts', () => {
        before(async () => {
          // security_alerts - contains ONLY legacy fields (actor.entity.id, target.entity.id)
          // Since we only query for new ECS fields, alerts without them won't be found
          await loadAlertArchive({
            es,
            esArchiver,
            logger,
            archivePath:
              'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/security_alerts',
          });
          await esArchiver.load(
            'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/logs_gcp_audit'
          );
        });

        after(async () => {
          // Using unload destroys index's alias of .alerts-security.alerts-default which causes a failure in other tests
          // Instead we delete all alerts from the index
          await es.deleteByQuery({
            index: '.internal.alerts-*',
            query: { match_all: {} },
            conflicts: 'proceed',
          });
          await esArchiver.unload(
            'x-pack/solutions/security/test/cloud_security_posture_api/es_archives/logs_gcp_audit'
          );
        });

        it('should not return alerts that only have legacy fields (no new ECS fields)', async () => {
          const response = await postGraph(supertest, {
            query: {
              originEventIds: [{ id: 'kabcd1234efgh5678', isAlert: false }],
              start: '2024-09-01T12:30:00.000Z||-30m',
              end: '2024-09-01T12:30:00.000Z||+30m',
            },
          }).expect(result(200));

          expect(response.body).to.have.property('nodes').length(3);
          expect(response.body).to.have.property('edges').length(2);
          expect(response.body).not.to.have.property('messages');

          response.body.nodes.forEach((node: EntityNodeDataModel | LabelNodeDataModel) => {
            expect(node).to.have.property('color');
            expect(node.color).equal(
              'primary',
              `node color mismatched [node: ${node.id}] [actual: ${node.color}]`
            );
            if (node.shape === 'label') {
              expect(node.documentsData).to.have.length(1);
              expectExpect(node.documentsData).not.toContainEqual(
                expectExpect.objectContaining({
                  type: 'alert',
                  alert: { ruleName: 'GCP IAM Custom Role Creation' },
                })
              );
            }
          });

          response.body.edges.forEach((edge: EdgeDataModel) => {
            expect(edge).to.have.property('color');
            expect(edge.color).equal(
              'subdued',
              `edge color mismatched [edge: ${edge.id}] [actual: ${edge.color}]`
            );
            expect(edge.type).equal('solid');
          });
        });
      });
    });
  });
}
