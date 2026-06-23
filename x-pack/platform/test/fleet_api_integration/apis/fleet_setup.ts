/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { v4 as uuidV4 } from 'uuid';
import { INGEST_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import {
  ENROLLMENT_API_KEYS_INDEX,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
} from '@kbn/fleet-plugin/common/constants';

import type { FtrProviderContext } from '../../api_integration/ftr_provider_context';
import { skipIfNoDockerRegistry } from '../helpers';
import { SpaceTestApiClient } from './space_awareness/api_helper';

export default function (providerContext: FtrProviderContext) {
  const { getService } = providerContext;
  const supertest = getService('supertest');
  const es = getService('es');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const retry = getService('retry');

  describe('fleet_setup', () => {
    skipIfNoDockerRegistry(providerContext);
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.load('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');
    });

    after(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');
    });
    beforeEach(async () => {
      try {
        await es.security.deleteUser({
          username: 'fleet_enroll',
        });
      } catch (e) {
        if (e.meta?.statusCode !== 404) {
          throw e;
        }
      }
      try {
        await es.security.deleteRole({
          name: 'fleet_enroll',
        });
      } catch (e) {
        if (e.meta?.statusCode !== 404) {
          throw e;
        }
      }
    });

    it('should install default packages', async () => {
      await supertest.post(`/api/fleet/setup`).set('kbn-xsrf', 'xxxx').expect(200);

      const { body: apiResponse } = await supertest
        .get(`/api/fleet/epm/packages?prerelease=true`)
        .expect(200);
      const installedPackages = apiResponse.items
        .filter((p: any) => p.status === 'installed')
        .map((p: any) => p.name)
        .sort();

      expect(installedPackages).to.eql(['endpoint']);
    });

    describe('default enrollment API key reconciliation', () => {
      before(async () => {
        await supertest.post(`/api/fleet/setup`).set('kbn-xsrf', 'xxxx').expect(200);
      });

      async function createAgentPolicy() {
        const { body } = await supertest
          .post(`/api/fleet/agent_policies`)
          .set('kbn-xsrf', 'xxxx')
          .send({ name: `enrollment-key-test-${uuidV4()}`, namespace: 'default' })
          .expect(200);

        return body.item.id as string;
      }

      async function getEnrollmentKeysForPolicy(policyId: string) {
        const { body } = await supertest
          .get(`/api/fleet/enrollment_api_keys`)
          .query({ kuery: `policy_id:"${policyId}"` })
          .expect(200);

        return body.items as Array<{ id: string; policy_id: string; name: string }>;
      }

      it('creates a default enrollment API key for a policy that is missing one', async () => {
        const policyId = await createAgentPolicy();
        // Creating the policy already provisions a Default enrollment API key
        expect(await getEnrollmentKeysForPolicy(policyId)).to.have.length(1);

        // Simulate a policy with no enrollment key by deleting the key document directly
        await es.deleteByQuery({
          index: ENROLLMENT_API_KEYS_INDEX,
          refresh: true,
          conflicts: 'proceed',
          query: { term: { policy_id: policyId } },
        });
        expect(await getEnrollmentKeysForPolicy(policyId)).to.have.length(0);

        await supertest.post(`/api/fleet/setup`).set('kbn-xsrf', 'xxxx').expect(200);

        await retry.tryForTime(30_000, async () => {
          const keys = await getEnrollmentKeysForPolicy(policyId);
          expect(keys).to.have.length(1);
          // generateEnrollmentAPIKey appends a unique suffix, e.g. `Default (<uuid>)`
          expect(keys[0].name).to.match(/^Default/);
        });
      });

      it('does not create a duplicate enrollment API key when one already exists', async () => {
        const policyId = await createAgentPolicy();
        const keysBefore = await getEnrollmentKeysForPolicy(policyId);
        expect(keysBefore).to.have.length(1);

        await supertest.post(`/api/fleet/setup`).set('kbn-xsrf', 'xxxx').expect(200);

        const keysAfter = await getEnrollmentKeysForPolicy(policyId);
        expect(keysAfter).to.have.length(1);
        expect(keysAfter[0].id).to.eql(keysBefore[0].id);
      });
    });

    describe('upgrade managed package policies', () => {
      const apiClient = new SpaceTestApiClient(supertest);
      before(async () => {
        await apiClient.setup();
        const pkgRes = await apiClient.getPackage({
          pkgName: 'synthetics',
        });
        await apiClient.installPackage({
          pkgName: 'synthetics',
          pkgVersion: pkgRes.item.version,
          force: true,
        });
        await apiClient.updatePackage({
          pkgName: 'synthetics',
          pkgVersion: pkgRes.item.version,
          data: {
            keepPoliciesUpToDate: true,
          },
        });

        const agentPolicyRes = await apiClient.createAgentPolicy();

        await es.bulk({
          index: INGEST_SAVED_OBJECT_INDEX,
          refresh: 'wait_for',
          operations: [...new Array(10).keys()].flatMap((_, index) => [
            {
              create: {
                _id: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}:${uuidV4()}`,
              },
            },
            {
              type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
              namespaces: ['default'],
              [PACKAGE_POLICY_SAVED_OBJECT_TYPE]: {
                name: `test-${index}`,
                enabled: true,
                policy_ids: [agentPolicyRes.item.id],
                inputs: [],
                revision: 1,
                created_at: new Date().toISOString(),
                created_by: 'system',
                updated_at: new Date().toISOString(),
                updated_by: 'system',
                package: {
                  name: 'synthetics',
                  version: '1.2.1',
                },
                latest_revision: true,
              },
            },
          ]),
        });

        return await apiClient.getPackage({
          pkgName: 'synthetics',
        });
      });
      it('should upgrade managed package policies', async () => {
        await apiClient.setup();
        await retry.tryWithRetries(
          'Searching for managed package policies to be upgraded',
          async () => {
            const res = await es.search({
              index: INGEST_SAVED_OBJECT_INDEX,
              track_total_hits: true,
              query: {
                bool: {
                  must: {
                    term: {
                      [`${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.version`]: '1.2.1',
                    },
                  },
                  filter: {
                    term: {
                      [`${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name`]: 'synthetics',
                    },
                  },
                },
              },
            });
            const packagePolicies = res.hits.hits.filter(
              (so) => so._id && !so._id.includes(':prev')
            );
            if (packagePolicies.length > 0) {
              throw new Error(`Managed package policies not upgraded ${packagePolicies.length}.`);
            }
          },
          {
            retryCount: 25,
            retryDelay: 10000,
            timeout: 60_000,
          }
        );
      });
    });

    it('should migrate existing component templates to move away from deprecated ILM policies', async () => {
      await es.cluster.putComponentTemplate({
        name: 'logs-test@package',
        template: {
          settings: {
            index: {
              lifecycle: {
                name: 'logs',
              },
            },
          },
        },
      });
      await es.cluster.putComponentTemplate({
        name: 'metrics-test@package',
        template: {
          settings: {
            index: {
              lifecycle: {
                name: 'metrics',
              },
            },
          },
        },
      });
      await es.cluster.putComponentTemplate({
        name: 'synthetics-test@package',
        template: {
          settings: {
            index: {
              lifecycle: {
                name: 'synthetics',
              },
            },
          },
        },
      });

      await supertest.post(`/api/fleet/setup`).set('kbn-xsrf', 'xxxx').expect(200);
      // wait for the async task to run (6s delay + buffer)
      await new Promise((resolve) => setTimeout(resolve, 10 * 1000));

      const componentTemplates = await es.cluster.getComponentTemplate({
        name: '*@package',
      });
      const ilms = Object.entries(componentTemplates.component_templates).map(
        ([, componentTemplate]) => {
          const settings = componentTemplate.component_template.template.settings || {};
          return settings.index?.lifecycle?.name;
        }
      );

      expect(ilms).to.not.contain('logs');
      expect(ilms).to.not.contain('metrics');
      expect(ilms).to.not.contain('synthetics');
    });
  });
}
