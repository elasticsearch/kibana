/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import { EXPIRATION_DURATION_SECONDS } from '@kbn/fleet-plugin/server/services/agents/upgrade_action_runner';
import moment from 'moment';
import type { FtrProviderContextWithServices } from '../ftr_provider_context';
import { cleanupAgentDocs, createAgentDoc } from '../helpers';

export default function (providerContext: FtrProviderContextWithServices) {
  const { getService } = providerContext;
  const supertest = getService('supertest');
  const es = getService('es');
  const retry = getService('retry');
  const TASK_INTERVAL = 30000; // as set in the config
  const RETRY_DELAY = 60000; // as set in the config
  let policyId: string;
  let secondPolicyId: string;

  async function waitForTask() {
    // Sleep for the duration of the task interval.
    // In case of test flakiness, the sleep duration can be increased.
    await new Promise((resolve) => setTimeout(resolve, TASK_INTERVAL));
  }

  // Failing: See https://github.com/elastic/kibana/issues/245377
  describe.skip('Automatic agent upgrades', () => {
    before(async () => {
      await supertest.post(`/api/fleet/setup`).set('kbn-xsrf', 'xxxx').expect(200);
      const { body: agentPolicyResponse } = await supertest
        .post('/api/fleet/agent_policies')
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          force: true,
        })
        .expect(200);
      policyId = agentPolicyResponse.item.id;
    });

    after(async () => {
      await supertest
        .post('/api/fleet/agent_policies/delete')
        .send({ agentPolicyId: policyId })
        .set('kbn-xsrf', 'xxxx')
        .expect(200);
      await supertest
        .post('/api/fleet/agent_policies/delete')
        .send({ agentPolicyId: secondPolicyId })
        .set('kbn-xsrf', 'xxxx')
        .expect(200);
    });

    afterEach(async () => {
      // Reset required_versions on the policy to prevent the background task from acting
      // on stale policy config when the next test creates new agents.
      await supertest
        .put(`/api/fleet/agent_policies/${policyId}`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          required_versions: [],
        })
        .expect(200);
      await cleanupAgentDocs(providerContext);
      await es.deleteByQuery({
        index: '.fleet-actions',
        ignore_unavailable: true,
        query: {
          match_all: {},
        },
      });
    });

    it('should only upgrade active agents', async () => {
      // Create an active agent and an inactive agent on 8.17.0.
      await createAgentDoc(providerContext, 'agent1', policyId, '8.17.0');
      await createAgentDoc(providerContext, 'agent2', policyId, '8.17.0', false);
      // Update the policy to require version 8.17.1 for all active agents.
      await supertest
        .put(`/api/fleet/agent_policies/${policyId}`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          required_versions: [
            {
              version: '8.17.1',
              percentage: 100,
            },
          ],
        })
        .expect(200);
      // Check that only the active agent was upgraded.
      await retry.tryForTime(60000, async () => {
        const res = await supertest
          .get('/api/fleet/agents/agent1')
          .set('kbn-xsrf', 'xxx')
          .expect(200);
        if (!res.body.item.upgrade_started_at || res.body.item.upgrade_attempts?.length !== 1) {
          throw new Error('agent1 has not been upgraded yet');
        }
      });
      const res = await supertest
        .get('/api/fleet/agents/agent2')
        .set('kbn-xsrf', 'xxx')
        .expect(200);
      expect(res.body.item.upgrade_started_at).to.be(undefined);
      expect(res.body.item.upgrade_attempts).to.be(undefined);

      await retry.tryForTime(60000, async () => {
        await es.indices.refresh({ index: '.fleet-actions', ignore_unavailable: true });
        const actionRes = await es.search({
          index: '.fleet-actions',
          ignore_unavailable: true,
          query: {
            term: {
              agents: 'agent1',
            },
          },
        });
        if (!actionRes.hits.hits.length) {
          throw new Error('.fleet-actions document for agent1 not found yet');
        }
        // verify that the expiration is set to 1 month
        const expirationDate = new Date((actionRes.hits.hits[0]._source as any).expiration);
        const expectedExpiration = moment(new Date())
          .add(EXPIRATION_DURATION_SECONDS, 'seconds')
          .toDate();
        expect(expirationDate < expectedExpiration).to.be(true);
      });
    });

    it('should take agents on target version into account', async () => {
      // Create 3 active agents on 8.17.0 and 1 active agent on 8.17.1.
      await createAgentDoc(providerContext, 'agent1', policyId, '8.17.0');
      await createAgentDoc(providerContext, 'agent2', policyId, '8.17.0');
      await createAgentDoc(providerContext, 'agent3', policyId, '8.17.0');
      await createAgentDoc(providerContext, 'agent4', policyId, '8.17.1');
      // Update the policy to require version 8.17.1 for 50% of active agents.
      await supertest
        .put(`/api/fleet/agent_policies/${policyId}`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          required_versions: [
            {
              version: '8.17.1',
              percentage: 50,
            },
          ],
        })
        .expect(200);
      // Wait until at least one agent has been upgraded, then verify exact counts.
      await retry.tryForTime(60000, async () => {
        const res = await supertest.get('/api/fleet/agents').set('kbn-xsrf', 'xxx').expect(200);
        if (
          res.body.items.filter((item: any) => item.upgrade_started_at !== undefined).length < 1
        ) {
          throw new Error('No agent has been upgraded yet');
        }
      });
      // Check that only one agent on 8.17.0 was upgraded.
      const res = await supertest.get('/api/fleet/agents').set('kbn-xsrf', 'xxx').expect(200);
      expect(res.body.items.length).to.be(4);
      expect(res.body.items.filter((item: any) => item.status === 'updating').length).to.be(1);
      expect(
        res.body.items.filter((item: any) => item.upgrade_started_at !== undefined).length
      ).to.be(1);
      expect(
        res.body.items.filter((item: any) => item.upgrade_attempts !== undefined).length
      ).to.be(1);
    });

    it('should not take inactive agents on target version into account', async () => {
      // Create 2 active agents on 8.17.0, 1 active agent on 8.17.1 and 1 inactive agent on 8.17.1.
      await createAgentDoc(providerContext, 'agent1', policyId, '8.17.0');
      await createAgentDoc(providerContext, 'agent2', policyId, '8.17.0');
      await createAgentDoc(providerContext, 'agent3', policyId, '8.17.1');
      await createAgentDoc(providerContext, 'agent4', policyId, '8.17.1', false);
      // Update the policy to require version 8.17.1 for 50% of active agents.
      await supertest
        .put(`/api/fleet/agent_policies/${policyId}`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          required_versions: [
            {
              version: '8.17.1',
              percentage: 50,
            },
          ],
        })
        .expect(200);
      // Wait until at least one agent has been upgraded, then verify exact counts.
      await retry.tryForTime(60000, async () => {
        const res = await supertest
          .get('/api/fleet/agents?showInactive=true')
          .set('kbn-xsrf', 'xxx')
          .expect(200);
        if (
          res.body.items.filter((item: any) => item.upgrade_started_at !== undefined).length < 1
        ) {
          throw new Error('No agent has been upgraded yet');
        }
      });
      // Check that only one agent on 8.17.0 was upgraded.
      const res = await supertest
        .get('/api/fleet/agents?showInactive=true')
        .set('kbn-xsrf', 'xxx')
        .expect(200);
      expect(res.body.items.length).to.be(4);
      expect(res.body.items.filter((item: any) => item.status === 'updating').length).to.be(1);
      expect(
        res.body.items.filter((item: any) => item.upgrade_started_at !== undefined).length
      ).to.be(1);
      expect(
        res.body.items.filter((item: any) => item.upgrade_attempts !== undefined).length
      ).to.be(1);
    });

    it('should take already upgrading agents into account', async () => {
      // Create an active agent on 8.17.0 and an active agent on 8.17.0 upgrading to 8.17.1.
      await createAgentDoc(providerContext, 'agent1', policyId, '8.17.0');
      await createAgentDoc(providerContext, 'agent2', policyId, '8.17.0', true, {
        upgrade_details: {
          target_version: '8.17.1',
          state: 'UPG_DOWNLOADING',
          action_id: '123',
        },
      });
      // Update the policy to require version 8.17.1 or 50% of active agents.
      await supertest
        .put(`/api/fleet/agent_policies/${policyId}`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          required_versions: [
            {
              version: '8.17.1',
              percentage: 50,
            },
          ],
        })
        .expect(200);
      await waitForTask();
      // Check that no agent was upgraded.
      let res = await supertest.get('/api/fleet/agents/agent1').set('kbn-xsrf', 'xxx').expect(200);
      expect(res.body.item.upgrade_started_at).to.be(undefined);
      res = await supertest.get('/api/fleet/agents/agent2').set('kbn-xsrf', 'xxx').expect(200);
      expect(res.body.item.upgrade_started_at).to.be(undefined);
    });

    it('should take agents marked but not ready for retry into account but not upgrade them', async () => {
      // Create an active agent on 8.17.0 and an active agent on 8.17.0 marked but not ready for retry.
      await createAgentDoc(providerContext, 'agent1', policyId, '8.17.0');
      await createAgentDoc(providerContext, 'agent2', policyId, '8.17.0', true, {
        upgrade_details: {
          target_version: '8.17.1',
          state: 'UPG_FAILED',
          action_id: '123',
        },
        upgrade_attempts: [new Date().toISOString()],
      });
      // Update the policy to require version 8.17.1 for 50% of active agents.
      await supertest
        .put(`/api/fleet/agent_policies/${policyId}`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          required_versions: [
            {
              version: '8.17.1',
              percentage: 50,
            },
          ],
        })
        .expect(200);
      await waitForTask();
      // Check that no agent was upgraded.
      let res = await supertest.get('/api/fleet/agents/agent1').set('kbn-xsrf', 'xxx').expect(200);
      expect(res.body.item.upgrade_started_at).to.be(undefined);
      res = await supertest.get('/api/fleet/agents/agent2').set('kbn-xsrf', 'xxx').expect(200);
      expect(res.body.item.upgrade_started_at).to.be(undefined);
    });

    it('should take agents marked and ready for retry into account and upgrade them', async () => {
      // Create an active agent on 8.17.0 and an active agent on 8.17.0 marked and ready for retry.
      await createAgentDoc(providerContext, 'agent1', policyId, '8.17.0');
      await createAgentDoc(providerContext, 'agent2', policyId, '8.17.0', true, {
        upgrade_details: {
          target_version: '8.17.1',
          state: 'UPG_FAILED',
          action_id: '123',
        },
        upgrade_attempts: [new Date(new Date().getTime() - RETRY_DELAY).toISOString()],
      });
      // Update the policy to require version 8.17.1 for 50% of active agents.
      await supertest
        .put(`/api/fleet/agent_policies/${policyId}`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          required_versions: [
            {
              version: '8.17.1',
              percentage: 50,
            },
          ],
        })
        .expect(200);

      await retry.tryForTime(60000, async () => {
        // Check that agent2 upgrade was retried
        const res2 = await supertest
          .get('/api/fleet/agents/agent2')
          .set('kbn-xsrf', 'xxx')
          .expect(200);
        if (!res2.body.item.upgrade_started_at) {
          throw new Error('agent2 upgrade has not been retried yet');
        }

        // Check that agent1 was not upgraded
        const res1 = await supertest
          .get('/api/fleet/agents/agent1')
          .set('kbn-xsrf', 'xxx')
          .expect(200);
        expect(res1.body.item.upgrade_started_at).to.be(undefined);
      });
    });

    it('should not count upgrading agents from other policies toward target percentage', async () => {
      // Scenario: policy 1 has 1 agent on 8.17.0 that should be upgraded to 8.17.1 (100% target).
      // A second policy has an agent already upgrading to 8.17.1.
      // Before the fix: the second policy's upgrading agent was counted in policy 1's
      // totalOnOrUpdatingToTargetVersionAgents (the updatingToKuery had no policy_id filter),
      // making the count = 1 - 1 = 0 → "target percentage already reached" → agent1 never upgraded.
      // After the fix: the count query is scoped to policy_id, so policy 2's agent is not counted.

      const { body: secondPolicyBody } = await supertest
        .post('/api/fleet/agent_policies')
        .set('kbn-xsrf', 'xxxx')
        .send({ name: 'Test policy 2', namespace: 'default', force: true })
        .expect(200);
      secondPolicyId = secondPolicyBody.item.id;

      // agent1: in policy 1, on 8.17.0 — should be upgraded.
      await createAgentDoc(providerContext, 'agent1', policyId, '8.17.0');
      // agent2: in policy 2, actively upgrading to 8.17.1 (non-failed state).
      // Before the fix this agent would contaminate policy 1's upgrading-agents count.
      await createAgentDoc(providerContext, 'agent2', secondPolicyId, '8.17.0', true, {
        upgrade_details: {
          target_version: '8.17.1',
          state: 'UPG_DOWNLOADING',
          action_id: '456',
        },
      });

      await supertest
        .put(`/api/fleet/agent_policies/${policyId}`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          required_versions: [{ version: '8.17.1', percentage: 100 }],
        })
        .expect(200);

      // agent1 must be picked up for upgrade despite agent2 (from another policy) upgrading.
      await retry.tryForTime(60000, async () => {
        const res = await supertest
          .get('/api/fleet/agents/agent1')
          .set('kbn-xsrf', 'xxx')
          .expect(200);
        if (!res.body.item.upgrade_started_at || res.body.item.upgrade_attempts?.length !== 1) {
          throw new Error('agent1 has not been upgraded yet');
        }
      });
    });

    it('should retry upgrading agents stuck in updating', async () => {
      await createAgentDoc(providerContext, 'agent5', policyId, '8.17.0', true, {
        status: 'updating',
        upgrade_started_at: new Date(new Date().getTime() - 2 * 60 * 60 * 1000 - 100).toISOString(), // 2h to be stuck in updating
        upgrade_attempts: [new Date(new Date().getTime() - RETRY_DELAY).toISOString()],
      });
      await supertest
        .put(`/api/fleet/agent_policies/${policyId}`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Test policy',
          namespace: 'default',
          required_versions: [
            {
              version: '8.17.1',
              percentage: 100,
            },
          ],
        })
        .expect(200);

      await retry.tryForTime(60000, async () => {
        // Check that agent5 upgrade was retried
        const res = await supertest
          .get('/api/fleet/agents/agent5')
          .set('kbn-xsrf', 'xxx')
          .expect(200);
        if (res.body.item.upgrade_attempts.length <= 1) {
          throw new Error('agent5 upgrade has not been retried yet');
        }
      });
    });
  });
}
