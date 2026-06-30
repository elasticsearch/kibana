/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type * as http from 'http';
import expect from '@kbn/expect';
import { type Agent, FLEET_ELASTIC_AGENT_PACKAGE, AGENTS_INDEX } from '@kbn/fleet-plugin/common';

import type { FtrProviderContext } from '../../../api_integration/ftr_provider_context';
import { setupMockServer } from './helpers/mock_agentless_api';

export default function ({ getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const supertest = getService('supertest');
  const es = getService('es');
  const mockAgentlessApiService = setupMockServer();
  let elasticAgentpkgVersion: string;

  describe('fleet_list_agent', () => {
    let mockApiServer: http.Server;

    before(async () => {
      mockApiServer = await mockAgentlessApiService.listen(8089); // Start the agentless api mock server on port 8089
      // Ensure fleet default outputs are setup
      await supertest.post(`/api/fleet/setup`).set('kbn-xsrf', 'xxxx').expect(200);
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/fleet/agents');
      const getPkRes = await supertest
        .get(`/api/fleet/epm/packages/${FLEET_ELASTIC_AGENT_PACKAGE}`)
        .set('kbn-xsrf', 'xxxx')
        .expect(200);
      elasticAgentpkgVersion = getPkRes.body.item.version;
      // Install latest version of the package
      await supertest
        .post(`/api/fleet/epm/packages/${FLEET_ELASTIC_AGENT_PACKAGE}/${elasticAgentpkgVersion}`)
        .send({
          force: true,
        })
        .set('kbn-xsrf', 'xxxx')
        .expect(200);
    });
    after(async () => {
      mockApiServer.close();
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/fleet/agents');
      await supertest
        .delete(`/api/fleet/epm/packages/${FLEET_ELASTIC_AGENT_PACKAGE}/${elasticAgentpkgVersion}`)
        .set('kbn-xsrf', 'xxxx');
      try {
        await es.transport.request({
          method: 'DELETE',
          path: `/_data_stream/metrics-elastic_agent.elastic_agent-default`,
        });
      } catch (e) {
        // ignore
      }
      try {
        await es.transport.request({
          method: 'DELETE',
          path: `/_data_stream/metrics-collectortelemetry.otel-default`,
        });
      } catch (e) {
        // ignore
      }
    });

    it('should return the list of agents when requesting as admin', async () => {
      const { body: apiResponse } = await supertest.get(`/api/fleet/agents`).expect(200);

      expect(apiResponse).to.have.keys('page', 'total', 'items');
      expect(apiResponse.total).to.eql(4);
    });

    it('should return 200 if the passed kuery is valid', async () => {
      await supertest
        .get(`/api/fleet/agents?kuery=fleet-agents.local_metadata.host.hostname:test`)
        .set('kbn-xsrf', 'xxxx')
        .expect(200);
    });

    it('should return 200 also if the passed kuery does not have prefix fleet-agents', async () => {
      await supertest
        .get(`/api/fleet/agents?kuery=local_metadata.host.hostname:test`)
        .set('kbn-xsrf', 'xxxx')
        .expect(200);
    });

    it('with enableStrictKQLValidation should return a 400 when given an invalid "kuery" value', async () => {
      await supertest.get(`/api/fleet/agents?kuery='test%3A'`).expect(400);
    });

    it('with enableStrictKQLValidation should return 400 if passed kuery has non existing parameters', async () => {
      await supertest
        .get(`/api/fleet/agents?kuery=fleet-agents.non_existent_parameter:healthy`)
        .set('kbn-xsrf', 'xxxx')
        .expect(400);
    });

    it('should accept a valid "kuery" value', async () => {
      const filter = encodeURIComponent('fleet-agents.access_api_key_id : "api-key-2"');
      const { body: apiResponse } = await supertest
        .get(`/api/fleet/agents?kuery=${filter}`)
        .expect(200);

      expect(apiResponse.total).to.eql(1);
      const agent = apiResponse.items[0];
      expect(agent.access_api_key_id).to.eql('api-key-2');
    });

    it('should return a 400 when given an invalid "sortField" value', async () => {
      await supertest
        .get(`/api/fleet/agents?sortField=invalid_field`)
        .set('kbn-xsrf', 'xxxx')
        .expect(400);
    });

    it('should return a 200 when given sort options', async () => {
      const { body: apiResponse } = await supertest
        .get(`/api/fleet/agents?sortField=last_checkin&sortOrder=desc`)
        .expect(200);
      expect(apiResponse.items.map((agent: { id: string }) => agent.id)).to.eql([
        'agent4',
        'agent3',
        'agent2',
        'agent1',
      ]);
    });

    it('should return agents in enrolled_at and hostname order when default sort options and same enrollment time', async () => {
      let { body: apiResponse } = await supertest.get(`/api/fleet/agents`).expect(200);
      expect(apiResponse.items.map((agent: { id: string }) => agent.id)).to.eql([
        'agent4',
        'agent1',
        'agent2',
        'agent3',
      ]);

      ({ body: apiResponse } = await supertest.get(`/api/fleet/agents`).expect(200));
      expect(apiResponse.items.map((agent: { id: string }) => agent.id)).to.eql([
        'agent4',
        'agent1',
        'agent2',
        'agent3',
      ]);
    });

    it('should return tags of all agents', async () => {
      const { body: apiResponse } = await supertest.get('/api/fleet/agents/tags').expect(200);
      expect(apiResponse.items).to.eql(['existingTag', 'tag1']);
    });

    it('should return metrics if available and called with withMetrics', async () => {
      await es.index({
        id: 'agent-without-metrics',
        index: '.fleet-agents',
        refresh: 'wait_for',
        document: {
          access_api_key_id: 'api-key-2',
          active: true,
          policy_id: 'policy1',
          type: 'PERMANENT',
          local_metadata: { host: { hostname: 'host2' } },
          user_provided_metadata: {},
          enrolled_at: '2022-06-21T12:14:25Z',
          last_checkin: '2022-06-27T12:27:29Z',
          tags: ['existingTag'],
          agent: { id: 'agent-without-metrics', version: '9.2.0' },
        },
      });
      await es.index({
        id: 'agent-with-metrics',
        index: '.fleet-agents',
        refresh: 'wait_for',
        document: {
          access_api_key_id: 'api-key-1',
          active: true,
          policy_id: 'policy1',
          type: 'PERMANENT',
          local_metadata: { host: { hostname: 'host1' } },
          user_provided_metadata: {},
          enrolled_at: '2022-06-21T12:14:25Z',
          last_checkin: '2022-06-27T12:27:29Z',
          tags: ['existingTag'],
          agent: { id: 'agent-with-metrics', version: '9.2.0' },
        },
      });
      const now = Date.now();
      // We need to create data points in precise time buckets to ensure the derivative works properly
      // 3 minutes ago (first data point for component1)
      const threeMinutesAgo = new Date(now - 3 * 60 * 1000);
      threeMinutesAgo.setSeconds(0, 0); // Set to exact minute boundary

      await es.index({
        index: 'metrics-elastic_agent.elastic_agent-default',
        refresh: 'wait_for',
        document: {
          '@timestamp': threeMinutesAgo.toISOString(),
          data_stream: {
            namespace: 'default',
            type: 'metrics',
            dataset: 'elastic_agent.elastic_agent',
          },
          elastic_agent: { id: 'agent-with-metrics', process: 'elastic_agent' },
          component: { id: 'component1' },
          system: {
            process: {
              memory: {
                size: 25510920,
              },
              cpu: {
                total: {
                  value: 500, // Starting value
                },
              },
            },
          },
        },
      });

      // 2 minutes ago (second data point for component1)
      const twoMinutesAgo = new Date(now - 2 * 60 * 1000);
      twoMinutesAgo.setSeconds(0, 0); // Set to exact minute boundary

      await es.index({
        index: 'metrics-elastic_agent.elastic_agent-default',
        refresh: 'wait_for',
        document: {
          '@timestamp': twoMinutesAgo.toISOString(),
          data_stream: {
            namespace: 'default',
            type: 'metrics',
            dataset: 'elastic_agent.elastic_agent',
          },
          elastic_agent: { id: 'agent-with-metrics', process: 'elastic_agent' },
          component: { id: 'component1' },
          system: {
            process: {
              memory: {
                size: 25510920,
              },
              cpu: {
                total: {
                  value: 1200, // Higher value to ensure derivative is positive
                },
              },
            },
          },
        },
      });

      // 1 minute ago (data point for component2) - same agent but different component
      const oneMinuteAgo = new Date(now - 1 * 60 * 1000);
      oneMinuteAgo.setSeconds(0, 0); // Set to exact minute boundary

      await es.index({
        index: 'metrics-elastic_agent.elastic_agent-default',
        refresh: 'wait_for',
        document: {
          '@timestamp': oneMinuteAgo.toISOString(),
          elastic_agent: { id: 'agent-with-metrics', process: 'elastic_agent' },
          component: { id: 'component2' },
          data_stream: {
            namespace: 'default',
            type: 'metrics',
            dataset: 'elastic_agent.elastic_agent',
          },
          system: {
            process: {
              memory: {
                size: 25510920,
              },
              cpu: {
                total: {
                  value: 2500, // Even higher value
                },
              },
            },
          },
        },
      });

      const { body: apiResponse } = await supertest
        .get(`/api/fleet/agents?withMetrics=true`)
        .expect(200);

      expect(apiResponse).to.have.keys('page', 'total', 'items');
      expect(apiResponse.total).to.greaterThan(1);

      const agentWithMetrics: Agent = apiResponse.items.find(
        (agent: any) => agent.id === 'agent-with-metrics'
      );
      //  As both of the indexed items have the same agent id, and each one has its own memory/cpu item, the metrics should include both values combined as each is now uniquely counted towards total memory/cpu usage
      expect(agentWithMetrics.metrics?.memory_size_byte_avg).to.eql('51021840');
      expect(agentWithMetrics.metrics?.cpu_avg).to.eql('0.01166');

      const agentWithoutMetrics: Agent = apiResponse.items.find(
        (agent: any) => agent.id === 'agent-without-metrics'
      );
      expect(agentWithoutMetrics.metrics?.memory_size_byte_avg).equal(undefined);
      expect(agentWithoutMetrics.metrics?.cpu_avg).equal(undefined);

      await es.delete({
        id: 'agent-without-metrics',
        index: '.fleet-agents',
        refresh: true,
      });
      await es.delete({
        id: 'agent-with-metrics',
        index: '.fleet-agents',
        refresh: true,
      });
    });

    it('should return metrics for OPAMP agents when called with withMetrics', async () => {
      const now = Date.now();
      // last_checkin must be recent so the agent's computed status is 'online' (not 'offline').
      // Metrics are only assigned to actively-reporting OPAMP agents.
      const recentCheckin = new Date(now - 60 * 1000).toISOString();
      await es.index({
        id: 'opamp-agent-with-metrics',
        index: '.fleet-agents',
        refresh: 'wait_for',
        document: {
          access_api_key_id: 'api-key-opamp',
          active: true,
          policy_id: 'policy1',
          type: 'OPAMP',
          local_metadata: { host: { hostname: 'opamp-host' } },
          user_provided_metadata: {},
          enrolled_at: '2022-06-21T12:14:25Z',
          last_checkin: recentCheckin,
          tags: ['existingTag'],
          agent: { id: 'opamp-agent-with-metrics', version: '9.2.0' },
        },
      });
      const threeMinutesAgo = new Date(now - 3 * 60 * 1000);
      threeMinutesAgo.setSeconds(0, 0);
      const twoMinutesAgo = new Date(now - 2 * 60 * 1000);
      twoMinutesAgo.setSeconds(0, 0);

      await es.index({
        index: 'metrics-collectortelemetry.otel-default',
        refresh: 'wait_for',
        document: {
          '@timestamp': threeMinutesAgo.toISOString(),
          data_stream: {
            namespace: 'default',
            type: 'metrics',
            dataset: 'collectortelemetry.otel',
          },
          metrics: {
            otelcol_process_memory_rss: 1500.9,
            otelcol_process_cpu_seconds: 100,
            otelcol_process_uptime: 1000,
          },
          resource: {
            attributes: {
              'service.instance.id': 'opamp-agent-with-metrics',
            },
          },
        },
      });

      await es.index({
        index: 'metrics-collectortelemetry.otel-default',
        refresh: 'wait_for',
        document: {
          '@timestamp': twoMinutesAgo.toISOString(),
          data_stream: {
            namespace: 'default',
            type: 'metrics',
            dataset: 'collectortelemetry.otel',
          },
          metrics: {
            otelcol_process_memory_rss: 1500.1,
            otelcol_process_cpu_seconds: 110,
            otelcol_process_uptime: 1100,
          },
          resource: {
            attributes: {
              'service.instance.id': 'opamp-agent-with-metrics',
            },
          },
        },
      });

      const { body: apiResponse } = await supertest
        .get(`/api/fleet/agents?withMetrics=true`)
        .expect(200);

      const opampAgent: Agent = apiResponse.items.find(
        (agent: any) => agent.id === 'opamp-agent-with-metrics'
      );

      expect(opampAgent.metrics?.memory_size_byte_avg).to.eql('1500');
      expect(opampAgent.metrics?.cpu_avg).to.eql('0.16666');

      await es.delete({
        id: 'opamp-agent-with-metrics',
        index: '.fleet-agents',
        refresh: true,
      });
    });

    it('should return a status summary if getStatusSummary provided', async () => {
      const { body: apiResponse } = await supertest
        .get('/api/fleet/agents?getStatusSummary=true&perPage=0')
        .set('kbn-xsrf', 'xxxx')
        .expect(200);

      expect(apiResponse.items).to.eql([]);

      expect(apiResponse.statusSummary).to.eql({
        degraded: 0,
        enrolling: 0,
        error: 0,
        inactive: 0,
        offline: 4,
        online: 0,
        orphaned: 0,
        unenrolled: 0,
        unenrolling: 0,
        updating: 0,
        uninstalled: 0,
      });
    });

    it('should return correct status summary if showUpgradeable is provided', async () => {
      await es.update({
        id: 'agent1',
        refresh: 'wait_for',
        index: AGENTS_INDEX,
        doc: {
          policy_revision_idx: 1,
          last_checkin: new Date().toISOString(),
          status: 'online',
          local_metadata: { elastic: { agent: { upgradeable: true, version: '0.0.0' } } },
        },
      });
      // 1 agent inactive
      await es.update({
        id: 'agent4',
        refresh: 'wait_for',
        index: AGENTS_INDEX,
        doc: {
          policy_id: 'policy-inactivity-timeout',
          policy_revision_idx: 1,
          last_checkin: new Date(Date.now() - 1000 * 60).toISOString(), // policy timeout 1 min
          status: 'online',
          local_metadata: { elastic: { agent: { upgradeable: true, version: '0.0.0' } } },
        },
      });

      const { body: apiResponse } = await supertest
        .get('/api/fleet/agents?getStatusSummary=true&perPage=5&showUpgradeable=true')
        .set('kbn-xsrf', 'xxxx')
        .expect(200);

      expect(apiResponse.statusSummary).to.eql({
        degraded: 0,
        enrolling: 0,
        error: 0,
        inactive: 0,
        offline: 0,
        online: 2,
        orphaned: 0,
        unenrolled: 0,
        unenrolling: 0,
        updating: 0,
        uninstalled: 0,
      });
    });

    it('should not return agentless agents when showAgentless=false', async () => {
      // Create an agentless agent policy
      const { body: policyRes } = await supertest
        .post('/api/fleet/agent_policies')
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Agentless Policy',
          namespace: 'default',
          supports_agentless: true,
        })
        .expect(200);

      const agentlessPolicyId = policyRes.item.id;

      // Enroll an agent into the agentless policy
      const agentId = 'agentless-agent-1';
      await es.index({
        index: AGENTS_INDEX,
        id: agentId,
        refresh: 'wait_for',
        document: {
          type: 'PERMANENT',
          active: true,
          enrolled_at: new Date().toISOString(),
          local_metadata: { elastic: { agent: { id: agentId, version: '9.0.0' } } },
          status: 'online',
          policy_id: agentlessPolicyId,
        },
      });

      // Call the agent list API without showAgentless parameter
      const { body: apiResponseWithAgentless } = await supertest.get('/api/fleet/agents');

      // Assert that the agentless agent is returned
      const agentIdsWithAgentless = apiResponseWithAgentless.items.map((agent: any) => agent.id);
      expect(agentIdsWithAgentless).to.contain(agentId);

      // Call the agent list API with showAgentless=false
      const { body: apiResponse } = await supertest
        .get('/api/fleet/agents?showAgentless=false')
        .expect(200);

      // Assert that the agentless agent is not returned
      const agentIds = apiResponse.items.map((agent: any) => agent.id);
      expect(agentIds).not.contain(agentId);

      // Cleanup: delete the agent and policy
      await es.delete({ index: AGENTS_INDEX, id: agentId, refresh: 'wait_for' });
      await supertest
        .post(`/api/fleet/agent_policies/delete`)
        .set('kbn-xsrf', 'xxxx')
        .send({ agentPolicyId: agentlessPolicyId })
        .expect(200);
    });

    describe('advanced search params', () => {
      afterEach(async () => {
        await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/fleet/agents');
        await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/fleet/agents');
      });

      it('should return correct results with searchAfter parameter', async () => {
        const { body: apiResponse } = await supertest.get(
          '/api/fleet/agents?perPage=1&sortField=agent.id&sortOrder=desc'
        );
        expect(apiResponse.page).to.eql(1);
        expect(apiResponse.nextSearchAfter).to.eql(JSON.stringify(apiResponse.items[0].sort));
        expect(apiResponse.items.map(({ agent }: any) => agent.id)).to.eql(['agent4']);

        const { body: apiResponse2 } = await supertest
          .get(
            `/api/fleet/agents?perPage=2&sortField=agent.id&sortOrder=desc&searchAfter=${apiResponse.nextSearchAfter}`
          )
          .expect(200);

        expect(apiResponse2.page).to.eql(0);
        expect(apiResponse2.nextSearchAfter).to.eql(JSON.stringify(apiResponse2.items[1].sort));
        expect(apiResponse2.items.map(({ agent }: any) => agent.id)).to.eql(['agent3', 'agent2']);
      });

      it('should return a pit ID when openPit is true', async () => {
        const { body: apiResponse } = await supertest
          .get('/api/fleet/agents?perPage=1&openPit=true&pitKeepAlive=1s')
          .expect(200);

        expect(apiResponse).to.have.keys('page', 'total', 'items', 'pit');
        expect(apiResponse.items.length).to.eql(1);
        expect(apiResponse.pit).to.be.a('string');
        expect(apiResponse.nextSearchAfter).to.eql(JSON.stringify(apiResponse.items[0].sort));
      });

      it('should use pit to return correct results', async () => {
        const { body: apiResponse } = await supertest
          .get(
            '/api/fleet/agents?perPage=1&sortField=agent.id&sortOrder=desc&openPit=true&pitKeepAlive=1m'
          )
          .expect(200);

        expect(apiResponse.pit).to.be.a('string');
        expect(apiResponse.nextSearchAfter).to.eql(JSON.stringify(apiResponse.items[0].sort));
        expect(apiResponse.items.map(({ agent }: any) => agent.id)).to.eql(['agent4']);

        // update ES document to change the order by changing agent.id of agent2 to agent9
        await es.transport.request({
          method: 'POST',
          path: `/.fleet-agents/_update/agent2`,
          body: {
            doc: { agent: { id: 'agent9' } },
          },
        });
        await es.transport.request({
          method: 'POST',
          path: `/.fleet-agents/_refresh`,
        });

        // check that non-pit query returns the new order
        // new order is [agent9, agent4, agent3, agent1]
        const { body: apiResponse2 } = await supertest
          .get(`/api/fleet/agents?sortField=agent.id&sortOrder=desc`)
          .expect(200);
        expect(apiResponse2.items.map(({ agent }: any) => agent.id)).to.eql([
          'agent9',
          'agent4',
          'agent3',
          'agent1',
        ]);

        // check that the pit query returns the old order
        // old order saved by PIT is [agent4, agent3, agent2, agent1]
        const { body: apiResponse3 } = await supertest
          .get(
            `/api/fleet/agents?perPage=2&sortField=agent.id&sortOrder=desc&searchAfter=${apiResponse.nextSearchAfter}&pitId=${apiResponse.pit}&pitKeepAlive=1m`
          )
          .expect(200);
        expect(apiResponse3.items.map(({ agent }: any) => agent.id)).to.eql(['agent3', 'agent2']);
        expect(apiResponse3.nextSearchAfter).to.eql(JSON.stringify(apiResponse3.items[1].sort));
      });
    });

    describe('effective config', () => {
      it('should return effective config', async () => {
        const agentId = 'agent-with-effective-config';
        await es.index({
          id: agentId,
          index: '.fleet-agents',
          refresh: 'wait_for',
          document: {
            access_api_key_id: 'api-key-2',
            active: true,
            policy_id: 'policy1',
            type: 'PERMANENT',
            local_metadata: { host: { hostname: 'host2' } },
            user_provided_metadata: {},
            enrolled_at: '2022-06-21T12:14:25Z',
            last_checkin: '2022-06-27T12:27:29Z',
            agent: { id: agentId, version: '9.4.0' },
            effective_config: {},
          },
        });

        const { body: apiResponse } = await supertest
          .get(`/api/fleet/agents/${agentId}/effective_config`)
          .expect(200);

        expect(apiResponse).to.eql({ effective_config: {} });

        await es.delete({ index: AGENTS_INDEX, id: agentId, refresh: 'wait_for' });
      });
    });
  });
}
