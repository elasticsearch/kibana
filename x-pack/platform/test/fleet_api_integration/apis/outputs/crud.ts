/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type {
  CreateAgentPolicyResponse,
  GetOneAgentPolicyResponse,
} from '@kbn/fleet-plugin/common';
import {
  GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
  OUTPUT_HEALTH_DATA_STREAM,
} from '@kbn/fleet-plugin/common/constants';
import { v4 as uuidV4 } from 'uuid';
import type { FtrProviderContext } from '../../../api_integration/ftr_provider_context';
import { enableSecrets, skipIfNoDockerRegistry } from '../../helpers';

export default function (providerContext: FtrProviderContext) {
  const { getService } = providerContext;
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const es = getService('es');
  const fleetAndAgents = getService('fleetAndAgents');

  let pkgVersion: string;

  const getSecretById = (id: string) => {
    return es.get({
      index: '.fleet-secrets',
      id,
    });
  };

  const deleteAllSecrets = async () => {
    try {
      await es.deleteByQuery({
        index: '.fleet-secrets',
        query: {
          match_all: {},
        },
      });
    } catch (err) {
      // index doesn't exist
    }
  };

  const enableOutputSecrets = async () => {
    try {
      await kibanaServer.savedObjects.create({
        type: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
        id: 'fleet-default-settings',
        attributes: {
          output_secret_storage_requirements_met: true,
          use_space_awareness_migration_status: 'success',
        },
        overwrite: true,
      });
    } catch (e) {
      throw e;
    }
  };

  const disableOutputSecrets = async () => {
    try {
      await kibanaServer.savedObjects.create({
        type: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
        id: 'fleet-default-settings',
        attributes: {
          output_secret_storage_requirements_met: false,
          use_space_awareness_migration_status: 'success',
        },
        overwrite: true,
      });
    } catch (e) {
      throw e;
    }
  };

  const createFleetServerAgent = async (
    agentPolicyId: string,
    hostname: string,
    agentVersion: string
  ) => {
    const agentResponse = await es.index({
      index: '.fleet-agents',
      refresh: true,
      document: {
        access_api_key_id: 'api-key-3',
        active: true,
        policy_id: agentPolicyId,
        type: 'PERMANENT',
        local_metadata: {
          host: { hostname },
          elastic: { agent: { version: agentVersion } },
        },
        user_provided_metadata: {},
        enrolled_at: '2022-06-21T12:14:25Z',
        last_checkin: '2022-06-27T12:28:29Z',
        tags: ['tag1'],
      },
    });

    return agentResponse._id;
  };

  const clearAgents = async () => {
    try {
      await es.deleteByQuery({
        index: '.fleet-agents',
        refresh: true,
        query: {
          match_all: {},
        },
      });
    } catch (err) {
      // index doesn't exist
    }
  };

  const createAgentPolicy = async (
    spaceId?: string,
    dataOutputId?: string
  ): Promise<CreateAgentPolicyResponse> => {
    const { body: testPolicyRes } = await supertest
      .post(spaceId ? `/s/${spaceId}/api/fleet/agent_policies` : `/api/fleet/agent_policies`)
      .set('kbn-xsrf', 'xxxx')
      .send({
        name: `test ${uuidV4()}`,
        description: '',
        namespace: 'default',
        ...(dataOutputId ? { data_output_id: dataOutputId } : {}),
      })
      .expect(200);

    return testPolicyRes;
  };

  const deleteAgentPolicy = async (agentPolicyId: string, spaceId?: string) => {
    await supertest
      .post(
        spaceId
          ? `/s/${spaceId}/api/fleet/agent_policies/delete`
          : `/api/fleet/agent_policies/delete`
      )
      .send({
        agentPolicyId,
      })
      .set('kbn-xsrf', 'xxxx')
      .expect(200);
  };

  const createPackagePolicy = async (
    agentPolicyIds: string[],
    spaceId?: string,
    outputId?: string
  ): Promise<CreateAgentPolicyResponse> => {
    const { body: testPolicyRes } = await supertest
      .post(spaceId ? `/s/${spaceId}/api/fleet/package_policies` : `/api/fleet/package_policies`)
      .set('kbn-xsrf', 'xxxx')
      .send({
        name: `package ${uuidV4()}`,
        description: '',
        namespace: 'default',
        policy_ids: agentPolicyIds,
        enabled: true,
        inputs: [],
        package: {
          name: 'filetest',
          title: 'For File Tests',
          version: '0.1.0',
        },
        ...(outputId ? { output_id: outputId } : {}),
      })
      .expect(200);

    return testPolicyRes;
  };

  const getAgentPolicy = async (
    policyId: string,
    spaceId?: string
  ): Promise<GetOneAgentPolicyResponse> => {
    const { body: testPolicyRes } = await supertest
      .get(
        spaceId
          ? `/s/${spaceId}/api/fleet/agent_policies/${policyId}`
          : `/api/fleet/agent_policies/${policyId}`
      )
      .expect(200);

    return testPolicyRes;
  };

  const TEST_SPACE_ID = 'testspaceoutputs';

  describe('fleet_outputs_crud', function () {
    let defaultOutputId: string;
    let ESOutputId: string;
    let fleetServerPolicyId: string;
    let fleetServerPolicyWithCustomOutputId: string;

    skipIfNoDockerRegistry(providerContext);
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.load('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');
      await fleetAndAgents.setup();
      await enableSecrets(providerContext);
      await enableOutputSecrets();
      await kibanaServer.spaces
        .create({
          id: TEST_SPACE_ID,
          name: TEST_SPACE_ID,
        })
        .catch((err) => {});
      // we must first force install the fleet_server package to override package verification error on policy create
      // https://github.com/elastic/kibana/issues/137450
      const getPkRes = await supertest
        .get(`/api/fleet/epm/packages/fleet_server`)
        .set('kbn-xsrf', 'xxxx')
        .expect(200);
      pkgVersion = getPkRes.body.item.version;

      await deleteAllSecrets();

      await supertest
        .post(`/api/fleet/epm/packages/fleet_server/${pkgVersion}`)
        .set('kbn-xsrf', 'xxxx')
        .send({ force: true })
        .expect(200);

      let { body: apiResponse } = await supertest
        .post(`/api/fleet/agent_policies`)
        .set('kbn-xsrf', 'kibana')
        .send({
          name: 'Fleet Server policy 1',
          namespace: 'default',
          has_fleet_server: true,
        })
        .expect(200);
      const fleetServerPolicy = apiResponse.item;
      fleetServerPolicyId = fleetServerPolicy.id;

      ({ body: apiResponse } = await supertest
        .post(`/api/fleet/agent_policies`)
        .set('kbn-xsrf', 'kibana')
        .send({
          name: 'Agent policy 1',
          namespace: 'default',
        })
        .expect(200));

      const agentPolicy = apiResponse.item;

      if (!fleetServerPolicy) {
        throw new Error('No Fleet server policy');
      }

      if (!agentPolicy) {
        throw new Error('No agent policy');
      }

      await supertest
        .post(`/api/fleet/fleet_server_hosts`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          id: 'test-default-123',
          name: 'Default',
          is_default: true,
          host_urls: ['https://test.fr:8080'],
        })
        .expect(200);

      const { body: getOutputsRes } = await supertest.get(`/api/fleet/outputs`).expect(200);

      const defaultOutput = getOutputsRes.items.find((item: any) => item.is_default);
      if (!defaultOutput) {
        throw new Error('default output not set');
      }

      defaultOutputId = defaultOutput.id;

      const { body: postResponse1 } = await supertest
        .post(`/api/fleet/outputs`)
        .set('kbn-xsrf', 'xxxx')
        .send({
          name: 'ESoutput',
          type: 'elasticsearch',
          hosts: ['https://test.fr'],
        })
        .expect(200);
      ESOutputId = postResponse1.item.id;

      ({ body: apiResponse } = await supertest
        .post(`/api/fleet/agent_policies`)
        .set('kbn-xsrf', 'kibana')
        .send({
          name: 'Preconfigured Fleet Server policy',
          namespace: 'default',
          has_fleet_server: true,
          data_output_id: `${ESOutputId}`,
        })
        .expect(200));
      const fleetServerPolicyWithCustomOutput = apiResponse.item;
      fleetServerPolicyWithCustomOutputId = fleetServerPolicyWithCustomOutput.id;
    });

    after(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');
    });

    describe('GET /outputs', () => {
      it('should list all the outputs', async () => {
        const { body: getOutputsRes } = await supertest.get(`/api/fleet/outputs`).expect(200);

        expect(getOutputsRes.items.length).to.eql(2);
        const findDefault = getOutputsRes.items.find((item: any) => item.is_default === true);
        expect(findDefault.id).to.eql(defaultOutputId);
      });
    });

    describe('GET /outputs/{outputId}', () => {
      it('should allow return the default output', async () => {
        const { body: getOutputRes } = await supertest
          .get(`/api/fleet/outputs/${defaultOutputId}`)
          .expect(200);

        expect(getOutputRes.item).to.have.keys('id', 'name', 'type', 'is_default', 'hosts');
      });
    });

    describe('GET /outputs/{outputId}/health', () => {
      before(async () => {
        await es.index({
          refresh: 'wait_for',
          index: OUTPUT_HEALTH_DATA_STREAM,
          document: {
            state: 'HEALTHY',
            message: '',
            '@timestamp': new Date(Date.now() - 1).toISOString(),
            output: defaultOutputId,
          },
        });

        await es.index({
          refresh: 'wait_for',
          index: OUTPUT_HEALTH_DATA_STREAM,
          document: {
            state: 'DEGRADED',
            message: 'connection error',
            '@timestamp': new Date().toISOString(),
            output: defaultOutputId,
          },
        });

        await es.index({
          refresh: 'wait_for',
          index: OUTPUT_HEALTH_DATA_STREAM,
          document: {
            state: 'HEALTHY',
            message: '',
            '@timestamp': '' + Date.parse('2023-11-31T14:25:31Z'),
            output: ESOutputId,
          },
        });
      });
      it('should allow return the latest output health', async () => {
        const { body: outputHealth } = await supertest
          .get(`/api/fleet/outputs/${defaultOutputId}/health`)
          .expect(200);

        expect(outputHealth.state).to.equal('DEGRADED');
        expect(outputHealth.message).to.equal('connection error');
        expect(outputHealth.timestamp).not.to.be.empty();
      });
      it('should not return output health if older than output last updated time', async () => {
        const { body: outputHealth } = await supertest
          .get(`/api/fleet/outputs/${ESOutputId}/health`)
          .expect(200);

        expect(outputHealth.state).to.equal('UNKNOWN');
      });
    });

    describe('PUT /outputs/{outputId}', () => {
      it('should explicitly set port on ES hosts', async function () {
        await supertest
          .put(`/api/fleet/outputs/${defaultOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({ hosts: ['https://test.fr'] })
          .expect(200);

        const {
          body: { item: output },
        } = await supertest.get(`/api/fleet/outputs/${defaultOutputId}`).expect(200);

        expect(output.hosts).to.eql(['https://test.fr:443']);
      });

      it('should return a 404 when updating a non existing output', async function () {
        await supertest
          .put(`/api/fleet/outputs/idonotexists`)
          .set('kbn-xsrf', 'xxxx')
          .send({ hosts: ['https://test.fr'] })
          .expect(404);
      });

      it('should not allow to update a default ES output to logstash', async function () {
        const { body } = await supertest
          .put(`/api/fleet/outputs/${defaultOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(400);
        expect(body.message).to.eql(
          'Logstash output cannot be used with Fleet Server integration in Fleet Server policy 1. Please create a new Elasticsearch output.'
        );
      });

      it('should not allow to update a default ES output to Kafka', async function () {
        const { body } = await supertest
          .put(`/api/fleet/outputs/${defaultOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My Kafka Output',
            type: 'kafka',
            hosts: ['test.fr:2000'],
            auth_type: 'user_pass',
            username: 'user',
            password: 'pass',
            is_default: true,
            is_default_monitoring: true,
            topic: 'topic1',
          })
          .expect(400);
        expect(body.message).to.eql(
          'Kafka output cannot be used with Fleet Server integration in Fleet Server policy 1. Please create a new Elasticsearch output.'
        );
      });

      it('should allow to update a default ES output if keeping it ES', async function () {
        await supertest
          .put(`/api/fleet/outputs/${defaultOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Updated Default ES Output',
            type: 'elasticsearch',
            hosts: ['http://test.fr:443'],
          })
          .expect(200);
      });

      it('should respond 400 when setting an unknown preset', async function () {
        await supertest
          .put(`/api/fleet/outputs/${ESOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Updated Default ES Output',
            type: 'elasticsearch',
            hosts: ['http://test.fr:443'],
            preset: 'some_unknown_preset',
          })
          .expect(400);
      });

      it('should allow changing the preset from balanced to custom and back', async function () {
        await supertest
          .put(`/api/fleet/outputs/${ESOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Updated Default ES Output',
            type: 'elasticsearch',
            hosts: ['http://test.fr:443'],
            preset: 'custom',
            config_yaml: 'some_random_field: foo',
          })
          .expect(200);

        await supertest
          .put(`/api/fleet/outputs/${ESOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Updated Default ES Output',
            type: 'elasticsearch',
            hosts: ['http://test.fr:443'],
            preset: 'balanced',
            config_yaml: 'some_random_field: foo',
          })
          .expect(200);
      });

      it('should respond 400 when changing the preset from custom to balanced with reserved key', async function () {
        await supertest
          .put(`/api/fleet/outputs/${ESOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Updated Default ES Output',
            type: 'elasticsearch',
            hosts: ['http://test.fr:443'],
            preset: 'balanced',
            config_yaml: 'bulk_max_size: 1000',
          })
          .expect(400);
      });

      it('should allow to update a non-default ES output to logstash', async function () {
        const { body: postResponse2 } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'A Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(200);

        const { id: logstashOutput1Id } = postResponse2.item;
        await supertest
          .put(`/api/fleet/outputs/${logstashOutput1Id}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'A Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(200);

        const { body } = await supertest.get(`/api/fleet/agent_policies/${fleetServerPolicyId}`);
        const updatedFleetServerPolicy = body.item;
        expect(updatedFleetServerPolicy.data_output_id === defaultOutputId);

        const { body: bodyWithOutput } = await supertest.get(
          `/api/fleet/agent_policies/${fleetServerPolicyWithCustomOutputId}`
        );
        const updatedFleetServerPolicyWithCustomOutput = bodyWithOutput.item;
        expect(updatedFleetServerPolicyWithCustomOutput.data_output_id === ESOutputId);
      });

      it('should allow to update a non-default ES output to kafka', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Elasticsearch output',
            type: 'elasticsearch',
            hosts: ['https://test.fr:443'],
          })
          .expect(200);

        const { id: elasticsearchOutputId } = postResponse.item;
        await supertest
          .put(`/api/fleet/outputs/${elasticsearchOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'A Kafka Output',
            type: 'kafka',
          })
          .expect(200);

        const { body } = await supertest.get(`/api/fleet/agent_policies/${fleetServerPolicyId}`);
        const updatedFleetServerPolicy = body.item;
        expect(updatedFleetServerPolicy.data_output_id === defaultOutputId);

        const { body: bodyWithOutput } = await supertest.get(
          `/api/fleet/agent_policies/${fleetServerPolicyWithCustomOutputId}`
        );
        const updatedFleetServerPolicyWithCustomOutput = bodyWithOutput.item;
        expect(updatedFleetServerPolicyWithCustomOutput.data_output_id === ESOutputId);
      });

      it('should allow to update a default logstash output to logstash and fleet server policies should be updated', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Logstash Output 1',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(200);
        const { id: logstashOutput2Id } = postResponse.item;

        await supertest
          .put(`/api/fleet/outputs/${logstashOutput2Id}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443', 'test.com:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(200);

        await supertest.get(`/api/fleet/outputs`).expect(200);

        const { body } = await supertest.get(`/api/fleet/agent_policies/${fleetServerPolicyId}`);
        const updatedFleetServerPolicy = body.item;
        expect(updatedFleetServerPolicy.data_output_id === defaultOutputId);

        const { body: bodyWithOutput } = await supertest.get(
          `/api/fleet/agent_policies/${fleetServerPolicyWithCustomOutputId}`
        );
        const updatedFleetServerPolicyWithCustomOutput = bodyWithOutput.item;
        expect(updatedFleetServerPolicyWithCustomOutput.data_output_id === ESOutputId);
      });

      it('should allow to update a logstash output with the shipper values', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(200);
        const { id: newOutputId } = postResponse.item;

        await supertest
          .put(`/api/fleet/outputs/${newOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
            config_yaml: 'shipper: {}',
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
          })
          .expect(200);

        const {
          body: { items: outputs },
        } = await supertest.get(`/api/fleet/outputs`).expect(200);
        const newOutput = outputs.filter((o: any) => o.id === newOutputId);

        expect(newOutput[0].shipper).to.eql({
          compression_level: null,
          disk_queue_compression_enabled: null,
          disk_queue_enabled: true,
          disk_queue_encryption_enabled: true,
          disk_queue_max_size: null,
          disk_queue_path: 'path/to/disk/queue',
          loadbalance: null,
          max_batch_bytes: null,
          mem_queue_events: null,
          queue_flush_timeout: null,
        });
      });

      it('should discard the shipper values for default output when shipper is disabled', async function () {
        await supertest
          .put(`/api/fleet/outputs/${defaultOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'default monitoring output 1',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            is_default_monitoring: true,
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
          })
          .expect(200);
        const {
          body: { items: outputs },
        } = await supertest.get(`/api/fleet/outputs`).expect(200);
        const newOutput = outputs.filter((o: any) => o.id === defaultOutputId);
        expect(newOutput[0].shipper).to.equal(null);
      });

      it('should allow secrets to be updated + delete unused secret', async function () {
        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Kafka Output With Secret',
            type: 'kafka',
            hosts: ['test.fr:2000'],
            auth_type: 'ssl',
            topic: 'topic1',
            config_yaml: 'shipper: {}',
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
            ssl: {
              certificate: 'CERTIFICATE',
              certificate_authorities: ['CA1', 'CA2'],
            },
            secrets: {
              ssl: {
                key: 'KEY',
              },
            },
          })
          .expect(200);

        const outputId = res.body.item.id;
        const secretId = res.body.item.secrets.ssl.key.id;
        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.equal('KEY');

        const updateRes = await supertest
          .put(`/api/fleet/outputs/${outputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Kafka Output With Secret',
            type: 'kafka',
            hosts: ['test.fr:2000'],
            auth_type: 'ssl',
            topic: 'topic1',
            config_yaml: 'shipper: {}',
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
            ssl: {
              certificate: 'CERTIFICATE',
              certificate_authorities: ['CA1', 'CA2'],
            },
            secrets: {
              ssl: {
                key: 'NEW_KEY',
              },
            },
          })
          .expect(200);

        const updatedSecretId = updateRes.body.item.secrets.ssl.key.id;

        expect(updatedSecretId).not.to.equal(secretId);

        const updatedSecret = await getSecretById(updatedSecretId);

        // @ts-ignore _source unknown type
        expect(updatedSecret._source.value).to.equal('NEW_KEY');

        try {
          await getSecretById(secretId);
          expect().fail('Secret should have been deleted');
        } catch (e) {
          // not found
        }
      });

      it('should allow to update kibana_api_key on an existing remote_elasticsearch output', async function () {
        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Remote Output With kibana_api_key',
            type: 'remote_elasticsearch',
            hosts: ['https://test.fr:443'],
            kibana_url: 'https://testhost',
          })
          .expect(200);
        const outputId = res.body.item.id;
        const updatedRes = await supertest
          .put(`/api/fleet/outputs/${outputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Remote Output With kibana_api_key',
            type: 'remote_elasticsearch',
            hosts: ['https://test.fr:443'],
            sync_integrations: true,
            kibana_url: 'https://testhost',
            kibana_api_key: 'bbbb',
          })
          .expect(200);
        expect(updatedRes.body.item.kibana_api_key).to.equal('bbbb');
      });

      it('should bump all policies in all spaces if updating the default output', async () => {
        const { body: nonDefaultOutput } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Nondefault Output',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
          })
          .expect(200);

        const [policy1, policy2, policy3, policy4] = await Promise.all([
          createAgentPolicy(),
          createAgentPolicy(undefined, nonDefaultOutput.item.id),
          createAgentPolicy(TEST_SPACE_ID),
          createAgentPolicy(TEST_SPACE_ID, nonDefaultOutput.item.id),
        ]);

        // Create package policies with default output under agent policies not using default output
        // to ensure that those agent policies still get bumped
        await Promise.all([
          createPackagePolicy([policy2.item.id], undefined, defaultOutputId),
          createPackagePolicy([policy4.item.id], TEST_SPACE_ID, defaultOutputId),
        ]);

        await supertest
          .put(`/api/fleet/outputs/${defaultOutputId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Updated Default ES Output',
            type: 'elasticsearch',
            hosts: ['http://test.fr:443'],
          })
          .expect(200);

        const [updatedPolicy1, updatedPolicy2, updatedPolicy3, updatedPolicy4] = await Promise.all([
          getAgentPolicy(policy1.item.id),
          getAgentPolicy(policy2.item.id),
          getAgentPolicy(policy3.item.id, TEST_SPACE_ID),
          getAgentPolicy(policy4.item.id, TEST_SPACE_ID),
        ]);
        expect(updatedPolicy1.item.revision).to.eql(policy1.item.revision + 1);
        expect(updatedPolicy2.item.revision).to.eql(policy2.item.revision + 2);
        expect(updatedPolicy3.item.revision).to.eql(policy3.item.revision + 1);
        expect(updatedPolicy4.item.revision).to.eql(policy4.item.revision + 2);

        // cleanup
        await Promise.all([
          deleteAgentPolicy(policy1.item.id),
          deleteAgentPolicy(policy2.item.id),
          deleteAgentPolicy(policy3.item.id, TEST_SPACE_ID),
          deleteAgentPolicy(policy4.item.id, TEST_SPACE_ID),
        ]);
      });

      it('should bump all policies in all spaces if updating non-default output', async () => {
        const { body: nonDefaultOutput } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Nondefault Output',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
          })
          .expect(200);

        const [policy1, policy2, policy3, policy4] = await Promise.all([
          createAgentPolicy(),
          createAgentPolicy(undefined, nonDefaultOutput.item.id),
          createAgentPolicy(TEST_SPACE_ID),
          createAgentPolicy(TEST_SPACE_ID, nonDefaultOutput.item.id),
        ]);

        // Create package policies under agent policies using default output to ensure those
        // agent policies still get bumped
        await Promise.all([
          createPackagePolicy([policy1.item.id], undefined, nonDefaultOutput.item.id),
          createPackagePolicy([policy3.item.id], TEST_SPACE_ID, nonDefaultOutput.item.id),
        ]);

        await supertest
          .put(`/api/fleet/outputs/${nonDefaultOutput.item.id}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Updated Nondefault Output',
            type: 'elasticsearch',
            hosts: ['http://test.fr:443'],
          })
          .expect(200);

        const [updatedPolicy1, updatedPolicy2, updatedPolicy3, updatedPolicy4] = await Promise.all([
          getAgentPolicy(policy1.item.id),
          getAgentPolicy(policy2.item.id),
          getAgentPolicy(policy3.item.id, TEST_SPACE_ID),
          getAgentPolicy(policy4.item.id, TEST_SPACE_ID),
        ]);

        expect(updatedPolicy1.item.revision).to.eql(policy1.item.revision + 2);
        expect(updatedPolicy2.item.revision).to.eql(policy2.item.revision + 1);
        expect(updatedPolicy3.item.revision).to.eql(policy3.item.revision + 2);
        expect(updatedPolicy4.item.revision).to.eql(policy4.item.revision + 1);

        // cleanup
        await Promise.all([
          deleteAgentPolicy(policy1.item.id),
          deleteAgentPolicy(policy2.item.id),
          deleteAgentPolicy(policy3.item.id, TEST_SPACE_ID),
          deleteAgentPolicy(policy4.item.id, TEST_SPACE_ID),
        ]);
      });

      describe('with space awareness disabled', () => {
        beforeEach(async () => {
          await kibanaServer.savedObjects.update({
            type: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
            id: 'fleet-default-settings',
            attributes: {
              use_space_awareness_migration_status: null,
            },
            overwrite: true,
          });
        });
        afterEach(async () => {
          await kibanaServer.savedObjects.update({
            type: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
            id: 'fleet-default-settings',
            attributes: {
              use_space_awareness_migration_status: 'success',
            },
            overwrite: true,
          });
        });
        it('should bump all related policies if updating non-default output and space awareness is disabled', async () => {
          // Update settings to simulate older cluster
          await kibanaServer.savedObjects.update({
            type: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
            id: 'fleet-default-settings',
            attributes: {},
            overwrite: true,
          });
          const { body: nonDefaultOutput } = await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'Nondefault Output',
              type: 'elasticsearch',
              hosts: ['https://test.fr'],
            })
            .expect(200);

          const [policy1, policy2, policy3, policy4] = await Promise.all([
            createAgentPolicy(),
            createAgentPolicy(undefined, nonDefaultOutput.item.id),
            createAgentPolicy(TEST_SPACE_ID),
            createAgentPolicy(TEST_SPACE_ID, nonDefaultOutput.item.id),
          ]);

          // Create package policies under agent policies using default output to ensure those
          // agent policies still get bumped
          await Promise.all([
            createPackagePolicy([policy1.item.id], undefined, nonDefaultOutput.item.id),
            createPackagePolicy([policy3.item.id], TEST_SPACE_ID, nonDefaultOutput.item.id),
          ]);

          await supertest
            .put(`/api/fleet/outputs/${nonDefaultOutput.item.id}`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'Updated Nondefault Output',
              type: 'elasticsearch',
              hosts: ['http://test.fr:443'],
            })
            .expect(200);

          const [updatedPolicy1, updatedPolicy2, updatedPolicy3, updatedPolicy4] =
            await Promise.all([
              getAgentPolicy(policy1.item.id),
              getAgentPolicy(policy2.item.id),
              getAgentPolicy(policy3.item.id, TEST_SPACE_ID),
              getAgentPolicy(policy4.item.id, TEST_SPACE_ID),
            ]);

          expect(updatedPolicy1.item.revision).to.eql(policy1.item.revision + 2);
          expect(updatedPolicy2.item.revision).to.eql(policy2.item.revision + 1);
          expect(updatedPolicy3.item.revision).to.eql(policy3.item.revision + 2);
          expect(updatedPolicy4.item.revision).to.eql(policy4.item.revision + 1);

          // cleanup
          await Promise.all([
            deleteAgentPolicy(policy1.item.id),
            deleteAgentPolicy(policy2.item.id),
            deleteAgentPolicy(policy3.item.id, TEST_SPACE_ID),
            deleteAgentPolicy(policy4.item.id, TEST_SPACE_ID),
          ]);
        });
      });
    });

    describe('POST /outputs', () => {
      it('should allow to create an ES output ', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({ name: 'My output', type: 'elasticsearch', hosts: ['https://test.fr'] })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'My output',
          type: 'elasticsearch',
          hosts: ['https://test.fr:443'],
          is_default: false,
          is_default_monitoring: false,
          preset: 'balanced',
        });
      });

      it('should allow creating a new ES output with preset: custom', async () => {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My output',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            preset: 'custom',
            config_yaml: 'some_random_key: foo',
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'My output',
          type: 'elasticsearch',
          hosts: ['https://test.fr:443'],
          is_default: false,
          is_default_monitoring: false,
          preset: 'custom',
          config_yaml: 'some_random_key: foo',
        });
      });

      it('should respond with 400 when creating a new ES output with preset: balanced and a reserved key in config_yaml', async () => {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My output',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            preset: 'balanced',
            config_yaml: 'bulk_max_size: 1000',
          })
          .expect(400);
      });

      it('should respond with 400 when creating a new ES output with an unknown preset', async () => {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My output',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            preset: 'some_unknown_preset',
          })
          .expect(400);
      });

      it('should allow to create a new default ES output ', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Default ES output',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            is_default: true,
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'Default ES output',
          type: 'elasticsearch',
          hosts: ['https://test.fr:443'],
          is_default: true,
          is_default_monitoring: false,
          preset: 'balanced',
        });
      });

      it('should allow to create a new logstash output', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'My Logstash Output',
          type: 'logstash',
          hosts: ['test.fr:443'],
          is_default: false,
          is_default_monitoring: false,
          ssl: {
            certificate: 'CERTIFICATE',
            key: 'KEY',
            certificate_authorities: ['CA1', 'CA2'],
          },
        });
      });

      it('should allow to create a new logstash default output and fleet server policies should not change', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Default Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            is_default: true,
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'Default Logstash Output',
          type: 'logstash',
          hosts: ['test.fr:443'],
          is_default: true,
          is_default_monitoring: false,
          ssl: {
            certificate: 'CERTIFICATE',
            key: 'KEY',
            certificate_authorities: ['CA1', 'CA2'],
          },
        });

        const { body } = await supertest.get(`/api/fleet/agent_policies/${fleetServerPolicyId}`);
        const updatedFleetServerPolicy = body.item;
        expect(updatedFleetServerPolicy.data_output_id === defaultOutputId);

        const { body: bodyWithOutput } = await supertest.get(
          `/api/fleet/agent_policies/${fleetServerPolicyWithCustomOutputId}`
        );
        const updatedFleetServerPolicyWithCustomOutput = bodyWithOutput.item;
        expect(updatedFleetServerPolicyWithCustomOutput.data_output_id === ESOutputId);
      });

      it('should not allow to create a logstash output with http hosts ', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My Logstash Output',
            type: 'logstash',
            hosts: ['https://test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(400);

        expect(postResponse.message).match(
          /Host address must begin with a domain name or IP address/
        );
      });

      it('should allow to create a new kafka output', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My Kafka Output',
            type: 'kafka',
            hosts: ['test.fr:2000'],
            auth_type: 'user_pass',
            username: 'user',
            password: 'pass',
            topic: 'topic1',
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          is_default: false,
          is_default_monitoring: false,
          name: 'My Kafka Output',
          type: 'kafka',
          hosts: ['test.fr:2000'],
          auth_type: 'user_pass',
          username: 'user',
          password: 'pass',
          topic: 'topic1',
          broker_timeout: 10,
          required_acks: 1,
          client_id: 'Elastic',
          compression: 'gzip',
          compression_level: 4,
          sasl: {
            mechanism: 'PLAIN',
          },
          timeout: 30,
          partition: 'hash',
          version: '1.0.0',
        });
      });

      it('should allow to create a new kafka default output and fleet server policies should not change', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Default Kafka Output',
            type: 'kafka',
            hosts: ['test.fr:2000'],
            auth_type: 'user_pass',
            username: 'user',
            password: 'pass',
            topic: 'topic1',
            is_default: true,
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'Default Kafka Output',
          type: 'kafka',
          hosts: ['test.fr:2000'],
          auth_type: 'user_pass',
          username: 'user',
          password: 'pass',
          topic: 'topic1',
          is_default: true,
          is_default_monitoring: false,
          broker_timeout: 10,
          required_acks: 1,
          client_id: 'Elastic',
          compression: 'gzip',
          compression_level: 4,
          sasl: {
            mechanism: 'PLAIN',
          },
          timeout: 30,
          partition: 'hash',
          version: '1.0.0',
        });

        const { body } = await supertest.get(`/api/fleet/agent_policies/${fleetServerPolicyId}`);
        const updatedFleetServerPolicy = body.item;
        expect(updatedFleetServerPolicy.data_output_id === defaultOutputId);

        const { body: bodyWithOutput } = await supertest.get(
          `/api/fleet/agent_policies/${fleetServerPolicyWithCustomOutputId}`
        );
        const updatedFleetServerPolicyWithCustomOutput = bodyWithOutput.item;
        expect(updatedFleetServerPolicyWithCustomOutput.data_output_id === ESOutputId);
      });

      it('should toggle the default output when creating a new one', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'default output 1',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            is_default: true,
          })
          .expect(200);

        const {
          body: { item: output2 },
        } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'default output 2',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            is_default: true,
          })
          .expect(200);

        const {
          body: { items: outputs },
        } = await supertest.get(`/api/fleet/outputs`).expect(200);

        const defaultOutputs = outputs.filter((o: any) => o.is_default);
        expect(defaultOutputs).to.have.length(1);
        expect(defaultOutputs[0].id).eql(output2.id);
      });

      it('should toggle default monitoring output when creating a new default monitoring output ', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'default monitoring output 1',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            is_default_monitoring: true,
          })
          .expect(200);

        const {
          body: { item: output2 },
        } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'default monitoring output 2',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            is_default_monitoring: true,
          })
          .expect(200);

        const {
          body: { items: outputs },
        } = await supertest.get(`/api/fleet/outputs`).expect(200);

        const defaultOutputs = outputs.filter((o: any) => o.is_default_monitoring);
        expect(defaultOutputs).to.have.length(1);
        expect(defaultOutputs[0].id).eql(output2.id);
      });

      it('should allow to create an ES output with the shipper values when shipper is enabled', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'output 1',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            is_default_monitoring: true,
            config_yaml: 'shipper: {}',
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
          })
          .expect(200);
        const {
          body: { items: outputs },
        } = await supertest.get(`/api/fleet/outputs`).expect(200);
        const newOutput = outputs.filter((o: any) => o.name === 'output 1');
        expect(newOutput[0].shipper).to.eql({
          compression_level: null,
          disk_queue_compression_enabled: null,
          disk_queue_enabled: true,
          disk_queue_encryption_enabled: true,
          disk_queue_max_size: null,
          disk_queue_path: 'path/to/disk/queue',
          loadbalance: null,
          max_batch_bytes: null,
          mem_queue_events: null,
          queue_flush_timeout: null,
        });
      });

      it('should discard the shipper values when shipper is disabled', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'default monitoring output 1',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            is_default_monitoring: true,
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
          })
          .expect(200);
        const {
          body: { items: outputs },
        } = await supertest.get(`/api/fleet/outputs`).expect(200);
        const defaultOutputs = outputs.filter((o: any) => o.is_default_monitoring);
        expect(defaultOutputs[0].shipper).to.equal(null);
      });

      it('should allow to create a logstash output with the shipper values', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
            config_yaml: 'shipper: {}',
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
          })
          .expect(200);

        const {
          body: { items: outputs },
        } = await supertest.get(`/api/fleet/outputs`).expect(200);
        const newOutput = outputs.filter((o: any) => o.name === 'Logstash Output');
        expect(newOutput[0].shipper).to.eql({
          compression_level: null,
          disk_queue_compression_enabled: null,
          disk_queue_enabled: true,
          disk_queue_encryption_enabled: true,
          disk_queue_max_size: null,
          disk_queue_path: 'path/to/disk/queue',
          loadbalance: null,
          max_batch_bytes: null,
          mem_queue_events: null,
          queue_flush_timeout: null,
        });
      });

      it('should allow to create a kafka output with the shipper values', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Kafka Output',
            type: 'kafka',
            hosts: ['test.fr:2000'],
            auth_type: 'user_pass',
            username: 'user',
            password: 'pass',
            topic: 'topic1',
            config_yaml: 'shipper: {}',
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
          })
          .expect(200);

        const {
          body: { items: outputs },
        } = await supertest.get(`/api/fleet/outputs`).expect(200);
        const newOutput = outputs.filter((o: any) => o.name === 'Kafka Output');
        expect(newOutput[0].shipper).to.eql({
          compression_level: null,
          disk_queue_compression_enabled: null,
          disk_queue_enabled: true,
          disk_queue_encryption_enabled: true,
          disk_queue_max_size: null,
          disk_queue_path: 'path/to/disk/queue',
          loadbalance: null,
          max_batch_bytes: null,
          mem_queue_events: null,
          queue_flush_timeout: null,
        });
      });

      it('should not allow ssl.key and secrets.ssl.key to be set for logstash output ', async function () {
        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
            config_yaml: 'shipper: {}',
            secrets: { ssl: { key: 'KEY' } },
          })
          .expect(400);

        expect(res.body.message).to.equal('Cannot specify both ssl.key and secrets.ssl.key');
      });

      it('should not allow password and secrets.password to be set for kafka output ', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Kafka Output',
            type: 'kafka',
            hosts: ['test.fr:2000'],
            auth_type: 'user_pass',
            username: 'user',
            password: 'pass',
            topic: 'topic1',
            config_yaml: 'shipper: {}',
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
            secrets: { password: 'pass' },
          })
          .expect(400);
      });

      it('should not allow ssl.key and secrets.ssl.key to be set for kafka output ', async function () {
        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Kafka Output',
            type: 'kafka',
            hosts: ['test.fr:2000'],
            auth_type: 'ssl',
            topic: 'topic1',
            config_yaml: 'shipper: {}',
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
            secrets: {
              ssl: {
                key: 'KEY',
              },
            },
          })
          .expect(400);

        expect(res.body.message).to.equal('Cannot specify both ssl.key and secrets.ssl.key');
      });

      it('should not allow ssl.key and secrets.ssl.key to be set for elasticsearch output ', async function () {
        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'ES Output',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
            config_yaml: 'shipper: {}',
            secrets: { ssl: { key: 'KEY' } },
          })
          .expect(400);

        expect(res.body.message).to.equal('Cannot specify both ssl.key and secrets.ssl.key');
      });

      it('should not allow ssl.key and secrets.ssl.key to be set for remote_elasticsearch output ', async function () {
        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'ES Output',
            type: 'remote_elasticsearch',
            hosts: ['https://test.fr'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
            config_yaml: 'shipper: {}',
            secrets: { ssl: { key: 'KEY' } },
          })
          .expect(400);

        expect(res.body.message).to.equal('Cannot specify both ssl.key and secrets.ssl.key');
      });

      it('should create ssl.key secret correctly', async function () {
        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Kafka Output With Secret',
            type: 'kafka',
            hosts: ['test.fr:2000'],
            auth_type: 'ssl',
            topic: 'topic1',
            config_yaml: 'shipper: {}',
            shipper: {
              disk_queue_enabled: true,
              disk_queue_path: 'path/to/disk/queue',
              disk_queue_encryption_enabled: true,
            },
            ssl: {
              certificate: 'CERTIFICATE',
              certificate_authorities: ['CA1', 'CA2'],
            },
            secrets: {
              ssl: {
                key: 'KEY',
              },
            },
          })
          .expect(200);

        const secretId = res.body.item.secrets.ssl.key.id;
        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.equal('KEY');
      });

      it('should create ssl.password secret correctly', async function () {
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
          });

        const secretId = res.body.item.secrets.password.id;
        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.equal('pass');
      });

      it('should create service_token secret correctly', async function () {
        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Remote Elasticsearch With Service Token Secret',
            type: 'remote_elasticsearch',
            hosts: ['https://remote-es:9200'],
            secrets: { service_token: 'token' },
          });

        const secretId = res.body.item.secrets.service_token.id;
        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.equal('token');
      });

      it('should store secrets if fleet server meets minimum version', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '8.12.0');

        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              certificate_authorities: ['CA1', 'CA2'],
            },
            config_yaml: 'shipper: {}',
            secrets: { ssl: { key: 'KEY' } },
          })
          .expect(200);

        expect(Object.keys(res.body.item)).to.contain('ssl');
        expect(Object.keys(res.body.item.ssl)).not.to.contain('key');
        expect(Object.keys(res.body.item)).to.contain('secrets');
        expect(Object.keys(res.body.item.secrets)).to.contain('ssl');
        expect(Object.keys(res.body.item.secrets.ssl)).to.contain('key');
        const secretId = res.body.item.secrets.ssl.key.id;
        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.equal('KEY');
      });

      it('should not store secrets if fleet server does not meet minimum version', async function () {
        await disableOutputSecrets();
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '7.0.0');

        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              certificate_authorities: ['CA1', 'CA2'],
            },
            config_yaml: 'shipper: {}',
            secrets: { ssl: { key: 'KEY' } },
          })
          .expect(200);

        expect(Object.keys(res.body.item)).not.to.contain('secrets');
        expect(Object.keys(res.body.item)).to.contain('ssl');
        expect(Object.keys(res.body.item.ssl)).to.contain('key');
        expect(res.body.item.ssl.key).to.equal('KEY');
      });

      it('should store secrets if there is no fleet server', async function () {
        await disableOutputSecrets();
        await clearAgents();

        const res = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Logstash Output',
            type: 'logstash',
            hosts: ['test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              certificate_authorities: ['CA1', 'CA2'],
            },
            config_yaml: 'shipper: {}',
            secrets: { ssl: { key: 'KEY' } },
          })
          .expect(200);

        expect(Object.keys(res.body.item)).to.contain('secrets');
        expect(Object.keys(res.body.item)).to.contain('ssl');
        expect(Object.keys(res.body.item.ssl)).not.to.contain('key');
        expect(res.body.item.secrets.ssl.key.id).to.be.a('string');
      });

      it('should allow to create a new elasticsearch output with ssl values', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My ES Output',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'My ES Output',
          type: 'elasticsearch',
          hosts: ['https://test.fr:443'],
          is_default: false,
          is_default_monitoring: false,
          preset: 'balanced',
          ssl: {
            certificate: 'CERTIFICATE',
            key: 'KEY',
            certificate_authorities: ['CA1', 'CA2'],
          },
        });
      });

      it('should allow to create a new remote_elasticsearch output with ssl values', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My remote ES Output',
            type: 'remote_elasticsearch',
            hosts: ['https://test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              key: 'KEY',
              certificate_authorities: ['CA1', 'CA2'],
            },
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'My remote ES Output',
          type: 'remote_elasticsearch',
          hosts: ['https://test.fr:443'],
          is_default: false,
          is_default_monitoring: false,
          preset: 'balanced',
          ssl: {
            certificate: 'CERTIFICATE',
            key: 'KEY',
            certificate_authorities: ['CA1', 'CA2'],
          },
        });
      });
      it('should allow to create a new elasticsearch output with ssl values and secrets', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My ES Output',
            type: 'elasticsearch',
            hosts: ['https://test.fr'],
            ssl: {
              certificate: 'CERTIFICATE',
              certificate_authorities: ['CA1', 'CA2'],
            },
            secrets: {
              ssl: {
                key: 'KEY',
              },
            },
          })
          .expect(200);
      });

      it('should allow to create a new remote_elasticsearch output with ssl values and secrets', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My remote ES Output',
            type: 'remote_elasticsearch',
            hosts: ['https://test.fr:443'],
            ssl: {
              certificate: 'CERTIFICATE',
              certificate_authorities: ['CA1', 'CA2'],
            },
            secrets: {
              ssl: {
                key: 'KEY',
              },
            },
          })
          .expect(200);
      });

      it('should allow to create a new remote_elasticsearch output with kibana_api_key field', async function () {
        await supertest
          .post(`/api/fleet/outputs`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My remote ES Output',
            type: 'remote_elasticsearch',
            hosts: ['https://test.fr:443'],
            sync_integrations: true,
            kibana_url: 'https://testhost',
            kibana_api_key: 'aaaa',
          })
          .expect(200);
      });
    });

    describe('DELETE /outputs/{outputId}', () => {
      describe('Elasticsearch output', () => {
        let outputId: string;
        let defaultOutputIdToDelete: string;
        let defaultMonitoringOutputId: string;

        before(async () => {
          const { body: postResponse } = await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'Output to delete test',
              type: 'elasticsearch',
              hosts: ['https://test.fr'],
            })
            .expect(200);
          outputId = postResponse.item.id;

          const { body: defaultOutputPostResponse } = await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'Default Output to delete test',
              type: 'elasticsearch',
              hosts: ['https://test.fr'],
              is_default: true,
            })
            .expect(200);
          defaultOutputIdToDelete = defaultOutputPostResponse.item.id;
          const { body: defaultMonitoringOutputPostResponse } = await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'Default Output to delete test',
              type: 'elasticsearch',
              hosts: ['https://test.fr'],
              is_default_monitoring: true,
            })
            .expect(200);
          defaultMonitoringOutputId = defaultMonitoringOutputPostResponse.item.id;
        });

        it('should return a 400 when deleting a default output', async function () {
          await supertest
            .delete(`/api/fleet/outputs/${defaultOutputIdToDelete}`)
            .set('kbn-xsrf', 'xxxx')
            .expect(400);
        });

        it('should return a 400 when deleting a default monitoring output', async function () {
          await supertest
            .delete(`/api/fleet/outputs/${defaultMonitoringOutputId}`)
            .set('kbn-xsrf', 'xxxx')
            .expect(400);
        });

        it('should return a 404 when deleting a non existing output ', async function () {
          await supertest
            .delete(`/api/fleet/outputs/idonotexists`)
            .set('kbn-xsrf', 'xxxx')
            .expect(404);
        });

        it('should allow to delete an output ', async function () {
          const { body: deleteResponse } = await supertest
            .delete(`/api/fleet/outputs/${outputId}`)
            .set('kbn-xsrf', 'xxxx')
            .expect(200);

          expect(deleteResponse.id).to.eql(outputId);
        });

        it('should not modify agent policies when cannot delete an output due to default logstash', async function () {
          let { body: apiResponse } = await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'Elastic output',
              type: 'elasticsearch',
              hosts: ['http://localhost'],
            })
            .expect(200);
          const esOutputId = apiResponse.item.id;

          const agentPolicyId = '0000-agent-policy';
          ({ body: apiResponse } = await supertest
            .post(`/api/fleet/agent_policies`)
            .set('kbn-xsrf', 'kibana')
            .send({
              id: agentPolicyId,
              name: 'Agent policy 2',
              namespace: 'default',
              data_output_id: `${esOutputId}`,
              monitoring_output_id: `${esOutputId}`,
            })
            .expect(200));

          const fleetPolicyId = '1111-fleet-policy';
          ({ body: apiResponse } = await supertest
            .post(`/api/fleet/agent_policies`)
            .set('kbn-xsrf', 'kibana')
            .send({
              id: fleetPolicyId,
              name: 'Fleet Server policy 2',
              namespace: 'default',
              has_fleet_server: true,
              data_output_id: `${esOutputId}`,
            })
            .expect(200));

          await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'Default logstash',
              type: 'logstash',
              hosts: ['logstash'],
              ssl: { certificate: 'CERTIFICATE', key: 'KEY', certificate_authorities: [] },
              is_default: true,
              is_default_monitoring: true,
            })
            .expect(200);

          const { body: errorResponse } = await supertest
            .delete(`/api/fleet/outputs/${esOutputId}`)
            .set('kbn-xsrf', 'xxxx')
            .expect(400);
          expect(errorResponse.message).to.eql(
            'Output of type "logstash" is not usable with policy "Fleet Server policy 2".'
          );

          const { body: getAgentPolicyResponse } = await supertest.get(
            `/api/fleet/agent_policies/${agentPolicyId}`
          );
          expect(getAgentPolicyResponse.item.data_output_id).to.eql(esOutputId);
          expect(getAgentPolicyResponse.item.monitoring_output_id).to.eql(esOutputId);

          const { body: getFleetServerAgentPolicyResponse } = await supertest.get(
            `/api/fleet/agent_policies/${fleetPolicyId}`
          );
          expect(getFleetServerAgentPolicyResponse.item.data_output_id).to.eql(esOutputId);
        });
      });

      describe('Kafka output', () => {
        let outputId: string;
        let defaultOutputIdToDelete: string;

        const kafkaOutputPayload = {
          name: 'Output to delete test',
          type: 'kafka',
          hosts: ['test.fr:2000'],
          auth_type: 'user_pass',
          username: 'user',
          password: 'pass',
          is_default: true,
          topic: 'topic1',
        };

        before(async () => {
          const { body: postResponse } = await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send(kafkaOutputPayload)
            .expect(200);
          outputId = postResponse.item.id;

          const { body: defaultOutputPostResponse } = await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send({ ...kafkaOutputPayload, name: 'Default Output to delete test' })
            .expect(200);
          defaultOutputIdToDelete = defaultOutputPostResponse.item.id;
        });

        it('should return a 400 when deleting a default output ', async function () {
          await supertest
            .delete(`/api/fleet/outputs/${defaultOutputIdToDelete}`)
            .set('kbn-xsrf', 'xxxx')
            .expect(400);
        });

        it('should allow to delete an output ', async function () {
          const { body: deleteResponse } = await supertest
            .delete(`/api/fleet/outputs/${outputId}`)
            .set('kbn-xsrf', 'xxxx')
            .expect(200);

          expect(deleteResponse.id).to.eql(outputId);
        });

        it('should delete secrets when deleting an output', async function () {
          // Output secrets require at least one Fleet server on 8.12.0 or higher (and none under 8.12.0).
          await clearAgents();
          await createFleetServerAgent(fleetServerPolicyId, 'server_1', '8.12.0');
          const res = await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'Kafka Output With Secret',
              type: 'kafka',
              hosts: ['test.fr:2000'],
              auth_type: 'ssl',
              topic: 'topic1',
              config_yaml: 'shipper: {}',
              shipper: {
                disk_queue_enabled: true,
                disk_queue_path: 'path/to/disk/queue',
                disk_queue_encryption_enabled: true,
              },
              ssl: {
                certificate: 'CERTIFICATE',
                certificate_authorities: ['CA1', 'CA2'],
              },
              secrets: {
                ssl: {
                  key: 'KEY',
                },
              },
            })
            .expect(200);

          const outputWithSecretsId = res.body.item.id;
          const secretId = res.body.item.secrets.ssl.key.id;

          await supertest
            .delete(`/api/fleet/outputs/${outputWithSecretsId}`)
            .set('kbn-xsrf', 'xxxx')
            .expect(200);

          try {
            await getSecretById(secretId);
            expect().fail('Secret should have been deleted');
          } catch (e) {
            // not found
          }
        });

        it('should update kafka output to logstash output', async function () {
          // Output secrets require at least one Fleet server on 8.12.0 or higher (and none under 8.12.0).
          await clearAgents();
          await createFleetServerAgent(fleetServerPolicyId, 'server_1', '8.12.0');
          const res = await supertest
            .post(`/api/fleet/outputs`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'Kafka Output With Secret',
              type: 'kafka',
              hosts: ['test.fr:2000'],
              auth_type: 'ssl',
              topic: 'topic1',
              config_yaml: '',
              compression: 'none',
              client_id: 'Elastic',
              partition: 'random',
              version: '1.0.0',
              required_acks: 1,
              ssl: {
                certificate: 'CERTIFICATE',
                certificate_authorities: ['CA1', 'CA2'],
              },
              secrets: {
                ssl: {
                  key: 'KEY',
                },
              },
            })
            .expect(200);

          const outputWithSecretsId = res.body.item.id;

          const updateRes = await supertest
            .put(`/api/fleet/outputs/${outputWithSecretsId}`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: 'kafka_to_logstash',
              type: 'logstash',
              hosts: ['logstash'],
              is_default: false,
              is_default_monitoring: false,
              config_yaml: '',
              ssl: { certificate: 'cert', certificate_authorities: ['ca'] },
              secrets: { ssl: { key: 'key' } },
              proxy_id: null,
            })
            .expect(200);

          expect(updateRes.body.item.type).to.eql('logstash');
          expect(updateRes.body.item.topic).to.eql(null);

          await supertest
            .delete(`/api/fleet/outputs/${outputWithSecretsId}`)
            .set('kbn-xsrf', 'xxxx')
            .expect(200);
        });
      });
    });
  });
}
