/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  DEFAULT_DOWNLOAD_SOURCE_REFERENCE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
} from '@kbn/fleet-plugin/common';
import type { FtrProviderContext } from '../../../api_integration/ftr_provider_context';
import { skipIfNoDockerRegistry } from '../../helpers';
import { testUsers } from '../test_users';

export default function (providerContext: FtrProviderContext) {
  const { getService } = providerContext;
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');

  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const fleetAndAgents = getService('fleetAndAgents');
  const es = getService('es');

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

  const createFleetServerPolicy = async (id: string) => {
    await kibanaServer.savedObjects.create({
      id: `package-policy-test`,
      type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
      overwrite: true,
      attributes: {
        policy_ids: [id],
        name: 'Fleet Server',
        enabled: true,
        inputs: [],
        revision: 1,
        created_at: new Date().toISOString(),
        created_by: 'system',
        updated_at: new Date().toISOString(),
        updated_by: 'system',
        package: {
          name: 'fleet_server',
          version: '1.0.0',
        },
        latest_revision: true,
      },
    });
  };
  const createFleetServerAgent = async (
    agentPolicyId: string,
    hostname: string,
    agentVersion: string
  ) => {
    const agentResponse = await es.index({
      index: '.fleet-agents',
      refresh: true,
      body: {
        access_api_key_id: 'api-key-3',
        active: true,
        policy_id: agentPolicyId,
        type: 'PERMANENT',
        local_metadata: {
          host: { hostname },
          elastic: { agent: { version: agentVersion } },
        },
        user_provided_metadata: {},
        enrolled_at: new Date().toISOString(),
        last_checkin: new Date().toISOString(),
        tags: ['tag1'],
      },
    });

    return agentResponse._id;
  };

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

  const authHeaderConflictCases: Array<[string, { auth?: {}; secrets?: {} }]> = [
    ['username/password', { auth: { username: 'testuser', password: 'testpassword' } }],
    [
      'username/password as secret',
      { auth: { username: 'testuser' }, secrets: { auth: { password: 'testpassword' } } },
    ],
    ['api_key', { auth: { api_key: 'my-api-key' } }],
    ['api_key as secret', { secrets: { auth: { api_key: 'my-api-key' } } }],
  ];

  describe('fleet_download_sources_crud', function () {
    let defaultDownloadSourceId: string;
    let fleetServerPolicyId: string;
    skipIfNoDockerRegistry(providerContext);
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.load('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');
      await fleetAndAgents.setup();

      const { body: apiResponse } = await supertest
        .post(`/api/fleet/agent_policies`)
        .set('kbn-xsrf', 'kibana')
        .send({
          name: 'Default Fleet Server policy',
          namespace: 'default',
          has_fleet_server: true,
          is_default: true,
        })
        .expect(200);
      const fleetServerPolicy = apiResponse.item;
      fleetServerPolicyId = fleetServerPolicy.id;
      await createFleetServerPolicy(fleetServerPolicyId);

      const { body: response } = await supertest
        .get(`/api/fleet/agent_download_sources`)
        .expect(200);

      const defaultDownloadSource = response.items.find((item: any) => item.is_default);
      if (!defaultDownloadSource) {
        throw new Error('default download source not set');
      }
      defaultDownloadSourceId = defaultDownloadSource.id;
      await deleteAllSecrets();
    });

    after(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');
    });

    describe('GET /agent_download_sources', () => {
      it('should list the default download source host', async () => {
        const { body: downloadSource } = await supertest
          .get(`/api/fleet/agent_download_sources`)
          .expect(200);

        expect(downloadSource.items[0]).to.eql({
          id: 'fleet-default-download-source',
          name: 'Elastic Artifacts',
          is_default: true,
          host: 'https://artifacts.elastic.co/downloads/',
        });
      });

      it('should return a 200 if a user with the fleet all try to access the list', async () => {
        await supertestWithoutAuth
          .get(`/api/fleet/agent_download_sources`)
          .auth(testUsers.fleet_all_only.username, testUsers.fleet_all_only.password)
          .expect(200);
      });

      it('should return a 200 if a user with the fleet read try to access the list', async () => {
        await supertestWithoutAuth
          .get(`/api/fleet/agent_download_sources`)
          .auth(testUsers.fleet_read_only.username, testUsers.fleet_read_only.password)
          .expect(200);
      });

      it('should return a 200 if a user with the fleet settings read try to access the list', async () => {
        await supertestWithoutAuth
          .get(`/api/fleet/agent_download_sources`)
          .auth(
            testUsers.fleet_settings_read_only.username,
            testUsers.fleet_settings_read_only.password
          )
          .expect(200);
      });

      it('should return a 403 if a user without the fleet settings read try to access the list', async () => {
        await supertestWithoutAuth
          .get(`/api/fleet/agent_download_sources`)
          .auth(
            testUsers.fleet_minimal_all_only.username,
            testUsers.fleet_minimal_all_only.password
          )
          .expect(403);
      });
    });

    describe('GET /agent_download_sources/{sourceId}', () => {
      it('should return the requested download source host', async () => {
        const { body: downloadSource } = await supertest
          .get(`/api/fleet/agent_download_sources/${defaultDownloadSourceId}`)
          .expect(200);

        expect(downloadSource).to.eql({
          item: {
            id: 'fleet-default-download-source',
            name: 'Elastic Artifacts',
            is_default: true,
            host: 'https://artifacts.elastic.co/downloads/',
          },
        });
      });
    });

    describe('POST /agent_download_sources', () => {
      it('should not store SSL secrets if fleet server does not meet minimum version', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '7.0.0');

        const { body: res } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `My download source ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            secrets: {
              ssl: {
                key: 'KEY1',
              },
            },
          })
          .expect(200);
        expect(Object.keys(res.item)).not.to.contain('secrets');
        expect(Object.keys(res.item)).to.contain('ssl');
        expect(Object.keys(res.item.ssl)).to.contain('key');
        expect(res.item.ssl.key).to.equal('KEY1');
      });

      it('should allow to create a new download source host', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My download source',
            host: 'http://test.fr:443',
            is_default: false,
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'My download source',
          host: 'http://test.fr:443',
          is_default: false,
        });
      });

      it('should toggle default download source when creating a new default one', async function () {
        await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'default download source host 1',
            host: 'https://test.co',
            is_default: true,
          })
          .expect(200);

        const {
          body: { item: downloadSource2 },
        } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'default download source host 2',
            host: 'https://test2.co',
            is_default: true,
          })
          .expect(200);

        const {
          body: { items: downloadSources },
        } = await supertest.get(`/api/fleet/agent_download_sources`).expect(200);

        const defaultDownloadSource = downloadSources.filter((item: any) => item.is_default);
        expect(defaultDownloadSource).to.have.length(1);
        expect(defaultDownloadSource[0].id).eql(downloadSource2.id);
      });

      it('should return a 400 when passing a host that is not a valid uri', async function () {
        await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'new host1',
            host: 'not a valid uri',
            is_default: true,
          })
          .expect(400);
      });

      it('should allow to create a new download source host with ssl fields', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My download source with ssl',
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate: 'cert',
              certificate_authorities: ['ca'],
              key: 'KEY1',
            },
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'My download source with ssl',
          host: 'http://test.fr:443',
          is_default: false,
          ssl: {
            certificate: 'cert',
            certificate_authorities: ['ca'],
            key: 'KEY1',
          },
        });
      });

      it('should not allow ssl.key and secrets.ssl.key to be set at the same time', async function () {
        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `My download source  ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: '/path/to/cert',
              key: 'KEY',
            },
            secrets: { ssl: { key: 'KEY' } },
          })
          .expect(400);

        expect(res.body.message).to.equal('Cannot specify both ssl.key and secrets.ssl.key');
      });

      it('should store SSL secrets if fleet server meets minimum version', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.3.0');
        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `My download source ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: 'path/to/cert',
            },
            secrets: { ssl: { key: 'KEY1' } },
          })
          .expect(200);

        expect(Object.keys(res.body.item)).to.contain('secrets');
        const secretId1 = res.body.item.secrets.ssl.key.id;
        const secret1 = await getSecretById(secretId1);
        // @ts-ignore _source unknown type
        expect(secret1._source.value).to.equal('KEY1');
      });

      it('should allow creating a download source with username/password auth', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with auth ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              password: 'testpassword',
            },
          })
          .expect(200);

        expect(postResponse.item.auth.username).to.eql('testuser');
        expect(postResponse.item.auth.password).to.eql('testpassword');
      });

      it('should allow creating a download source with api_key auth', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with api key ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              api_key: 'my-api-key',
            },
          })
          .expect(200);

        expect(postResponse.item.auth.api_key).to.eql('my-api-key');
      });

      it('should not allow both username/password and api_key', async function () {
        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with conflicting auth ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              password: 'testpassword',
              api_key: 'my-api-key',
            },
          })
          .expect(400);

        expect(res.body.message).to.contain(
          'Cannot specify both username/password and api_key authentication'
        );
      });

      it('should require password when username is provided', async function () {
        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with username only ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
            },
          })
          .expect(400);

        expect(res.body.message).to.contain('Username and password must be provided together');
      });

      it('should require username when password is provided', async function () {
        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with password only ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              password: 'testpassword',
            },
          })
          .expect(400);

        expect(res.body.message).to.contain('Username and password must be provided together');
      });

      it('should not allow auth.password and secrets.auth.password at the same time', async function () {
        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with duplicate password ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              password: 'plainpassword',
            },
            secrets: {
              auth: {
                password: 'secretpassword',
              },
            },
          })
          .expect(400);

        expect(res.body.message).to.contain(
          'Cannot specify both auth.password and secrets.auth.password'
        );
      });

      it('should not allow auth.api_key and secrets.auth.api_key at the same time', async function () {
        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with duplicate api_key ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              api_key: 'plain-api-key',
            },
            secrets: {
              auth: {
                api_key: 'secret-api-key',
              },
            },
          })
          .expect(400);

        expect(res.body.message).to.contain(
          'Cannot specify both auth.api_key and secrets.auth.api_key'
        );
      });

      authHeaderConflictCases.forEach(([description, { auth, secrets }]) => {
        it(`should return 400 when Authorization header is combined with ${description} credentials on create`, async function () {
          const baseAuth = {
            headers: [{ key: 'Authorization', value: 'Bearer token' }],
          };

          const res = await supertest
            .post(`/api/fleet/agent_download_sources`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: `Download source auth conflict ${Date.now()}`,
              host: 'http://test.fr:443',
              is_default: false,
              auth: { ...baseAuth, ...auth },
              ...(secrets ? { secrets } : {}),
            })
            .expect(400);

          expect(res.body.message).to.contain('Cannot use "Authorization" custom header');
        });
      });

      it('should store auth secrets when fleet server meets minimum version', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.4.0');
        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with auth secret ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
            },
            secrets: {
              auth: {
                password: 'secretpassword',
              },
            },
          })
          .expect(200);

        expect(res.body.item.auth.username).to.eql('testuser');
        expect(res.body.item.secrets.auth.password).to.have.property('id');
        const secretId = res.body.item.secrets.auth.password.id;
        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.eql('secretpassword');
      });

      it('should allow creating a download source with auth headers', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with headers ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              password: 'testpassword',
              headers: [
                { key: 'X-Custom-Header', value: 'custom-value' },
                { key: 'X-Another-Header', value: 'another-value' },
              ],
            },
          })
          .expect(200);

        expect(postResponse.item.auth.username).to.eql('testuser');
        expect(postResponse.item.auth.headers).to.eql([
          { key: 'X-Custom-Header', value: 'custom-value' },
          { key: 'X-Another-Header', value: 'another-value' },
        ]);
      });

      it('should allow creating a download source with api_key and headers', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with api_key and headers ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              api_key: 'my-api-key',
              headers: [{ key: 'X-Custom-Header', value: 'custom-value' }],
            },
          })
          .expect(200);

        const apiKey =
          postResponse.item.auth?.api_key ?? postResponse.item.secrets?.auth?.api_key?.id;
        expect(apiKey).to.be.ok();
        expect(postResponse.item.auth.headers).to.eql([
          { key: 'X-Custom-Header', value: 'custom-value' },
        ]);
      });

      it('should allow creating a download source with auth headers only', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Download source with headers only ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              headers: [
                { key: 'X-Custom-Header', value: 'custom-value' },
                { key: 'X-Another-Header', value: 'another-value' },
              ],
            },
          })
          .expect(200);

        expect(postResponse.item.auth.headers).to.eql([
          { key: 'X-Custom-Header', value: 'custom-value' },
          { key: 'X-Another-Header', value: 'another-value' },
        ]);

        expect(postResponse.item.auth.username).to.be(undefined);
        expect(postResponse.item.auth.password).to.be(undefined);
        expect(postResponse.item.auth.api_key).to.be(undefined);
      });
    });

    describe('PUT /agent_download_sources/{sourceId}', () => {
      it('should allow to update an existing download source', async function () {
        await supertest
          .put(`/api/fleet/agent_download_sources/${defaultDownloadSourceId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'new host1',
            host: 'https://test.co:403',
            is_default: false,
          })
          .expect(200);

        const {
          body: { item: downloadSource },
        } = await supertest
          .get(`/api/fleet/agent_download_sources/${defaultDownloadSourceId}`)
          .expect(200);

        expect(downloadSource.host).to.eql('https://test.co:403');
      });

      it('should allow to update is_default for existing download source', async function () {
        await supertest
          .put(`/api/fleet/agent_download_sources/${defaultDownloadSourceId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'new default host',
            host: 'https://test.co',
            is_default: true,
          })
          .expect(200);

        await supertest.get(`/api/fleet/agent_download_sources`).expect(200);
      });

      it('should store secrets if fleet server meets minimum version', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.3.0');
        const res = await supertest
          .put(`/api/fleet/agent_download_sources/${defaultDownloadSourceId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'new default host',
            host: 'https://test.co',
            is_default: true,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: 'path/to/cert',
            },
            secrets: { ssl: { key: 'KEY1' } },
          })
          .expect(200);

        expect(Object.keys(res.body.item)).to.contain('secrets');
        const secretId1 = res.body.item.secrets.ssl.key.id;
        const secret1 = await getSecretById(secretId1);
        // @ts-ignore _source unknown type
        expect(secret1._source.value).to.equal('KEY1');
      });

      it('should allow secrets to be updated + delete unused secret', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '8.12.0');

        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My download source with secrets',
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: 'path/to/cert',
            },
            secrets: { ssl: { key: 'KEY1' } },
          })
          .expect(200);
        const dsId = res.body.item.id;
        const secretId = res.body.item.secrets.ssl.key.id;
        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.equal('KEY1');

        const updatedRes = await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My download source with secrets',
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: 'path/to/cert',
            },
            secrets: { ssl: { key: 'NEW_KEY' } },
          })
          .expect(200);
        const updatedSecretId = updatedRes.body.item.secrets.ssl.key.id;

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

      it('should allow to resave ssl.key as secret if already existing', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '8.12.0');

        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `My download source ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: 'path/to/cert',
              key: 'KEY1',
            },
          })
          .expect(200);
        const dsId = res.body.item.id;

        const updatedRes = await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `My download source ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: 'path/to/cert',
            },
            secrets: { ssl: { key: 'NEW_KEY' } },
          })
          .expect(200);
        const updatedSecretId = updatedRes.body.item.secrets.ssl.key.id;

        const updatedSecret = await getSecretById(updatedSecretId);

        // @ts-ignore _source unknown type
        expect(updatedSecret._source.value).to.equal('NEW_KEY');
      });

      it('should return a 404 when updating a non existing download source', async function () {
        await supertest
          .put(`/api/fleet/agent_download_sources/idonotexists`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'new host1',
            host: 'https://test.co',
            is_default: true,
          })
          .expect(404);
      });

      it('should return a 400 when passing a host that is not a valid uri', async function () {
        await supertest
          .put(`/api/fleet/agent_download_sources/${defaultDownloadSourceId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'new host1',
            host: 'not a valid uri',
            is_default: true,
          })
          .expect(400);
      });

      authHeaderConflictCases.forEach(([description, { auth, secrets }]) => {
        it(`should return 400 when Authorization header is combined with ${description} credentials on update`, async function () {
          const { body: createRes } = await supertest
            .post(`/api/fleet/agent_download_sources`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: `Bad auth combination test ${Date.now()}`,
              host: 'http://test.fr:443',
              is_default: false,
            })
            .expect(200);

          const baseAuth = {
            headers: [{ key: 'Authorization', value: 'Bearer token' }],
          };

          const res = await supertest
            .put(`/api/fleet/agent_download_sources/${createRes.item.id}`)
            .set('kbn-xsrf', 'xxxx')
            .send({
              name: `Download source auth conflict ${Date.now()}`,
              host: 'http://test.fr:443',
              is_default: false,
              auth: { ...baseAuth, ...auth },
              ...(secrets ? { secrets } : {}),
            })
            .expect(400);

          expect(res.body.message).to.contain('Cannot use "Authorization" custom header');
        });
      });

      it('should delete password secret when switching from username/password to api_key', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.4.0');

        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Switch auth test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
            },
            secrets: {
              auth: {
                password: 'secretpassword',
              },
            },
          })
          .expect(200);

        const dsId = createRes.item.id;
        const passwordSecretId = createRes.item.secrets.auth.password.id;

        await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Switch auth test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            secrets: {
              auth: {
                api_key: 'new-api-key',
              },
            },
          })
          .expect(200);

        try {
          await getSecretById(passwordSecretId);
          expect().fail('Password secret should have been deleted');
        } catch (e) {
          // not found - expected
        }

        const { body: getRes } = await supertest
          .get(`/api/fleet/agent_download_sources/${dsId}`)
          .expect(200);

        expect(getRes.item.auth).to.be(undefined);
        expect(getRes.item.secrets.auth.api_key).to.have.property('id');
      });

      it('should delete api_key secret when switching from api_key to username/password', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.4.0');

        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Switch auth test 2 ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            secrets: {
              auth: {
                api_key: 'secret-api-key',
              },
            },
          })
          .expect(200);

        const dsId = createRes.item.id;
        const apiKeySecretId = createRes.item.secrets.auth.api_key.id;

        await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Switch auth test 2 ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'newuser',
            },
            secrets: {
              auth: {
                password: 'newpassword',
              },
            },
          })
          .expect(200);

        try {
          await getSecretById(apiKeySecretId);
          expect().fail('API key secret should have been deleted');
        } catch (e) {
          // not found - expected
        }

        const { body: getRes } = await supertest
          .get(`/api/fleet/agent_download_sources/${dsId}`)
          .expect(200);

        expect(getRes.item.auth.username).to.eql('newuser');
        expect(getRes.item.secrets.auth.password).to.have.property('id');
      });

      it('should convert plain text auth to secret when secret storage is enabled', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.4.0');

        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Plain text to secret test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              password: 'plaintextpassword',
            },
          })
          .expect(200);

        expect(createRes.item.auth.username).to.eql('testuser');
        expect(createRes.item.auth.password).to.be(undefined);
        expect(createRes.item.secrets.auth.password).to.have.property('id');

        const secretId = createRes.item.secrets.auth.password.id;
        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.eql('plaintextpassword');
      });

      it('should allow updating headers on existing download source', async function () {
        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Update headers test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              password: 'testpassword',
              headers: [{ key: 'X-Original-Header', value: 'original-value' }],
            },
          })
          .expect(200);

        const dsId = createRes.item.id;
        expect(createRes.item.auth.headers).to.eql([
          { key: 'X-Original-Header', value: 'original-value' },
        ]);

        const { body: updateRes } = await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Update headers test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              password: 'testpassword',
              headers: [
                { key: 'X-Updated-Header', value: 'updated-value' },
                { key: 'X-New-Header', value: 'new-value' },
              ],
            },
          })
          .expect(200);

        expect(updateRes.item.auth.headers).to.eql([
          { key: 'X-Updated-Header', value: 'updated-value' },
          { key: 'X-New-Header', value: 'new-value' },
        ]);
      });

      it('should replace auth entirely when updating with headers only', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.4.0');

        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Replace auth test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              headers: [{ key: 'X-Original-Header', value: 'original-value' }],
            },
            secrets: { auth: { password: 'SECRET_PASSWORD' } },
          })
          .expect(200);

        const dsId = createRes.item.id;

        const { body: updateRes } = await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Replace auth test updated ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              headers: [
                { key: 'X-Updated-Header', value: 'updated-value' },
                { key: 'X-New-Header', value: 'new-value' },
              ],
            },
          })
          .expect(200);

        expect(updateRes.item.auth.headers).to.eql([
          { key: 'X-Updated-Header', value: 'updated-value' },
          { key: 'X-New-Header', value: 'new-value' },
        ]);
        expect(updateRes.item.auth.username).to.be(undefined);
        expect(updateRes.item.secrets?.auth?.password).to.be(undefined);
      });

      it('should replace api_key auth with headers only (complete replacement)', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.4.0');

        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Replace api_key test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              headers: [{ key: 'X-Original-Header', value: 'original-value' }],
            },
            secrets: { auth: { api_key: 'SECRET_API_KEY' } },
          })
          .expect(200);

        const dsId = createRes.item.id;

        const { body: updateRes } = await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Replace api_key test updated ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              headers: [{ key: 'X-Updated-Header', value: 'updated-value' }],
            },
          })
          .expect(200);

        expect(updateRes.item.auth.headers).to.eql([
          { key: 'X-Updated-Header', value: 'updated-value' },
        ]);
        expect(updateRes.item.secrets?.auth?.api_key).to.be(undefined);
      });

      it('should preserve SSL secrets when updating only name/host', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '8.12.0');

        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Preserve SSL secrets test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: 'path/to/cert',
            },
            secrets: { ssl: { key: 'SSL_KEY_VALUE' } },
          })
          .expect(200);

        const dsId = createRes.item.id;
        const secretId = createRes.item.secrets.ssl.key.id;

        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.equal('SSL_KEY_VALUE');

        const { body: updateRes } = await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Preserve SSL secrets test updated ${Date.now()}`,
            host: 'http://updated.test.fr:443',
            is_default: false,
          })
          .expect(200);

        expect(updateRes.item.secrets.ssl.key.id).to.equal(secretId);
        expect(updateRes.item.ssl.certificate).to.equal('path/to/cert');
        expect(updateRes.item.ssl.certificate_authorities).to.eql(['/path/to/cert-authority']);

        const secretAfterUpdate = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secretAfterUpdate._source.value).to.equal('SSL_KEY_VALUE');
      });

      it('should preserve auth secrets when updating only name/host', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.4.0');

        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Preserve auth secrets test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              headers: [{ key: 'X-Custom-Header', value: 'custom-value' }],
            },
            secrets: { auth: { password: 'SECRET_PASSWORD' } },
          })
          .expect(200);

        const dsId = createRes.item.id;
        const secretId = createRes.item.secrets.auth.password.id;

        const secret = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secret._source.value).to.equal('SECRET_PASSWORD');

        const { body: updateRes } = await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Preserve auth secrets test updated ${Date.now()}`,
            host: 'http://updated.test.fr:443',
            is_default: false,
          })
          .expect(200);

        expect(updateRes.item.secrets.auth.password.id).to.equal(secretId);
        expect(updateRes.item.auth.username).to.equal('testuser');
        expect(updateRes.item.auth.headers).to.eql([
          { key: 'X-Custom-Header', value: 'custom-value' },
        ]);

        const secretAfterUpdate = await getSecretById(secretId);
        // @ts-ignore _source unknown type
        expect(secretAfterUpdate._source.value).to.equal('SECRET_PASSWORD');
      });

      it('should preserve both SSL and auth secrets when updating only name/host', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '9.4.0');

        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Preserve all secrets test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: 'path/to/cert',
            },
            secrets: {
              ssl: { key: 'SSL_KEY_VALUE' },
              auth: { password: 'SECRET_PASSWORD' },
            },
            auth: {
              username: 'testuser',
              headers: [{ key: 'X-Custom-Header', value: 'custom-value' }],
            },
          })
          .expect(200);

        const dsId = createRes.item.id;
        const sslSecretId = createRes.item.secrets.ssl.key.id;
        const authSecretId = createRes.item.secrets.auth.password.id;

        const { body: updateRes } = await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Preserve all secrets test updated ${Date.now()}`,
            host: 'http://updated.test.fr:443',
            is_default: false,
          })
          .expect(200);

        expect(updateRes.item.secrets.ssl.key.id).to.equal(sslSecretId);
        expect(updateRes.item.secrets.auth.password.id).to.equal(authSecretId);
        expect(updateRes.item.ssl.certificate).to.equal('path/to/cert');
        expect(updateRes.item.auth.username).to.equal('testuser');

        const sslSecretAfterUpdate = await getSecretById(sslSecretId);
        // @ts-ignore _source unknown type
        expect(sslSecretAfterUpdate._source.value).to.equal('SSL_KEY_VALUE');

        const authSecretAfterUpdate = await getSecretById(authSecretId);
        // @ts-ignore _source unknown type
        expect(authSecretAfterUpdate._source.value).to.equal('SECRET_PASSWORD');
      });

      it('should clear auth and headers when setting auth to null', async function () {
        const { body: createRes } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Clear auth test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: {
              username: 'testuser',
              password: 'testpassword',
              headers: [{ key: 'X-Custom-Header', value: 'custom-value' }],
            },
          })
          .expect(200);

        const dsId = createRes.item.id;
        expect(createRes.item.auth.username).to.eql('testuser');
        expect(createRes.item.auth.headers).to.have.length(1);

        await supertest
          .put(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Clear auth test ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            auth: null,
          })
          .expect(200);

        const { body: getRes } = await supertest
          .get(`/api/fleet/agent_download_sources/${dsId}`)
          .expect(200);

        expect(getRes.item.auth).to.be(undefined);
      });
    });

    describe('proxy_id behaviour', () => {
      const PROXY_ID = 'download-source-proxy-id';
      before(async () => {
        await supertest
          .post(`/api/fleet/fleet_server_hosts`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `Default ${Date.now()}`,
            host_urls: ['https://test.fr:8080'],
            is_default: true,
          })
          .expect(200);

        await supertest
          .post(`/api/fleet/proxies`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            id: PROXY_ID,
            name: 'Download source proxy test',
            url: 'https://some.source.proxy:3232',
          })
          .expect(200);
      });

      it('should allow creating a new download source host with a proxy_id ', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'download source with valid proxy id',
            host: 'http://test.fr:443',
            proxy_id: PROXY_ID,
            is_default: false,
          })
          .expect(200);

        const { id: _, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'download source with valid proxy id',
          host: 'http://test.fr:443',
          proxy_id: PROXY_ID,
          is_default: false,
        });
      });

      it('should set agent.download.proxy_url on the full agent policy', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'download source with valid proxy id for agent test',
            host: 'http://test.fr:443',
            proxy_id: PROXY_ID,
            is_default: false,
          })
          .expect(200);

        const { id: downloadSourceId } = postResponse.item;

        const { body: postAgentPolicyResponse } = await supertest
          .post(`/api/fleet/agent_policies`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'agent policy with download source',
            namespace: 'default',
            description: '',
            is_default: false,
            download_source_id: downloadSourceId,
          })
          .expect(200);
        const { id: agentPolicyId } = postAgentPolicyResponse.item;
        await supertest
          .post(`/api/fleet/package_policies`)
          .set('kbn-xsrf', 'xxx')
          .send({
            force: true,
            package: {
              name: 'fleet_server',
              version: '1.3.1',
            },
            name: `Fleet Server 1`,
            namespace: 'default',
            policy_ids: [agentPolicyId],
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

        const { body: getAgentPolicyResponse } = await supertest
          .get(`/api/fleet/agent_policies/${agentPolicyId}/full`)
          .set('kbn-xsrf', 'xxxx')
          .send()
          .expect(200);

        expect(getAgentPolicyResponse.item.agent.download.proxy_url).to.eql(
          'https://some.source.proxy:3232'
        );
      });

      it('should not allow creating a new download source host with an invalid proxy_id ', async function () {
        await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'My download source with invalid proxy',
            host: 'http://test.fr:443',
            proxy_id: 'this-proxy-id-does-not-exist',
            is_default: false,
          })
          .expect(400);
      });

      it('should allow proxy_id to be set to null', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Download source with null proxy id',
            host: 'http://test.fr:443',
            proxy_id: PROXY_ID,
            is_default: false,
          })
          .expect(200);

        const { id, ...itemWithoutId } = postResponse.item;
        expect(itemWithoutId).to.eql({
          name: 'Download source with null proxy id',
          host: 'http://test.fr:443',
          proxy_id: PROXY_ID,
          is_default: false,
        });

        await supertest
          .put(`/api/fleet/agent_download_sources/${id}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            ...itemWithoutId,
            proxy_id: null,
          })
          .expect(200);

        const { body: getResponse } = await supertest
          .get(`/api/fleet/agent_download_sources/${id}`)
          .set('kbn-xsrf', 'xxxx')
          .send()
          .expect(200);

        expect(getResponse.item.proxy_id).to.eql(null);
      });

      it('setting proxy_id to null should remove the proxy from the agent policy', async function () {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'download source which proxy_id will be set to null',
            host: 'http://test.fr:443',
            proxy_id: PROXY_ID,
            is_default: false,
          })
          .expect(200);

        const { id: downloadSourceId, ...itemWithoutId } = postResponse.item;

        const { body: postAgentPolicyResponse } = await supertest
          .post(`/api/fleet/agent_policies`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'agent policy with download source proxy_id which will be set to null',
            namespace: 'default',
            description: '',
            is_default: false,
            download_source_id: downloadSourceId,
          })
          .expect(200);

        const { id: agentPolicyId } = postAgentPolicyResponse.item;

        const { body: getAgentPolicyResponse } = await supertest
          .get(`/api/fleet/agent_policies/${agentPolicyId}/full`)
          .set('kbn-xsrf', 'xxxx')
          .send();

        expect(getAgentPolicyResponse.item.agent.download.proxy_url).to.eql(
          'https://some.source.proxy:3232'
        );

        await supertest
          .put(`/api/fleet/agent_download_sources/${downloadSourceId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            ...itemWithoutId,
            proxy_id: null,
          })
          .expect(200);

        const { body: getAgentPolicyNullResponse } = await supertest
          .get(`/api/fleet/agent_policies/${agentPolicyId}/full`)
          .set('kbn-xsrf', 'xxxx')
          .send()
          .expect(200);

        expect(getAgentPolicyNullResponse.item.agent.download.proxy_url).to.eql(undefined);
      });
    });

    describe('download_source_ids behaviour', () => {
      // One case promotes a new default, so hand the flag back to the original source
      after(async () => {
        const { body: currentDefault } = await supertest
          .get(`/api/fleet/agent_download_sources/${defaultDownloadSourceId}`)
          .expect(200);

        await supertest
          .put(`/api/fleet/agent_download_sources/${defaultDownloadSourceId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: currentDefault.item.name,
            host: currentDefault.item.host,
            is_default: true,
          })
          .expect(200);
      });

      const createDownloadSource = async (name: string, host: string) => {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({ name, host, is_default: false })
          .expect(200);

        return postResponse.item.id as string;
      };

      const createAgentPolicy = async (name: string, attributes: object) => {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_policies`)
          .set('kbn-xsrf', 'xxxx')
          .send({ name, namespace: 'default', description: '', is_default: false, ...attributes })
          .expect(200);

        return postResponse.item.id as string;
      };

      it('should set agent.download.sources and keep sourceURI on the full agent policy', async function () {
        const primaryId = await createDownloadSource(
          `Primary source ${Date.now()}`,
          'http://primary.co:443'
        );
        const secondaryId = await createDownloadSource(
          `Secondary source ${Date.now()}`,
          'http://secondary.co:443'
        );

        const agentPolicyId = await createAgentPolicy('agent policy with multiple sources', {
          download_source_ids: [primaryId, secondaryId],
        });

        const { body: getAgentPolicyResponse } = await supertest
          .get(`/api/fleet/agent_policies/${agentPolicyId}/full`)
          .set('kbn-xsrf', 'xxxx')
          .send()
          .expect(200);

        const { download } = getAgentPolicyResponse.item.agent;
        expect(download.sources).to.eql(['http://primary.co:443', 'http://secondary.co:443']);
        // sourceURI is retained for agents that do not yet understand `sources`
        expect(download.sourceURI).to.eql('http://primary.co:443');
      });

      it('should fall back to download_source_id when download_source_ids is not set', async function () {
        const sourceId = await createDownloadSource(
          `Single source ${Date.now()}`,
          'http://single.co:443'
        );

        const agentPolicyId = await createAgentPolicy('agent policy with a single source', {
          download_source_id: sourceId,
        });

        const { body: getAgentPolicyResponse } = await supertest
          .get(`/api/fleet/agent_policies/${agentPolicyId}/full`)
          .set('kbn-xsrf', 'xxxx')
          .send()
          .expect(200);

        const { download } = getAgentPolicyResponse.item.agent;
        expect(download.sources).to.eql(['http://single.co:443']);
        expect(download.sourceURI).to.eql('http://single.co:443');
      });

      it('should keep a slot for the default source and follow it when the default changes', async function () {
        const pinnedId = await createDownloadSource(
          `Pinned source ${Date.now()}`,
          'http://pinned.co:443'
        );

        const agentPolicyId = await createAgentPolicy('agent policy with a default slot', {
          download_source_ids: [DEFAULT_DOWNLOAD_SOURCE_REFERENCE, pinnedId],
        });

        const { body: beforeResponse } = await supertest
          .get(`/api/fleet/agent_policies/${agentPolicyId}/full`)
          .set('kbn-xsrf', 'xxxx')
          .send()
          .expect(200);

        // The default slot resolves to the download source currently marked as default
        const { body: defaultSourceResponse } = await supertest
          .get(`/api/fleet/agent_download_sources/${defaultDownloadSourceId}`)
          .expect(200);
        expect(beforeResponse.item.agent.download.sources).to.eql([
          defaultSourceResponse.item.host,
          'http://pinned.co:443',
        ]);

        // Promoting another source to default must update the reference in place
        const newDefaultId = await createDownloadSource(
          `New default source ${Date.now()}`,
          'http://new-default.co:443'
        );
        await supertest
          .put(`/api/fleet/agent_download_sources/${newDefaultId}`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `New default source updated ${Date.now()}`,
            host: 'http://new-default.co:443',
            is_default: true,
          })
          .expect(200);

        const { body: afterResponse } = await supertest
          .get(`/api/fleet/agent_policies/${agentPolicyId}/full`)
          .set('kbn-xsrf', 'xxxx')
          .send()
          .expect(200);

        expect(afterResponse.item.agent.download.sources).to.eql([
          'http://new-default.co:443',
          'http://pinned.co:443',
        ]);
      });

      it('should return a 400 when passing more than three download source ids', async function () {
        await supertest
          .post(`/api/fleet/agent_policies`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'agent policy with too many sources',
            namespace: 'default',
            description: '',
            is_default: false,
            download_source_ids: ['ds-1', 'ds-2', 'ds-3', 'ds-4'],
          })
          .expect(400);
      });

      it('should strip a deleted download source host from download_source_ids', async function () {
        const primaryId = await createDownloadSource(
          `Source to delete ${Date.now()}`,
          'http://to-delete.co:443'
        );
        const secondaryId = await createDownloadSource(
          `Source to keep ${Date.now()}`,
          'http://to-keep.co:443'
        );

        const agentPolicyId = await createAgentPolicy('agent policy with a source to delete', {
          download_source_id: primaryId,
          download_source_ids: [primaryId, secondaryId],
        });

        await supertest
          .delete(`/api/fleet/agent_download_sources/${primaryId}`)
          .set('kbn-xsrf', 'xxxx')
          .expect(200);

        const { body: getAgentPolicyResponse } = await supertest
          .get(`/api/fleet/agent_policies/${agentPolicyId}`)
          .set('kbn-xsrf', 'xxxx')
          .send()
          .expect(200);

        expect(getAgentPolicyResponse.item.download_source_ids).to.eql([secondaryId]);
        expect(getAgentPolicyResponse.item.download_source_id).to.eql(null);
      });
    });

    describe('DELETE /agent_download_sources/{sourceId}', () => {
      let sourceId: string;
      let defaultDSIdToDelete: string;

      before(async () => {
        const { body: postResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Download source to delete test',
            host: 'https://test.co',
          })
          .expect(200);
        sourceId = postResponse.item.id;

        const { body: defaultDSPostResponse } = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: 'Default download source to delete test',
            host: 'https://test.co',
            is_default: true,
          })
          .expect(200);
        defaultDSIdToDelete = defaultDSPostResponse.item.id;
      });

      it('should delete secrets when deleting a download source object', async function () {
        await clearAgents();
        await createFleetServerAgent(fleetServerPolicyId, 'server_1', '8.12.0');
        const res = await supertest
          .post(`/api/fleet/agent_download_sources`)
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `My download source ${Date.now()}`,
            host: 'http://test.fr:443',
            is_default: false,
            ssl: {
              certificate_authorities: ['/path/to/cert-authority'],
              certificate: 'path/to/cert',
            },
            secrets: { ssl: { key: 'KEY1' } },
          })
          .expect(200);
        const dsId = res.body.item.id;
        const secretId = res.body.item.secrets.ssl.key.id;
        await supertest
          .delete(`/api/fleet/agent_download_sources/${dsId}`)
          .set('kbn-xsrf', 'xxxx')
          .expect(200);
        try {
          await getSecretById(secretId);
          expect().fail('Secret should have been deleted');
        } catch (e) {
          // not found
        }
      });

      it('should return a 400 when trying to delete a default download source host ', async function () {
        await supertest
          .delete(`/api/fleet/agent_download_sources/${defaultDSIdToDelete}`)
          .set('kbn-xsrf', 'xxxx')
          .expect(400);
      });

      it('should return a 404 when deleting a non existing entry ', async function () {
        await supertest
          .delete(`/api/fleet/agent_download_sources/idonotexists`)
          .set('kbn-xsrf', 'xxxx')
          .expect(404);
      });

      it('should allow to delete a download source value ', async function () {
        const { body: deleteResponse } = await supertest
          .delete(`/api/fleet/agent_download_sources/${sourceId}`)
          .set('kbn-xsrf', 'xxxx')
          .expect(200);

        expect(deleteResponse.id).to.eql(sourceId);
      });
    });
  });
}
