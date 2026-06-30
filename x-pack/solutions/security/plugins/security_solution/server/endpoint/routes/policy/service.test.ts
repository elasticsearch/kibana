/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GetPolicyResponseSchema } from '../../../../common/api/endpoint';
import { getESQueryPolicyResponseByAgentID, getPolicyResponseByAgentId } from './service';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import type { ElasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import type { EndpointInternalFleetServicesInterfaceMocked } from '../../services/fleet/endpoint_fleet_services_factory.mocks';
import { createEndpointFleetServicesFactoryMock } from '../../services/fleet/endpoint_fleet_services_factory.mocks';
import { applyEsClientSearchMock } from '../../mocks/utils.mock';
import { policyIndexPattern } from '../../../../common/endpoint/constants';
import { EndpointPolicyResponseGenerator } from '../../../../common/endpoint/data_generators/endpoint_policy_response_generator';

describe('Policy Response Services', () => {
  describe('test policy handlers schema', () => {
    it('validate that get policy response query schema', async () => {
      expect(
        GetPolicyResponseSchema.query.validate({
          agentId: 'id',
        })
      ).toBeTruthy();

      expect(() => GetPolicyResponseSchema.query.validate({})).toThrowError();
    });
  });

  describe('test policy query', () => {
    it('queries for the correct host', async () => {
      const agentId = 'f757d3c0-e874-11ea-9ad9-015510b487f4';
      const query = getESQueryPolicyResponseByAgentID(agentId, 'anyindex');
      expect(query.query?.bool?.filter).toEqual({ term: { 'agent.id': agentId } });
    });

    it('filters out initial policy by ID', async () => {
      const query = getESQueryPolicyResponseByAgentID(
        'f757d3c0-e874-11ea-9ad9-015510b487f4',
        'anyindex'
      );
      expect(query.query?.bool?.must_not).toEqual({
        term: {
          'Endpoint.policy.applied.id': '00000000-0000-0000-0000-000000000000',
        },
      });
    });
  });

  describe('getPolicyResponseByAgentId()', () => {
    let esClientMock: ElasticsearchClientMock;
    let fleetServicesMock: EndpointInternalFleetServicesInterfaceMocked;

    beforeEach(() => {
      esClientMock = elasticsearchServiceMock.createElasticsearchClient();
      fleetServicesMock = createEndpointFleetServicesFactoryMock().service.asInternalUser();

      applyEsClientSearchMock({
        esClientMock,
        index: policyIndexPattern,
        response: EndpointPolicyResponseGenerator.toEsSearchResponse([
          EndpointPolicyResponseGenerator.toEsSearchHit(
            new EndpointPolicyResponseGenerator('seed').generate({ agent: { id: '1-2-3' } })
          ),
        ]),
      });
    });

    it('should search using the agent id provided on input', async () => {
      await getPolicyResponseByAgentId('1-2-3', esClientMock, fleetServicesMock, false);

      expect(esClientMock.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.objectContaining({
                term: expect.objectContaining({
                  'agent.id': '1-2-3',
                }),
              }),
            }),
          }),
        })
      );
    });

    it('should search using the CCS-prefixed policy index when ccs is enabled', async () => {
      await getPolicyResponseByAgentId('1-2-3', esClientMock, fleetServicesMock, true);

      expect(esClientMock.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: `${policyIndexPattern},*:${policyIndexPattern}`,
        })
      );
    });

    it('should validate that agent id is in current space', async () => {
      await getPolicyResponseByAgentId('1-2-3', esClientMock, fleetServicesMock, false);

      expect(fleetServicesMock.ensureInCurrentSpace).toHaveBeenCalledWith({ agentIds: ['1-2-3'] });
    });
  });
});
