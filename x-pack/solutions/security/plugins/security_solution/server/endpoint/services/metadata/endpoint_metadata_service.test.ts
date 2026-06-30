/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { uniq } from 'lodash';
import type { EndpointMetadataServiceTestContextMock } from './mocks';
import { createEndpointMetadataServiceTestContextMock } from './mocks';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import type { ElasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import {
  legacyMetadataSearchResponseMock,
  unitedMetadataSearchResponseMock,
} from '../../routes/metadata/support/test_support';
import { EndpointDocGenerator } from '../../../../common/endpoint/generate_data';
import {
  buildUnitedIndexQuery,
  getESQueryHostMetadataByFleetAgentIds,
  getESQueryHostMetadataByIDs,
} from '../../routes/metadata/query_builders';
import type { HostMetadata } from '../../../../common/endpoint/types';
import type { Agent, PackagePolicy } from '@kbn/fleet-plugin/common';
import type { AgentPolicyServiceInterface } from '@kbn/fleet-plugin/server/services';
import { createAppContextStartContractMock as fleetCreateAppContextStartContractMock } from '@kbn/fleet-plugin/server/mocks';
import { appContextService as fleetAppContextService } from '@kbn/fleet-plugin/server/services';
import { EndpointError } from '../../../../common/endpoint/errors';
import type { SavedObjectsClientContract } from '@kbn/core/server';

describe('EndpointMetadataService', () => {
  let testMockedContext: EndpointMetadataServiceTestContextMock;
  let metadataService: EndpointMetadataServiceTestContextMock['endpointMetadataService'];
  let esClient: ElasticsearchClientMock;
  let soClient: SavedObjectsClientContract;
  let endpointDocGenerator: EndpointDocGenerator;

  beforeEach(() => {
    endpointDocGenerator = new EndpointDocGenerator('seed');
    testMockedContext = createEndpointMetadataServiceTestContextMock();
    metadataService = testMockedContext.endpointMetadataService;
    esClient = testMockedContext.esClient;
    soClient = savedObjectsClientMock.create();
    soClient.find = jest.fn().mockResolvedValue({ saved_objects: [] });
    fleetAppContextService.start(
      fleetCreateAppContextStartContractMock({}, false, {
        withoutSpaceExtensions: soClient,
      })
    );
  });

  describe('#findHostMetadataForFleetAgents()', () => {
    let fleetAgentIds: string[];
    let endpointMetadataDoc: HostMetadata;

    beforeEach(() => {
      fleetAgentIds = ['one', 'two'];
      endpointMetadataDoc = endpointDocGenerator.generateHostMetadata();
      esClient.search.mockResponse(legacyMetadataSearchResponseMock(endpointMetadataDoc));
    });

    it('should call elasticsearch with proper filter', async () => {
      await metadataService.findHostMetadataForFleetAgents(fleetAgentIds);
      expect(esClient.search).toHaveBeenCalledWith(
        { ...getESQueryHostMetadataByFleetAgentIds(fleetAgentIds), size: fleetAgentIds.length },
        { ignore: [404] }
      );
    });

    it('should throw a wrapped elasticsearch Error when one occurs', async () => {
      esClient.search.mockRejectedValue(new Error('foo bar'));
      await expect(metadataService.findHostMetadataForFleetAgents(fleetAgentIds)).rejects.toThrow(
        EndpointError
      );
    });

    it('should return an array of Host Metadata documents', async () => {
      const response = await metadataService.findHostMetadataForFleetAgents(fleetAgentIds);
      expect(response).toEqual([endpointMetadataDoc]);
    });

    it('should validate agent is visible in current space', async () => {
      const data = testMockedContext.applyMetadataMocks(
        testMockedContext.esClient,
        testMockedContext.fleetServices
      );
      await metadataService.findHostMetadataForFleetAgents([data.unitedMetadata.agent.id]);

      expect(testMockedContext.fleetServices.ensureInCurrentSpace).toHaveBeenCalledWith({
        agentIds: [data.unitedMetadata.agent.id],
      });
    });
  });

  describe('#getHostMetadataList', () => {
    let agentPolicyServiceMock: jest.Mocked<AgentPolicyServiceInterface>;

    beforeEach(() => {
      agentPolicyServiceMock = testMockedContext.agentPolicyService;
    });

    it('should throw wrapped error if es error', async () => {
      esClient.search.mockRejectedValue({});
      const metadataListResponse = metadataService.getHostMetadataList({
        page: 0,
        pageSize: 10,
        kuery: '',
        hostStatuses: [],
      });
      await expect(metadataListResponse).rejects.toThrow(EndpointError);
    });

    it('should not throw if index not found', async () => {
      esClient.search.mockRejectedValue({
        meta: { body: { error: { type: 'index_not_found_exception' } } },
      });
      const metadataListResponse = await metadataService.getHostMetadataList({
        page: 0,
        pageSize: 10,
        kuery: '',
        hostStatuses: [],
      });

      expect(metadataListResponse).toEqual({
        data: [],
        total: 0,
      });
    });

    it('should correctly list HostMetadata', async () => {
      const policyId = 'test-agent-policy-id';
      const packagePolicies = [
        Object.assign(endpointDocGenerator.generatePolicyPackagePolicy(), {
          id: 'test-package-policy-id',
          policy_ids: [policyId],
          revision: 1,
        }),
      ];
      const packagePolicyIds = uniq(packagePolicies.flatMap((policy) => policy.policy_ids));
      const agentPolicies = [
        Object.assign(endpointDocGenerator.generateAgentPolicy(), {
          id: policyId,
          revision: 2,
          package_policies: packagePolicies,
        }),
      ];

      const newDate = new Date();
      const agentPolicyIds = agentPolicies.map((policy) => policy.id);
      const endpointMetadataDoc = endpointDocGenerator.generateHostMetadata(newDate.getTime());
      const mockAgent = {
        policy_id: agentPolicies[0].id,
        policy_revision: agentPolicies[0].revision,
        last_checkin: newDate.toISOString(),
      } as unknown as Agent;
      const mockDoc = unitedMetadataSearchResponseMock(endpointMetadataDoc, mockAgent);
      esClient.search.mockResponse(mockDoc);
      agentPolicyServiceMock.getByIds.mockResolvedValue(agentPolicies);
      testMockedContext.packagePolicyService.list.mockImplementation(async (_, { page }) => {
        const response = {
          items: packagePolicies,
          page: page ?? 1,
          total: packagePolicies.length,
          perPage: packagePolicies.length,
        };

        if ((page ?? 1) > 1) {
          response.items = [];
        }

        return response;
      });

      const queryOptions = { page: 1, pageSize: 10, kuery: '', hostStatuses: [] };
      const metadataListResponse = await metadataService.getHostMetadataList(queryOptions);
      const unitedIndexQuery = await buildUnitedIndexQuery(
        soClient,
        queryOptions,
        packagePolicyIds
      );

      expect(unitedIndexQuery.runtime_mappings?.status).toBeDefined();
      // @ts-expect-error runtime_mappings is not typed
      unitedIndexQuery.runtime_mappings.status.script.source = expect.any(String);

      expect(esClient.search).toBeCalledWith(unitedIndexQuery);
      expect(agentPolicyServiceMock.getByIds).toBeCalledWith(expect.anything(), agentPolicyIds);
      expect(metadataListResponse).toEqual({
        data: [
          {
            metadata: endpointMetadataDoc,
            host_status: 'healthy',
            policy_info: {
              agent: {
                applied: {
                  id: mockAgent.policy_id,
                  revision: mockAgent.policy_revision,
                },
                configured: {
                  id: agentPolicies[0].id,
                  revision: agentPolicies[0].revision,
                },
              },
              endpoint: {
                id: packagePolicies[0].id,
                revision: packagePolicies[0].revision,
              },
            },
            last_checkin: newDate.toISOString(),
          },
        ],
        total: 1,
      });
    });
  });

  describe('#getAllEndpointPackagePolicies', () => {
    it('gets all endpoint package policies', async () => {
      const mockPolicy: PackagePolicy = {
        id: '1',
        policy_id: 'test-id-1',
      } as PackagePolicy;
      const mockPackagePolicyService = testMockedContext.packagePolicyService;
      mockPackagePolicyService.list.mockResolvedValueOnce({
        items: [mockPolicy],
        total: 1,
        perPage: 10,
        page: 1,
      });

      const endpointPackagePolicies = await metadataService.getAllEndpointPackagePolicies();
      const expected: PackagePolicy[] = [mockPolicy];
      expect(endpointPackagePolicies).toEqual(expected);
    });
  });

  describe('#getHostMetadata()', () => {
    it('should validate agent is visible in current space', async () => {
      const data = testMockedContext.applyMetadataMocks(
        testMockedContext.esClient,
        testMockedContext.fleetServices
      );
      await metadataService.getHostMetadata(data.unitedMetadata.agent.id);

      expect(testMockedContext.fleetServices.ensureInCurrentSpace).toHaveBeenCalledWith({
        agentIds: [data.unitedMetadata.agent.id],
      });
    });
  });

  describe('#getMetadataForEndpoints()', () => {
    it('should call Elastic Search with correct `size`', async () => {
      testMockedContext.applyMetadataMocks(
        testMockedContext.esClient,
        testMockedContext.fleetServices
      );
      const agentIds = Array.from({ length: 25 }, () => Math.random().toString(32));

      await metadataService.getMetadataForEndpoints(agentIds);

      expect(testMockedContext.esClient.search).toBeCalledWith({
        ...getESQueryHostMetadataByIDs(agentIds),
        size: agentIds.length,
      });
    });

    it('should validate agent is visible in current space', async () => {
      const data = testMockedContext.applyMetadataMocks(
        testMockedContext.esClient,
        testMockedContext.fleetServices
      );
      await metadataService.getMetadataForEndpoints([data.unitedMetadata.agent.id]);

      expect(testMockedContext.fleetServices.ensureInCurrentSpace).toHaveBeenCalledWith({
        agentIds: [data.unitedMetadata.agent.id],
      });
    });

    it('should query the CCS-prefixed index when ccsEnabled is true', async () => {
      const data = testMockedContext.applyMetadataMocks(
        testMockedContext.esClient,
        testMockedContext.fleetServices
      );
      await metadataService.getMetadataForEndpoints([data.unitedMetadata.agent.id], true);

      const expectedQuery = getESQueryHostMetadataByIDs([data.unitedMetadata.agent.id], true);
      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ index: expectedQuery.index })
      );
    });
  });
});
