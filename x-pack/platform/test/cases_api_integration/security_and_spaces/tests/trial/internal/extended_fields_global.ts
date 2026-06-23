/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { stringify as yamlStringify } from 'yaml';
import { CASES_URL, CASE_EXTENDED_FIELDS } from '@kbn/cases-plugin/common/constants';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { deleteAllCaseItems, createCase } from '../../../../common/lib/api';
import { getPostCaseRequest } from '../../../../common/lib/mock';

const FIELD_DEFINITIONS_URL = '/internal/cases/field_definitions';

const buildFieldDef = (name: string, type = 'keyword', isGlobal = true) => ({
  name,
  owner: 'securitySolutionFixture',
  isGlobal,
  definition: yamlStringify({ name, type, control: 'INPUT_TEXT', label: name }),
});

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('extended_fields — global field definitions (isGlobal)', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    describe('POST /cases — create with global extended_fields', () => {
      it('creates a case with global extended_fields when no template is selected', async () => {
        await supertest
          .post(`${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildFieldDef('risk_score'))
          .expect(200);

        const createdCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          [CASE_EXTENDED_FIELDS]: { risk_score_as_keyword: 'high' },
        });

        expect(createdCase[CASE_EXTENDED_FIELDS]).to.eql({ risk_score_as_keyword: 'high' });
      });

      it('rejects non-global extended_fields keys when no template is selected', async () => {
        // No field definitions registered — any extended_fields key should be rejected
        await supertest
          .post(`${CASES_URL}`)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({
            ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            [CASE_EXTENDED_FIELDS]: { unknown_field_as_keyword: 'value' },
          })
          .expect(400);
      });

      it('creates a case with mixed global + template extended_fields', async () => {
        await supertest
          .post(`${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildFieldDef('global_tag'))
          .expect(200);

        const { body: templateBody } = await supertest
          .post('/internal/cases/templates')
          .set('kbn-xsrf', 'true')
          .send({
            name: 'Test Template',
            owner: 'securitySolutionFixture',
            definition: yamlStringify({
              name: 'Test Template',
              fields: [
                { name: 'summary', type: 'keyword', control: 'INPUT_TEXT', label: 'Summary' },
              ],
            }),
            isEnabled: true,
          })
          .expect(200);

        const createdCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: templateBody.templateId, version: templateBody.templateVersion },
          [CASE_EXTENDED_FIELDS]: {
            global_tag_as_keyword: 'security',
            summary_as_keyword: 'hello',
          },
        });

        expect(createdCase[CASE_EXTENDED_FIELDS]).to.eql({
          global_tag_as_keyword: 'security',
          summary_as_keyword: 'hello',
        });
      });
    });

    describe('PATCH /cases — update extended_fields with global keys', () => {
      it('allows updating a case with global extended_fields when no template is set', async () => {
        await supertest
          .post(`${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildFieldDef('risk_score'))
          .expect(200);

        const createdCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
        });

        const { body: updated } = await supertest
          .patch(`${CASES_URL}`)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({
            cases: [
              {
                id: createdCase.id,
                version: createdCase.version,
                [CASE_EXTENDED_FIELDS]: { risk_score_as_keyword: 'low' },
              },
            ],
          })
          .expect(200);

        expect(updated[0][CASE_EXTENDED_FIELDS]).to.eql({ risk_score_as_keyword: 'low' });
      });

      it('rejects non-global extended_fields keys on update when no template is set', async () => {
        const createdCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
        });

        await supertest
          .patch(`${CASES_URL}`)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({
            cases: [
              {
                id: createdCase.id,
                version: createdCase.version,
                [CASE_EXTENDED_FIELDS]: { unregistered_field_as_keyword: 'value' },
              },
            ],
          })
          .expect(400);
      });

      it('merges extended_fields with existing values on update (server-side merge)', async () => {
        await supertest
          .post(`${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildFieldDef('field_a'))
          .expect(200);

        await supertest
          .post(`${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildFieldDef('field_b'))
          .expect(200);

        // Create with field_a set
        const createdCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          [CASE_EXTENDED_FIELDS]: { field_a_as_keyword: 'value_a' },
        });

        // Update sending only field_b — server should preserve field_a
        const { body: updated } = await supertest
          .patch(`${CASES_URL}`)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({
            cases: [
              {
                id: createdCase.id,
                version: createdCase.version,
                [CASE_EXTENDED_FIELDS]: { field_b_as_keyword: 'value_b' },
              },
            ],
          })
          .expect(200);

        expect(updated[0][CASE_EXTENDED_FIELDS]).to.eql({
          field_a_as_keyword: 'value_a',
          field_b_as_keyword: 'value_b',
        });
      });

      it('allows global field keys when template is explicitly cleared (template: null)', async () => {
        await supertest
          .post(`${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildFieldDef('risk_score'))
          .expect(200);

        const { body: templateBody } = await supertest
          .post('/internal/cases/templates')
          .set('kbn-xsrf', 'true')
          .send({
            name: 'Test Template',
            owner: 'securitySolutionFixture',
            definition: yamlStringify({
              name: 'Test Template',
              fields: [],
            }),
            isEnabled: true,
          })
          .expect(200);

        const createdCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: templateBody.templateId, version: templateBody.templateVersion },
        });

        // Clear the template and provide a global field
        const { body: updated } = await supertest
          .patch(`${CASES_URL}`)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({
            cases: [
              {
                id: createdCase.id,
                version: createdCase.version,
                template: null,
                [CASE_EXTENDED_FIELDS]: { risk_score_as_keyword: 'medium' },
              },
            ],
          })
          .expect(200);

        expect(updated[0][CASE_EXTENDED_FIELDS]).to.eql({ risk_score_as_keyword: 'medium' });
      });
    });
  });
};
