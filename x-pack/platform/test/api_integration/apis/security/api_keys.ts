/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const config = getService('config');
  const basic = config.get('esTestCluster.license') === 'basic';

  describe('API Keys', () => {
    describe('GET /internal/security/api_key/_enabled', () => {
      it('should indicate that API Keys are enabled', async () => {
        await supertest
          .get('/internal/security/api_key/_enabled')
          .set('kbn-xsrf', 'xxx')
          .send()
          .expect(200)
          .then((response: Record<string, any>) => {
            const payload = response.body;
            expect(payload).to.eql({ apiKeysEnabled: true });
          });
      });
    });

    describe('POST /internal/security/api_key', () => {
      it('should allow an API Key to be created', async () => {
        await supertest
          .post('/internal/security/api_key')
          .set('kbn-xsrf', 'xxx')
          .send({
            name: 'test_api_key',
            expiration: '12d',
            role_descriptors: {
              role_1: {
                cluster: ['monitor'],
              },
            },
          })
          .expect(200)
          .then((response: Record<string, any>) => {
            const { name } = response.body;
            expect(name).to.eql('test_api_key');
          });
      });

      it('should allow an API Key to be created with metadata', async () => {
        await supertest
          .post('/internal/security/api_key')
          .set('kbn-xsrf', 'xxx')
          .send({
            name: 'test_api_key_with_metadata',
            metadata: {
              foo: 'bar',
            },
          })
          .expect(200)
          .then((response: Record<string, any>) => {
            const { name } = response.body;
            expect(name).to.eql('test_api_key_with_metadata');
          });
      });

      it(`${basic ? 'basic' : 'trial'} license should ${
        basic ? 'not allow' : 'allow'
      } a cross cluster API Key to be created`, async () => {
        const result = await supertest
          .post('/internal/security/api_key')
          .set('kbn-xsrf', 'xxx')
          .send({
            type: 'cross_cluster',
            name: 'test_cc_api_key',
            metadata: {},
            access: {
              search: [
                {
                  names: ['logs*'],
                  query: { bool: { must_not: { term: { field2: 'value2' } } } },
                  field_security: { grant: ['field2'] },
                  allow_restricted_indices: true,
                },
              ],
            },
          });
        expect(result.status).to.be(basic ? 403 : 200);
        if (!basic) {
          expect(result.body.name).to.be('test_cc_api_key');
        }
      });

      if (!basic) {
        it(`Elasticsearch should reject an invalid cross cluster API Key configuration`, async () => {
          await supertest
            .post('/internal/security/api_key')
            .set('kbn-xsrf', 'xxx')
            .send({
              type: 'cross_cluster',
              name: 'test_cc_api_key_failure',
              metadata: {},
              access: {
                search: [
                  {
                    names: ['logs*'],
                    query: { bool: { must_not: { term: { field2: 'value2' } } } },
                  },
                ],
                // replication section is not allowed if earch contains query or field_security
                replication: {
                  names: ['logs*'],
                },
              },
            })
            .expect(400);

          await supertest
            .post('/internal/security/api_key')
            .set('kbn-xsrf', 'xxx')
            .send({
              type: 'cross_cluster',
              name: 'test_cc_api_key_failure',
              metadata: {},
              access: {
                search: [
                  {
                    names: ['logs*'],
                    field_security: { grant: ['field2'] },
                  },
                ],
                // replication section is not allowed if earch contains query or field_security
                replication: {
                  names: ['logs*'],
                },
              },
            })
            .expect(400);
        });

        it(`should allow a cross cluster API Key to be created with a certificate identity`, async () => {
          const certificateIdentity = 'CN=host,OU=engineering,DC=example,DC=com';
          const createResult = await supertest
            .post('/internal/security/api_key')
            .set('kbn-xsrf', 'xxx')
            .send({
              type: 'cross_cluster',
              name: 'test_cc_api_key_with_certificate_identity',
              metadata: {},
              certificate_identity: certificateIdentity,
              access: {
                search: [
                  {
                    names: ['logs*'],
                  },
                ],
              },
            })
            .expect(200);

          const queryResult = await supertest
            .post('/internal/security/api_key/_query')
            .send({})
            .set('kbn-xsrf', 'xxx')
            .expect(200);

          const createdKey = queryResult.body.apiKeys.find(
            (apiKey: { id: string }) => apiKey.id === createResult.body.id
          );
          expect(createdKey).to.not.be(undefined);
          expect(createdKey.certificate_identity).to.eql(certificateIdentity);
        });
      }
    });

    describe('PUT /internal/security/api_key', () => {
      it('should allow an API Key to be updated', async () => {
        let id = '';

        await supertest
          .post('/internal/security/api_key')
          .set('kbn-xsrf', 'xxx')
          .send({
            name: 'test_api_key',
            expiration: '12d',
          })
          .expect(200)
          .then((response: Record<string, any>) => {
            id = response.body.id;
          });

        await supertest
          .put('/internal/security/api_key')
          .set('kbn-xsrf', 'xxx')
          .send({
            id,
            metadata: {
              foo: 'bar',
            },
            role_descriptors: {
              role_1: {
                cluster: ['monitor'],
              },
            },
          })
          .expect(200)
          .then((response: Record<string, any>) => {
            const { updated } = response.body;
            expect(updated).to.eql(true);
          });

        const queryResult = await supertest
          .post('/internal/security/api_key/_query')
          .send({})
          .set('kbn-xsrf', 'xxx')
          .expect(200);

        expect(queryResult.body.apiKeys).to.not.be(undefined);
        const updatedKey = queryResult.body.apiKeys.find(
          (apiKey: { id: string }) => apiKey.id === id
        );
        expect(updatedKey).to.not.be(undefined);
        expect(updatedKey.metadata).to.eql({ foo: 'bar' });
        expect(updatedKey.role_descriptors).to.eql({
          role_1: {
            cluster: ['monitor'],
            indices: [],
            applications: [],
            run_as: [],
            metadata: {},
            transient_metadata: {
              enabled: true,
            },
          },
        });
      });

      it(`${basic ? 'basic' : 'trial'} license should ${
        basic ? 'not allow' : 'allow'
      } a cross cluster API Key to be updated`, async () => {
        let id = '123456';

        const createResult = await supertest
          .post('/internal/security/api_key')
          .set('kbn-xsrf', 'xxx')
          .send({
            type: 'cross_cluster',
            name: 'test_cc_api_key',
            metadata: {},
            access: {
              search: [
                {
                  names: ['logs*'],
                  query: { bool: { must_not: { term: { field2: 'value2' } } } },
                  field_security: { grant: ['field2'] },
                  allow_restricted_indices: true,
                },
              ],
            },
          });
        expect(createResult.status).to.be(basic ? 403 : 200);
        if (!basic) {
          id = createResult.body.id;
        }

        const updateResult = await supertest
          .put('/internal/security/api_key')
          .set('kbn-xsrf', 'xxx')
          .send({
            type: 'cross_cluster',
            id,
            metadata: {
              foo: 'bar',
            },
            access: {
              search: [
                {
                  names: ['somethingelse*'],
                  query: { bool: { must_not: { term: { field2: 'value3' } } } },
                  field_security: { grant: ['field3'] },
                  allow_restricted_indices: false,
                },
              ],
            },
          });
        expect(updateResult.status).to.be(basic ? 403 : 200);
        if (!basic) {
          expect(updateResult.body.updated).to.be(true);

          const queryResult = await supertest
            .post('/internal/security/api_key/_query')
            .send({})
            .set('kbn-xsrf', 'xxx')
            .expect(200);

          expect(queryResult.body.apiKeys).to.not.be(undefined);
          const updatedKey = queryResult.body.apiKeys.find(
            (apiKey: { id: string }) => apiKey.id === id
          );
          expect(updatedKey).to.not.be(undefined);
          expect(updatedKey.metadata).to.eql({ foo: 'bar' });
          expect(updatedKey.role_descriptors?.cross_cluster?.indices).to.eql([
            {
              names: ['somethingelse*'],
              privileges: ['read', 'read_cross_cluster', 'view_index_metadata'],
              field_security: { grant: ['field3'] },
              query: '{"bool":{"must_not":{"term":{"field2":"value3"}}}}',
              allow_restricted_indices: false,
            },
          ]);
        }
      });

      if (!basic) {
        it(`Elasticsearch should reject an invalid cross cluster API Key configuration`, async () => {
          const createResult = await supertest
            .post('/internal/security/api_key')
            .set('kbn-xsrf', 'xxx')
            .send({
              type: 'cross_cluster',
              name: 'test_cc_api_key',
              metadata: {},
              access: {
                search: [
                  {
                    names: ['logs*'],
                  },
                ],
              },
            });
          expect(createResult.status).to.be(200);
          const id = createResult.body.id;

          await supertest
            .put('/internal/security/api_key')
            .set('kbn-xsrf', 'xxx')
            .send({
              type: 'cross_cluster',
              id,
              metadata: {
                foo: 'bar',
              },
              access: {
                search: [
                  {
                    names: ['logs*'],
                    query: { bool: { must_not: { term: { field2: 'value2' } } } },
                  },
                ],
                // replication section is not allowed if earch contains query or field_security
                replication: {
                  names: ['logs*'],
                },
              },
            })
            .expect(400);

          await supertest
            .put('/internal/security/api_key')
            .set('kbn-xsrf', 'xxx')
            .send({
              type: 'cross_cluster',
              id,
              metadata: {
                foo: 'bar',
              },
              access: {
                search: [
                  {
                    names: ['logs*'],
                    field_security: { grant: ['field2'] },
                  },
                ],
                // replication section is not allowed if earch contains query or field_security
                replication: {
                  names: ['logs*'],
                },
              },
            })
            .expect(400);
        });
      }
    });
  });
}
