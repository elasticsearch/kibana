/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import expect from '@kbn/expect';
import type { FullAgentPolicy } from '@kbn/fleet-plugin/common';
import {
  AGENTS_INDEX,
  AGENT_POLICY_INDEX,
  ENROLLMENT_API_KEYS_INDEX,
  GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
} from '@kbn/fleet-plugin/common/constants';
import moment from 'moment';
import pRetry from 'p-retry';
import { v4 as uuidv4 } from 'uuid';
import type { FtrProviderContext } from '../../api_integration/ftr_provider_context';
import { skipIfNoDockerRegistry } from '../helpers';

const secretVar = (id: string) => `$co.elastic.secret{${id}}`;

const arrayIdsEqual = (a: Array<{ id: string }>, b: Array<{ id: string }>) => {
  if (a.length !== b.length) {
    return false;
  }
  return a.every(({ id }) => b.find(({ id: bid }) => bid === id));
};

function createdPolicyToUpdatePolicy(policy: any) {
  const updatedPolicy = JSON.parse(JSON.stringify(policy));
  delete updatedPolicy.id;
  delete updatedPolicy.revision;
  delete updatedPolicy.secret_references;
  delete updatedPolicy.created_at;
  delete updatedPolicy.created_by;
  delete updatedPolicy.updated_at;
  delete updatedPolicy.updated_by;
  delete updatedPolicy.inputs[0].compiled_input;
  delete updatedPolicy.inputs[0].streams[0].compiled_stream;
  delete updatedPolicy.name;
  return updatedPolicy;
}

const SECRETS_INDEX_NAME = '.fleet-secrets';

export default function (providerContext: FtrProviderContext) {
  describe('fleet policy secrets', () => {
    const { getService } = providerContext;

    const es: Client = getService('es');
    const kibanaServer = getService('kibanaServer');
    const supertest = getService('supertest');
    const fleetAndAgents = getService('fleetAndAgents');

    const createAgentPolicy = async () => {
      const { body: agentPolicyResponse } = await supertest
        .post(`/api/fleet/agent_policies`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: `Test policy ${uuidv4()}`,
          namespace: 'default',
        })
        .expect(200);

      return agentPolicyResponse.item;
    };

    const deletePackagePolicy = async (id: string) => {
      await supertest
        .delete(`/api/fleet/package_policies/${id}?force=true`)
        .set('kbn-xsrf', 'xxxx')
        .expect(200);
    };

    const cleanupPolicies = async () => {
      const agentPoliciesRes = await supertest
        .get(`/api/fleet/agent_policies?perPage=1000`)
        .expect(200);

      const packagePoliciesRes = await supertest
        .get(`/api/fleet/package_policies?perPage=1000`)
        .expect(200);

      const packagePolicies = packagePoliciesRes.body.items;

      for (const packagePolicy of packagePolicies) {
        await supertest
          .delete(`/api/fleet/package_policies/${packagePolicy.id}?force=true`)
          .set('kbn-xsrf', 'xxxx')
          .expect(200);
      }

      const agentPolicies = agentPoliciesRes.body.items;

      for (const agentPolicy of agentPolicies) {
        if (agentPolicy.is_managed) {
          continue;
        }

        await supertest
          .post(`/api/fleet/agent_policies/delete`)
          .send({
            agentPolicyId: agentPolicy.id,
          })
          .set('kbn-xsrf', 'xxxx')
          .expect(200);
      }

      await Promise.all([
        es.deleteByQuery({
          index: ENROLLMENT_API_KEYS_INDEX,
          refresh: true,
          query: {
            match_all: {},
          },
        }),
        es.deleteByQuery({
          index: AGENT_POLICY_INDEX,
          refresh: true,
          query: {
            match_all: {},
          },
        }),
      ]).catch((err) => {
        // index doesn't exist
      });
    };

    const cleanupAgents = async () =>
      await pRetry(async () => {
        try {
          await es.deleteByQuery({
            index: AGENTS_INDEX,
            refresh: true,
            query: {
              match_all: {},
            },
          });
        } catch (err) {
          if (err?.meta?.statusCode === 409) {
            throw err;
          }
        }
      });

    const cleanupSecrets = async () => {
      try {
        await es.deleteByQuery({
          index: SECRETS_INDEX_NAME,
          refresh: true,
          query: {
            match_all: {},
          },
        });
      } catch (err) {
        // index doesn't exist
      }

      // Reset the global settings object to disable secrets between tests.
      // Each test can re-run setup as part of its setup if it needs to enable secrets
      await kibanaServer.savedObjects.create({
        type: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
        id: 'fleet-default-settings',
        attributes: {
          secret_storage_requirements_met: false,
        },
        overwrite: true,
      });
    };

    const createFleetServerAgentPolicy = async ({
      isManaged = false,
    }: { isManaged?: boolean } = {}) => {
      const agentPolicyResponse = await supertest
        .post(`/api/fleet/agent_policies`)
        .set('kbn-xsrf', 'xxx')
        .send({
          name: `Fleet server policy ${uuidv4()}`,
          namespace: 'default',
          is_managed: isManaged,
        })
        .expect(200);

      const fleetServerAgentPolicy = agentPolicyResponse.body.item;

      // create fleet_server package policy
      const fleetServerPackagePolicyResponse = await supertest
        .post(`/api/fleet/package_policies`)
        .set('kbn-xsrf', 'xxx')
        .send({
          force: true,
          package: {
            name: 'fleet_server',
            version: '1.3.1',
          },
          name: `Fleet Server ${uuidv4()}`,
          namespace: 'default',
          policy_id: fleetServerAgentPolicy.id,
          vars: {},
          inputs: {
            'fleet_server-fleet-server': {
              enabled: true,
              vars: {
                custom: '',
              },
              streams: {},
            },
          },
        })
        .expect(200);

      const fleetServerPackagePolicy = fleetServerPackagePolicyResponse.body.item;

      return { fleetServerAgentPolicy, fleetServerPackagePolicy };
    };

    const createOutputWithSecret = async () => {
      const res = await supertest
        .post(`/api/fleet/outputs`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'Kafka Output With Password Secret',
          type: 'kafka',
          hosts: ['test.fr:2000'],
          auth_type: 'user_pass',
          username: 'user',
          topic: 'topic1',
          config_yaml: 'shipper: {}',
          shipper: {
            disk_queue_enabled: true,
            disk_queue_path: 'path/to/disk/queue',
            disk_queue_encryption_enabled: true,
          },
          secrets: { password: 'pass' },
        })
        .expect(200);

      return res.body.item;
    };

    const createFleetServerAgent = async (
      policyId: string,
      hostname: string,
      agentVersion: string,
      status = 'active'
    ) => {
      const agentResponse = await es.index({
        index: '.fleet-agents',
        refresh: true,
        document: {
          access_api_key_id: 'api-key-3',
          active: true,
          policy_id: policyId,
          type: 'PERMANENT',
          local_metadata: {
            host: { hostname },
            elastic: { agent: { version: agentVersion } },
          },
          user_provided_metadata: {},
          enrolled_at: moment().subtract(30, 'minutes').toISOString(),
          unenrolled_at:
            status === 'unenrolled' ? moment().subtract(10, 'minutes').toISOString() : undefined,
          last_checkin:
            status === 'inactive'
              ? moment().subtract(2, 'hours')
              : moment().subtract(6, 'minute').toISOString(),
          tags: ['tag1'],
          status,
        },
      });

      return agentResponse._id;
    };

    const getSecrets = async (ids?: string[]) => {
      const query = ids ? { terms: { _id: ids } } : { match_all: {} };
      return es.search({
        index: SECRETS_INDEX_NAME,
        query,
      });
    };

    const getPackagePolicyById = async (id: string) => {
      const { body } = await supertest.get(`/api/fleet/package_policies/${id}`);
      return body.item;
    };

    const getFullAgentPolicyById = async (id: string) => {
      const { body } = await supertest.get(`/api/fleet/agent_policies/${id}/full`).expect(200);
      return body.item;
    };

    const getLatestPolicyRevision = async (id: string): Promise<{ data: FullAgentPolicy }> => {
      const res = await es.search({
        index: '.fleet-policies',
        query: {
          bool: {
            filter: [
              {
                term: {
                  policy_id: id,
                },
              },
            ],
          },
        },
        sort: [
          {
            revision_idx: {
              order: 'desc',
            },
          },
        ],
        size: 1,
      });
      return res.hits.hits[0]._source as any as { data: FullAgentPolicy };
    };

    const createPackagePolicyWithSecrets = async (agentPolicyId: string) => {
      const { body: createResBody } = await supertest
        .post(`/api/fleet/package_policies`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: `secrets-${Date.now()}`,
          description: '',
          namespace: 'default',
          policy_id: agentPolicyId,
          inputs: {
            'secrets-test_input': {
              enabled: true,
              vars: {
                input_var_secret: 'input_secret_val',
                input_var_non_secret: 'input_non_secret_val',
              },
              streams: {
                'secrets.log': {
                  enabled: true,
                  vars: {
                    stream_var_secret: 'stream_secret_val',
                    stream_var_non_secret: 'stream_non_secret_val',
                  },
                },
              },
            },
          },
          vars: {
            package_var_secret: 'package_secret_val',
            package_var_non_secret: 'package_non_secret_val',
            package_var_multi_secret: ['package_multi_secret_val_1', 'package_multi_secret_val_2'],
          },
          package: {
            name: 'secrets',
            version: '1.0.0',
          },
        });

      const packagePolicyWithSecrets = createResBody.item;

      return packagePolicyWithSecrets;
    };

    const callFleetSetup = async () => {
      await supertest.post(`/api/fleet/setup`).set('kbn-xsrf', 'xxxx').expect(200);
    };

    skipIfNoDockerRegistry(providerContext);

    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await fleetAndAgents.setup();
      await getService('esArchiver').load(
        'x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server'
      );
    });

    after(async () => {
      await getService('esArchiver').unload(
        'x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server'
      );
      await kibanaServer.savedObjects.cleanStandardList();
    });

    describe('create package policy with secrets', () => {
      let testAgentPolicy: any;
      let fleetServerAgentPolicy: any;
      let packagePolicyWithSecrets: any;

      before(async () => {
        // Policy secrets require at least one Fleet server on v8.10+
        const createFleetServerAgentPolicyRes = await createFleetServerAgentPolicy();
        fleetServerAgentPolicy = createFleetServerAgentPolicyRes.fleetServerAgentPolicy;

        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.10.0');

        // Re-run setup to detect new Fleet Server agent + policy and enable secrets
        await callFleetSetup();

        testAgentPolicy = await createAgentPolicy();
        packagePolicyWithSecrets = await createPackagePolicyWithSecrets(testAgentPolicy.id);
      });

      after(async () => {
        await Promise.all([cleanupAgents(), cleanupSecrets()]);
        await cleanupPolicies();
      });

      it('should correctly create the policy with secrets', async () => {
        const packageVarId = packagePolicyWithSecrets.vars.package_var_secret.value.id;
        expect(packageVarId).to.be.an('string');

        const packageVarMultiIds = packagePolicyWithSecrets.vars.package_var_multi_secret.value.ids;
        expect(packageVarMultiIds).to.be.an('array');
        expect(packageVarMultiIds.length).to.eql(2);

        const inputVarId = packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.id;
        expect(inputVarId).to.be.an('string');

        const streamVarId =
          packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.id;
        expect(streamVarId).to.be.an('string');

        expect(
          arrayIdsEqual(packagePolicyWithSecrets.secret_references, [
            { id: packageVarId },
            { id: packageVarMultiIds[0] },
            { id: packageVarMultiIds[1] },
            { id: streamVarId },
            { id: inputVarId },
          ])
        ).to.eql(true);

        const expectedCompiledStream = {
          'config.version': '2',
          package_var_secret: secretVar(packageVarId),
          package_var_multi_secret: [
            secretVar(packageVarMultiIds[0]),
            secretVar(packageVarMultiIds[1]),
          ],
          package_var_non_secret: 'package_non_secret_val',
          input_var_secret: secretVar(inputVarId),
          input_var_non_secret: 'input_non_secret_val',
          stream_var_secret: secretVar(streamVarId),
          stream_var_non_secret: 'stream_non_secret_val',
        };

        expect(packagePolicyWithSecrets.inputs[0].streams[0].compiled_stream).to.eql(
          expectedCompiledStream
        );

        const expectedCompiledInput = {
          package_var_secret: secretVar(packageVarId),
          package_var_multi_secret: [
            secretVar(packageVarMultiIds[0]),
            secretVar(packageVarMultiIds[1]),
          ],
          package_var_non_secret: 'package_non_secret_val',
          input_var_secret: secretVar(inputVarId),
          input_var_non_secret: 'input_non_secret_val',
        };

        expect(packagePolicyWithSecrets.inputs[0].compiled_input).to.eql(expectedCompiledInput);

        expect(packagePolicyWithSecrets.vars.package_var_secret.value.isSecretRef).to.eql(true);
        expect(packagePolicyWithSecrets.vars.package_var_multi_secret.value.isSecretRef).to.eql(
          true
        );
        expect(packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.isSecretRef).to.eql(
          true
        );
        expect(
          packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.isSecretRef
        ).to.eql(true);
      });

      it('should return the created policy correctly from the get policies API', async () => {
        const packagePolicy = await getPackagePolicyById(packagePolicyWithSecrets.id);

        const packageVarId = packagePolicy.vars.package_var_secret.value.id;
        const packageVarMultiIds = packagePolicy.vars.package_var_multi_secret.value.ids;
        const inputVarId = packagePolicy.inputs[0].vars.input_var_secret.value.id;
        const streamVarId = packagePolicy.inputs[0].streams[0].vars.stream_var_secret.value.id;

        const expectedCompiledStream = {
          'config.version': '2',
          package_var_secret: secretVar(packageVarId),
          package_var_multi_secret: [
            secretVar(packageVarMultiIds[0]),
            secretVar(packageVarMultiIds[1]),
          ],
          package_var_non_secret: 'package_non_secret_val',
          input_var_secret: secretVar(inputVarId),
          input_var_non_secret: 'input_non_secret_val',
          stream_var_secret: secretVar(streamVarId),
          stream_var_non_secret: 'stream_non_secret_val',
        };

        const expectedCompiledInput = {
          package_var_secret: secretVar(packageVarId),
          package_var_multi_secret: [
            secretVar(packageVarMultiIds[0]),
            secretVar(packageVarMultiIds[1]),
          ],
          package_var_non_secret: 'package_non_secret_val',
          input_var_secret: secretVar(inputVarId),
          input_var_non_secret: 'input_non_secret_val',
        };

        expect(
          arrayIdsEqual(packagePolicy.secret_references, [
            { id: packageVarId },
            { id: packageVarMultiIds[0] },
            { id: packageVarMultiIds[1] },
            { id: streamVarId },
            { id: inputVarId },
          ])
        ).to.eql(true);

        expect(packagePolicy.inputs[0].streams[0].compiled_stream).to.eql(expectedCompiledStream);
        expect(packagePolicy.inputs[0].compiled_input).to.eql(expectedCompiledInput);
        expect(packagePolicy.vars.package_var_secret.value.isSecretRef).to.eql(true);
        expect(packagePolicy.vars.package_var_secret.value.id).eql(packageVarId);
        expect(packagePolicy.vars.package_var_multi_secret.value.isSecretRef).to.eql(true);
        expect(packagePolicy.vars.package_var_multi_secret.value.ids).to.eql(packageVarMultiIds);
        expect(packagePolicy.inputs[0].vars.input_var_secret.value.isSecretRef).to.eql(true);
        expect(packagePolicy.inputs[0].vars.input_var_secret.value.id).eql(inputVarId);
        expect(packagePolicy.inputs[0].streams[0].vars.stream_var_secret.value.isSecretRef).to.eql(
          true
        );
        expect(packagePolicy.inputs[0].streams[0].vars.stream_var_secret.value.id).eql(streamVarId);
      });

      it('should have correctly created the secrets', async () => {
        const packageVarId = packagePolicyWithSecrets.vars.package_var_secret.value.id;
        const packageVarMultiIds = packagePolicyWithSecrets.vars.package_var_multi_secret.value.ids;
        const inputVarId = packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.id;
        const streamVarId =
          packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.id;

        const searchRes = await getSecrets([
          packageVarId,
          ...packageVarMultiIds,
          inputVarId,
          streamVarId,
        ]);

        expect(searchRes.hits.hits.length).to.eql(5);

        const secretValuesById = searchRes.hits.hits.reduce((acc: any, secret: any) => {
          acc[secret._id] = secret._source.value;
          return acc;
        }, {});
        expect(secretValuesById[packageVarId]).to.eql('package_secret_val');
        expect(secretValuesById[packageVarMultiIds[0]]).to.eql('package_multi_secret_val_1');
        expect(secretValuesById[packageVarMultiIds[1]]).to.eql('package_multi_secret_val_2');
        expect(secretValuesById[inputVarId]).to.eql('input_secret_val');
        expect(secretValuesById[streamVarId]).to.eql('stream_secret_val');
      });

      it('should have written the secrets to the .fleet-policies index', async () => {
        const { data: policyDoc } = await getLatestPolicyRevision(testAgentPolicy.id);

        const packageVarId = packagePolicyWithSecrets.vars.package_var_secret.value.id;
        const packageVarMultiIds = packagePolicyWithSecrets.vars.package_var_multi_secret.value.ids;
        const inputVarId = packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.id;
        const streamVarId =
          packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.id;

        expect(
          arrayIdsEqual(policyDoc.secret_references!, [
            {
              id: packageVarId,
            },
            {
              id: packageVarMultiIds[0],
            },
            {
              id: packageVarMultiIds[1],
            },
            {
              id: inputVarId,
            },
            {
              id: streamVarId,
            },
          ])
        ).to.eql(true);

        expect(policyDoc.inputs[0].package_var_secret).to.eql(secretVar(packageVarId));
        expect(policyDoc.inputs[0].package_var_multi_secret).to.eql([
          secretVar(packageVarMultiIds[0]),
          secretVar(packageVarMultiIds[1]),
        ]);
        expect(policyDoc.inputs[0].input_var_secret).to.eql(secretVar(inputVarId));
        expect(policyDoc.inputs[0].streams![0].package_var_secret).to.eql(secretVar(packageVarId));
        expect(policyDoc.inputs[0].streams![0].input_var_secret).to.eql(secretVar(inputVarId));
        expect(policyDoc.inputs[0].streams![0].stream_var_secret).to.eql(secretVar(streamVarId));
      });

      it('should return secret refs from agent policy API', async () => {
        const agentPolicy = await getFullAgentPolicyById(testAgentPolicy.id);

        const input = agentPolicy.inputs[0];

        const packageVarId = packagePolicyWithSecrets.vars.package_var_secret.value.id;
        const packageVarMultiIds = packagePolicyWithSecrets.vars.package_var_multi_secret.value.ids;
        const inputVarId = packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.id;
        const streamVarId =
          packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.id;

        expect(
          arrayIdsEqual(agentPolicy.secret_references!, [
            {
              id: packageVarId,
            },
            {
              id: packageVarMultiIds[0],
            },
            {
              id: packageVarMultiIds[1],
            },
            {
              id: inputVarId,
            },
            {
              id: streamVarId,
            },
          ])
        ).to.eql(true);

        expect(input.package_var_secret).to.eql(secretVar(packageVarId));
        expect(input.package_var_multi_secret).to.eql([
          secretVar(packageVarMultiIds[0]),
          secretVar(packageVarMultiIds[1]),
        ]);
        expect(input.input_var_secret).to.eql(secretVar(inputVarId));
        expect(input.streams[0].package_var_secret).to.eql(secretVar(packageVarId));
        expect(input.streams[0].input_var_secret).to.eql(secretVar(inputVarId));
        expect(input.streams[0].stream_var_secret).to.eql(secretVar(streamVarId));
      });
    });

    describe('update package policy with secrets', () => {
      let testAgentPolicy: any;
      let fleetServerAgentPolicy: any;
      let packagePolicyWithSecrets: any;
      let updatedPackagePolicy: any;

      before(async () => {
        // Policy secrets require at least one Fleet server on v8.10+
        const createFleetServerAgentPolicyRes = await createFleetServerAgentPolicy();
        fleetServerAgentPolicy = createFleetServerAgentPolicyRes.fleetServerAgentPolicy;

        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.10.0');

        // Re-run setup to detect new Fleet Server agent + policy and enable secrets
        await callFleetSetup();

        testAgentPolicy = await createAgentPolicy();
        packagePolicyWithSecrets = await createPackagePolicyWithSecrets(testAgentPolicy.id);

        const updatedPolicy = createdPolicyToUpdatePolicy(packagePolicyWithSecrets);
        updatedPolicy.vars.package_var_secret.value = 'new_package_secret_val';
        updatedPolicy.vars.package_var_multi_secret.value = [
          'new_package_multi_secret_val_1',
          'new_package_multi_secret_val_2',
        ];

        const updateRes = await supertest
          .put(`/api/fleet/package_policies/${packagePolicyWithSecrets.id}`)
          .set('kbn-xsrf', 'xxxx')
          .send(updatedPolicy)
          .expect(200);

        updatedPackagePolicy = updateRes.body.item;
      });

      after(async () => {
        await cleanupAgents();
        await cleanupPolicies();
        await cleanupSecrets();
      });

      it('should allow secret values to be updated (single policy update API)', async () => {
        const updatedPackageVarId = updatedPackagePolicy.vars.package_var_secret.value.id;
        const updatedPackageVarMultiIds =
          updatedPackagePolicy.vars.package_var_multi_secret.value.ids;
        expect(updatedPackageVarId).to.be.a('string');
        expect(updatedPackageVarMultiIds).to.be.an('array');
        expect(updatedPackageVarMultiIds.length).to.eql(2);

        const inputVarId = packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.id;
        const streamVarId =
          packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.id;

        expect(
          arrayIdsEqual(updatedPackagePolicy.secret_references, [
            { id: updatedPackageVarId },
            { id: updatedPackageVarMultiIds[0] },
            { id: updatedPackageVarMultiIds[1] },
            { id: streamVarId },
            { id: inputVarId },
          ])
        ).to.eql(true);

        expect(updatedPackagePolicy.inputs[0].streams[0].compiled_stream).to.eql({
          'config.version': 2,
          package_var_secret: secretVar(updatedPackageVarId),
          package_var_multi_secret: [
            secretVar(updatedPackageVarMultiIds[0]),
            secretVar(updatedPackageVarMultiIds[1]),
          ],
          package_var_non_secret: 'package_non_secret_val',
          input_var_secret: secretVar(inputVarId),
          input_var_non_secret: 'input_non_secret_val',
          stream_var_secret: secretVar(streamVarId),
          stream_var_non_secret: 'stream_non_secret_val',
        });

        expect(updatedPackagePolicy.inputs[0].compiled_input).to.eql({
          package_var_secret: secretVar(updatedPackageVarId),
          package_var_multi_secret: [
            secretVar(updatedPackageVarMultiIds[0]),
            secretVar(updatedPackageVarMultiIds[1]),
          ],
          package_var_non_secret: 'package_non_secret_val',
          input_var_secret: secretVar(inputVarId),
          input_var_non_secret: 'input_non_secret_val',
        });

        expect(updatedPackagePolicy.vars.package_var_secret.value.isSecretRef).to.eql(true);
        expect(updatedPackagePolicy.vars.package_var_secret.value.id).eql(updatedPackageVarId);
        expect(updatedPackagePolicy.vars.package_var_multi_secret.value.isSecretRef).to.eql(true);
        expect(updatedPackagePolicy.vars.package_var_multi_secret.value.ids).to.eql(
          updatedPackageVarMultiIds
        );
        expect(updatedPackagePolicy.inputs[0].vars.input_var_secret.value.isSecretRef).to.eql(true);
        expect(updatedPackagePolicy.inputs[0].vars.input_var_secret.value.id).eql(inputVarId);
        expect(
          updatedPackagePolicy.inputs[0].streams[0].vars.stream_var_secret.value.isSecretRef
        ).to.eql(true);
        expect(updatedPackagePolicy.inputs[0].streams[0].vars.stream_var_secret.value.id).eql(
          streamVarId
        );
      });

      it('should have correctly deleted unused secrets after update', async () => {
        // Secret deletion is async — retry until the expected count is reached
        let searchRes: Awaited<ReturnType<typeof getSecrets>> | undefined;
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          searchRes = await getSecrets();
          if (searchRes.hits.hits.length === 5) break;
        }
        expect(searchRes!.hits.hits.length).to.eql(5); // should have created 2 and deleted 2 docs

        const secretValuesById = searchRes!.hits.hits.reduce((acc: any, secret: any) => {
          acc[secret._id] = secret._source.value;
          return acc;
        }, {});

        const updatedPackageVarId = updatedPackagePolicy.vars.package_var_secret.value.id;
        const updatedPackageVarMultiIds =
          updatedPackagePolicy.vars.package_var_multi_secret.value.ids;
        expect(updatedPackageVarId).to.be.a('string');

        const inputVarId = packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.id;
        const streamVarId =
          packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.id;

        expect(secretValuesById[updatedPackageVarId]).to.eql('new_package_secret_val');
        expect(secretValuesById[updatedPackageVarMultiIds[0]]).to.eql(
          'new_package_multi_secret_val_1'
        );
        expect(secretValuesById[updatedPackageVarMultiIds[1]]).to.eql(
          'new_package_multi_secret_val_2'
        );
        expect(secretValuesById[inputVarId]).to.eql('input_secret_val');
        expect(secretValuesById[streamVarId]).to.eql('stream_secret_val');
      });
    });

    describe('copy agent policy with secrets', () => {
      let testAgentPolicy: any;
      let fleetServerAgentPolicy: any;
      let packagePolicyWithSecrets: any;
      let policyDoc: any;
      let duplicatedAgentPolicy: any;
      let duplicatedPackagePolicy: any;

      before(async () => {
        // Policy secrets require at least one Fleet server on v8.10+
        const createFleetServerAgentPolicyRes = await createFleetServerAgentPolicy();
        fleetServerAgentPolicy = createFleetServerAgentPolicyRes.fleetServerAgentPolicy;

        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.10.0');

        // Re-run setup to detect new Fleet Server agent + policy and enable secrets
        await callFleetSetup();

        testAgentPolicy = await createAgentPolicy();
        packagePolicyWithSecrets = await createPackagePolicyWithSecrets(testAgentPolicy.id);

        const { body: agentPolicy } = await supertest
          .post(`/api/fleet/agent_policies/${testAgentPolicy.id}/copy`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `${testAgentPolicy.id} copy`,
          })
          .expect(200);

        duplicatedAgentPolicy = agentPolicy.item;

        const { data } = await getLatestPolicyRevision(duplicatedAgentPolicy.id);
        policyDoc = data;

        duplicatedPackagePolicy = duplicatedAgentPolicy.package_policies[0];
      });

      after(async () => {
        await cleanupAgents();
        await cleanupPolicies();
        await cleanupSecrets();
      });

      it('should not duplicate secrets after duplicating agent policy', async () => {
        const packageVarId = duplicatedPackagePolicy.vars.package_var_secret.value.id;
        const packageVarMultiIds = duplicatedPackagePolicy.vars.package_var_multi_secret.value.ids;
        const inputVarId = duplicatedPackagePolicy.inputs[0].vars.input_var_secret.value.id;
        const streamVarId =
          duplicatedPackagePolicy.inputs[0].streams[0].vars.stream_var_secret.value.id;

        expect(
          arrayIdsEqual(policyDoc.secret_references!, [
            {
              id: packageVarId,
            },
            {
              id: packageVarMultiIds[0],
            },
            {
              id: packageVarMultiIds[1],
            },
            {
              id: inputVarId,
            },
            {
              id: streamVarId,
            },
          ])
        ).to.eql(true);

        expect(policyDoc.inputs[0].package_var_secret).to.eql(secretVar(packageVarId));
        expect(policyDoc.inputs[0].package_var_multi_secret).to.eql([
          secretVar(packageVarMultiIds[0]),
          secretVar(packageVarMultiIds[1]),
        ]);
        expect(policyDoc.inputs[0].input_var_secret).to.eql(secretVar(inputVarId));
        expect(policyDoc.inputs[0].streams![0].package_var_secret).to.eql(secretVar(packageVarId));
        expect(policyDoc.inputs[0].streams![0].input_var_secret).to.eql(secretVar(inputVarId));
        expect(policyDoc.inputs[0].streams![0].stream_var_secret).to.eql(secretVar(streamVarId));

        const searchRes = await getSecrets();

        expect(searchRes.hits.hits.length).to.eql(5);

        const secretValuesById = searchRes.hits.hits.reduce((acc: any, secret: any) => {
          acc[secret._id] = secret._source.value;
          return acc;
        }, {});

        expect(secretValuesById[packageVarId]).to.eql('package_secret_val');
        expect(secretValuesById[packageVarMultiIds[0]]).to.eql('package_multi_secret_val_1');
        expect(secretValuesById[packageVarMultiIds[1]]).to.eql('package_multi_secret_val_2');
        expect(secretValuesById[inputVarId]).to.eql('input_secret_val');
        expect(secretValuesById[streamVarId]).to.eql('stream_secret_val');
      });

      it('should not delete used secrets on secret update', async () => {
        const updatedPolicy = createdPolicyToUpdatePolicy(duplicatedPackagePolicy);
        delete updatedPolicy.name;

        updatedPolicy.vars.package_var_secret.value = 'new_package_secret_val_2';
        updatedPolicy.vars.package_var_multi_secret.value = [
          'new_package_multi_secret_val_3',
          'new_package_multi_secret_val_4',
        ];

        const updateRes = await supertest
          .put(`/api/fleet/package_policies/${duplicatedPackagePolicy.id}`)
          .set('kbn-xsrf', 'xxxx')
          .send(updatedPolicy)
          .expect(200);

        const updatedPackagePolicy = updateRes.body.item;
        const updatedPackageVarId = updatedPackagePolicy.vars.package_var_secret.value.id;
        const updatedPackageVarMultiIds =
          updatedPackagePolicy.vars.package_var_multi_secret.value.ids;

        const packageSecretIds = [
          packagePolicyWithSecrets.vars.package_var_secret.value.id,
          ...packagePolicyWithSecrets.vars.package_var_multi_secret.value.ids,
          updatedPackageVarId,
          ...updatedPackageVarMultiIds,
        ];

        const searchRes = await getSecrets(packageSecretIds);

        expect(searchRes.hits.hits.length).to.eql(6);
      });

      it('should not delete used secrets on delete of duplicated package policy', async () => {
        await supertest
          .delete(`/api/fleet/package_policies/${duplicatedPackagePolicy.id}`)
          .set('kbn-xsrf', 'xxxx')
          .expect(200);

        // Secret deletion is async — retry until the expected count is reached
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const searchRes = await getSecrets();
          // should have deleted new_package_secret_val_2 and new_package_multi_secret_val_3/4
          if (searchRes.hits.hits.length === 5) return;
        }

        throw new Error('Secrets not deleted to expected count of 5');
      });
    });

    describe('delete package policy', () => {
      let testAgentPolicy: any;
      let fleetServerAgentPolicy: any;
      let packagePolicyWithSecrets: any;

      before(async () => {
        // Policy secrets require at least one Fleet server on v8.10+
        const createFleetServerAgentPolicyRes = await createFleetServerAgentPolicy();
        fleetServerAgentPolicy = createFleetServerAgentPolicyRes.fleetServerAgentPolicy;

        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.10.0');

        // Re-run setup to detect new Fleet Server agent + policy and enable secrets
        await callFleetSetup();

        testAgentPolicy = await createAgentPolicy();
        packagePolicyWithSecrets = await createPackagePolicyWithSecrets(testAgentPolicy.id);
      });

      after(async () => {
        await cleanupAgents();
        await cleanupPolicies();
        await cleanupSecrets();
      });

      it('should delete all secrets on package policy delete', async () => {
        await deletePackagePolicy(packagePolicyWithSecrets.id);

        for (let i = 0; i < 3; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const searchRes = await getSecrets();
          if (searchRes.hits.hits.length === 0) {
            return;
          }
        }

        throw new Error('Secrets not deleted');
      });
    });

    describe('fleet server version requirements', () => {
      afterEach(async () => {
        await pRetry(
          async () => {
            await cleanupAgents();
            await cleanupPolicies();
            await cleanupSecrets();
          },
          { retries: 3 }
        );
      });
      it('should not store secrets if fleet server does not meet minimum version', async () => {
        const { fleetServerAgentPolicy } = await createFleetServerAgentPolicy();
        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '7.0.0');
        const { fleetServerAgentPolicy: fleetServerPolicy2 } = await createFleetServerAgentPolicy(); // extra policy to verify `or` condition
        await createFleetServerAgent(fleetServerPolicy2.id, 'server_1', '8.12.0');

        await callFleetSetup();

        const agentPolicy = await createAgentPolicy();
        const packagePolicyWithSecrets = await createPackagePolicyWithSecrets(agentPolicy.id);

        // secrets should be in plain text i.e not a secret reference
        expect(packagePolicyWithSecrets.vars.package_var_secret.value).eql('package_secret_val');
        expect(packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value).eql(
          'input_secret_val'
        );

        expect(packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value).eql(
          'stream_secret_val'
        );
      });

      it('should store secrets if there are no fleet servers', async () => {
        await createFleetServerAgentPolicy();
        const agentPolicy = await createAgentPolicy();
        const packagePolicyWithSecrets = await createPackagePolicyWithSecrets(agentPolicy.id);

        expect(packagePolicyWithSecrets.vars.package_var_secret.value.isSecretRef).to.eql(true);
      });

      it('should convert plain text values to secrets once fleet server requirements are met', async () => {
        const agentPolicy = await createAgentPolicy();
        const packagePolicyWithSecrets = await createPackagePolicyWithSecrets(agentPolicy.id);

        expect(packagePolicyWithSecrets.vars.package_var_secret.value).eql('package_secret_val');
        expect(packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value).eql(
          'input_secret_val'
        );
        expect(packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value).eql(
          'stream_secret_val'
        );

        const { fleetServerAgentPolicy } = await createFleetServerAgentPolicy();
        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.12.0');
        await callFleetSetup();

        const updatedPolicy = createdPolicyToUpdatePolicy(packagePolicyWithSecrets);
        delete updatedPolicy.name;

        updatedPolicy.vars.package_var_secret.value = 'package_secret_val_2';

        const updateRes = await supertest
          .put(`/api/fleet/package_policies/${packagePolicyWithSecrets.id}`)
          .set('kbn-xsrf', 'xxxx')
          .send(updatedPolicy)
          .expect(200);

        const updatedPolicyRes = updateRes.body.item;

        expect(updatedPolicyRes.vars.package_var_secret.value.isSecretRef).eql(true);
        expect(updatedPolicyRes.inputs[0].vars.input_var_secret.value.isSecretRef).eql(true);
        expect(updatedPolicyRes.inputs[0].streams[0].vars.stream_var_secret.value.isSecretRef).eql(
          true
        );
      });

      it('should not revert to plaintext values if the user adds an out of date fleet server', async () => {
        const agentPolicy = await createAgentPolicy();
        const { fleetServerAgentPolicy } = await createFleetServerAgentPolicy();
        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.12.0');
        await callFleetSetup();

        const packagePolicyWithSecrets = await createPackagePolicyWithSecrets(agentPolicy.id);

        expect(packagePolicyWithSecrets.vars.package_var_secret.value.isSecretRef).eql(true);
        expect(packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.isSecretRef).eql(
          true
        );
        expect(
          packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.isSecretRef
        ).eql(true);

        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_3', '7.0.0');

        const refetchedPackagePolicyWithSecrets = await supertest.get(
          `/api/fleet/package_policies/${packagePolicyWithSecrets.id}`
        );

        const refetchedPackagePolicy = refetchedPackagePolicyWithSecrets.body.item;

        expect(refetchedPackagePolicy.vars.package_var_secret.value.isSecretRef).eql(true);
        expect(refetchedPackagePolicy.inputs[0].vars.input_var_secret.value.isSecretRef).eql(true);
        expect(
          refetchedPackagePolicy.inputs[0].streams[0].vars.stream_var_secret.value.isSecretRef
        ).eql(true);
      });

      it('should store new secrets after package upgrade', async () => {
        const agentPolicy = await createAgentPolicy();

        const { fleetServerAgentPolicy } = await createFleetServerAgentPolicy();
        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_3', '8.12.0');
        await callFleetSetup();

        const packagePolicyWithSecrets = await createPackagePolicyWithSecrets(agentPolicy.id);

        // Install newer version of secrets package
        await supertest
          .post('/api/fleet/epm/packages/secrets/1.1.0')
          .set('kbn-xsrf', 'xxxx')
          .send({ force: true })
          .expect(200);

        // Upgrade package policy
        await supertest
          .post(`/api/fleet/package_policies/upgrade`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            packagePolicyIds: [packagePolicyWithSecrets.id],
          })
          .expect(200);

        // Fetch policy again
        const res = await supertest.get(
          `/api/fleet/package_policies/${packagePolicyWithSecrets.id}`
        );

        const upgradedPolicy = res.body.item;

        const packageSecretVarId = upgradedPolicy.vars.package_var_secret.value.id;
        const packageNonSecretVarId = upgradedPolicy.vars.package_var_non_secret.value.id;
        const inputSecretVarId = upgradedPolicy.inputs[0].vars.input_var_secret.value.id;
        const inputNonSecretVarId = upgradedPolicy.inputs[0].vars.input_var_non_secret.value.id;
        const streamSecretVarId =
          upgradedPolicy.inputs[0].streams[0].vars.stream_var_secret.value.id;
        const streamNonSecretVarId =
          upgradedPolicy.inputs[0].streams[0].vars.stream_var_non_secret.value.id;

        expect(
          arrayIdsEqual(upgradedPolicy.secret_references, [
            { id: packageSecretVarId },
            { id: packageNonSecretVarId },
            { id: inputSecretVarId },
            { id: inputNonSecretVarId },
            { id: streamSecretVarId },
            { id: streamNonSecretVarId },
          ])
        ).to.eql(true);

        expect(upgradedPolicy.inputs[0].compiled_input).to.eql({
          package_var_secret: secretVar(packageSecretVarId),
          package_var_non_secret: secretVar(packageNonSecretVarId),
          input_var_secret: secretVar(inputSecretVarId),
          input_var_non_secret: secretVar(inputNonSecretVarId),
        });

        expect(upgradedPolicy.inputs[0].streams[0].compiled_stream).to.eql({
          'config.version': '2',
          package_var_secret: secretVar(packageSecretVarId),
          package_var_non_secret: secretVar(packageNonSecretVarId),
          input_var_secret: secretVar(inputSecretVarId),
          input_var_non_secret: secretVar(inputNonSecretVarId),
          stream_var_secret: secretVar(streamSecretVarId),
          stream_var_non_secret: secretVar(streamNonSecretVarId),
        });

        expect(upgradedPolicy.vars.package_var_secret.value.isSecretRef).to.eql(true);
        expect(upgradedPolicy.vars.package_var_non_secret.value.isSecretRef).to.eql(true);
        expect(upgradedPolicy.inputs[0].vars.input_var_secret.value.isSecretRef).to.eql(true);
        expect(upgradedPolicy.inputs[0].vars.input_var_non_secret.value.isSecretRef).to.eql(true);
        expect(upgradedPolicy.inputs[0].streams[0].vars.stream_var_secret.value.isSecretRef).to.eql(
          true
        );
        expect(
          upgradedPolicy.inputs[0].streams[0].vars.stream_var_non_secret.value.isSecretRef
        ).to.eql(true);
      });

      it('should store secrets if additional fleet server does not meet minimum version, but is unenrolled', async () => {
        const { fleetServerAgentPolicy } = await createFleetServerAgentPolicy();
        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.12.0');
        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_2', '7.0.0', 'unenrolled');

        await callFleetSetup();

        const agentPolicy = await createAgentPolicy();
        const packagePolicyWithSecrets = await createPackagePolicyWithSecrets(agentPolicy.id);

        expect(packagePolicyWithSecrets.vars.package_var_secret.value.isSecretRef).to.eql(true);
        expect(packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.isSecretRef).to.eql(
          true
        );
        expect(
          packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.isSecretRef
        ).to.eql(true);
      });

      it('should not store secrets if additional fleet server does not meet minimum version, but is inactive', async () => {
        const { fleetServerAgentPolicy } = await createFleetServerAgentPolicy();
        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.12.0');
        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '7.0.0', 'inactive');

        await callFleetSetup();

        const agentPolicy = await createAgentPolicy();
        const packagePolicyWithSecrets = await createPackagePolicyWithSecrets(agentPolicy.id);

        expect(packagePolicyWithSecrets.vars.package_var_secret.value).eql('package_secret_val');
        expect(packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value).eql(
          'input_secret_val'
        );
        expect(packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value).eql(
          'stream_secret_val'
        );
      });

      describe('managed policies', () => {
        it('should store secrets if additional fleet server does not meet minimum version, but is inactive + managed', async () => {
          // Ensure default output exists
          await callFleetSetup();

          const { fleetServerAgentPolicy } = await createFleetServerAgentPolicy({
            isManaged: true,
          });
          await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.12.0');
          await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_2', '7.0.0', 'inactive');

          await callFleetSetup();

          const agentPolicy = await createAgentPolicy();
          const packagePolicyWithSecrets = await createPackagePolicyWithSecrets(agentPolicy.id);

          expect(packagePolicyWithSecrets.vars.package_var_secret.value.isSecretRef).to.eql(true);

          expect(packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.isSecretRef).to.eql(
            true
          );

          // Managed policies can't be deleted easily, so we have to nuke SO's instead
          await kibanaServer.savedObjects.cleanStandardList();
        });

        it('should store secrets if fleet server does not meet minimum version, but is offline + managed', async () => {
          // Ensure default output exists
          await callFleetSetup();

          const { fleetServerAgentPolicy } = await createFleetServerAgentPolicy({
            isManaged: true,
          });
          await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '7.0.0', 'offline');

          await callFleetSetup();

          const agentPolicy = await createAgentPolicy();
          const packagePolicyWithSecrets = await createPackagePolicyWithSecrets(agentPolicy.id);

          expect(packagePolicyWithSecrets.vars.package_var_secret.value.isSecretRef).to.eql(true);
          expect(packagePolicyWithSecrets.inputs[0].vars.input_var_secret.value.isSecretRef).to.eql(
            true
          );
          expect(
            packagePolicyWithSecrets.inputs[0].streams[0].vars.stream_var_secret.value.isSecretRef
          ).to.eql(true);

          // Managed policies can't be deleted easily, so we have to nuke SO's instead
          await kibanaServer.savedObjects.cleanStandardList();
        });
      });
    });

    describe('output secrets', () => {
      afterEach(async () => {
        await cleanupAgents();
        await cleanupPolicies();
        await cleanupSecrets();
      });

      // TODO: Output secrets should be moved to another test suite
      it('should return output secrets if policy uses output with secrets', async () => {
        // ensure output is created
        await callFleetSetup();

        // Output secrets require at least one Fleet server on 8.12.0 or higher (and none under 8.12.0).
        const { fleetServerAgentPolicy } = await createFleetServerAgentPolicy();
        await createFleetServerAgent(fleetServerAgentPolicy.id, 'server_1', '8.12.0');
        await callFleetSetup();

        const outputWithSecret = await createOutputWithSecret();

        const { body: agentPolicyResponse } = await supertest
          .post(`/api/fleet/agent_policies`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Test policy ${uuidv4()}`,
            namespace: 'default',
            data_output_id: outputWithSecret.id,
            monitoring_output_id: outputWithSecret.id,
          })
          .expect(200);

        const fullAgentPolicy = await getFullAgentPolicyById(agentPolicyResponse.item.id);

        const passwordSecretId = outputWithSecret!.secrets?.password?.id;

        expect(fullAgentPolicy.secret_references).to.eql([{ id: passwordSecretId }]);

        const output = Object.entries(fullAgentPolicy.outputs)[0][1];

        // @ts-expect-error
        expect(output?.secrets?.password?.id).to.eql(passwordSecretId);

        // delete output with secret
        await supertest
          .delete(`/api/fleet/outputs/${outputWithSecret.id}`)
          .set('kbn-xsrf', 'xxxx')
          .expect(200);
      });
    });
  });
}
