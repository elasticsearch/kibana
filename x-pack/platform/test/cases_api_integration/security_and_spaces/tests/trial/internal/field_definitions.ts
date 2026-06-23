/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { deleteAllCaseItems, getSpaceUrlPrefix } from '../../../../common/lib/api';
import {
  noKibanaPrivileges,
  secOnly,
  secOnlyManageTemplates,
  secOnlyNoManageTemplates,
  secOnlyRead,
} from '../../../../common/lib/authentication/users';

const FIELD_DEFINITIONS_URL = '/internal/cases/field_definitions';

const buildCreateBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'priority',
  owner: 'securitySolutionFixture',
  definition: 'name: priority\ncontrol: SELECT_BASIC\ntype: keyword\n',
  ...overrides,
});

export default ({ getService }: FtrProviderContext): void => {
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const supertest = getService('supertest');
  const es = getService('es');

  describe('Field definitions API', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    describe('POST /internal/cases/field_definitions', () => {
      it('creates a field definition for a user with manageTemplates privilege', async () => {
        const { body } = await supertestWithoutAuth
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(200);

        expect(body.name).to.eql('priority');
        expect(body.owner).to.eql('securitySolutionFixture');
        expect(body.fieldDefinitionId).to.be.a('string');
      });

      it('creates a field definition for a user with full cases access', async () => {
        const { body } = await supertestWithoutAuth
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .auth(secOnly.username, secOnly.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(200);

        expect(body.name).to.eql('priority');
      });

      it('returns 403 for a user without manageTemplates privilege', async () => {
        await supertestWithoutAuth
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .auth(secOnlyNoManageTemplates.username, secOnlyNoManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(403);
      });

      it('returns 400 for invalid YAML definition', async () => {
        await supertestWithoutAuth
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody({ definition: ': {not valid yaml' }))
          .expect(400);
      });

      it('returns 409 when a field definition with the same name already exists', async () => {
        await supertestWithoutAuth
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(200);

        await supertestWithoutAuth
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(409);
      });

      it('name conflict check is case-insensitive', async () => {
        await supertestWithoutAuth
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody({ name: 'Priority' }))
          .expect(200);

        await supertestWithoutAuth
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody({ name: 'priority' }))
          .expect(409);
      });
    });

    describe('GET /internal/cases/field_definitions', () => {
      beforeEach(async () => {
        await supertest
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(200);
      });

      it('lists field definitions for a user with manageTemplates privilege', async () => {
        const { body } = await supertestWithoutAuth
          .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .query({ owner: 'securitySolutionFixture' })
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .expect(200);

        expect(body.fieldDefinitions).to.have.length(1);
        expect(body.fieldDefinitions[0].name).to.eql('priority');
        expect(body.total).to.eql(1);
      });

      it('lists field definitions for a user with full cases access', async () => {
        const { body } = await supertestWithoutAuth
          .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .query({ owner: 'securitySolutionFixture' })
          .auth(secOnly.username, secOnly.password)
          .expect(200);

        expect(body.fieldDefinitions).to.have.length(1);
      });

      it('lists field definitions for a read-only user (cases.read is sufficient)', async () => {
        const { body } = await supertestWithoutAuth
          .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .query({ owner: 'securitySolutionFixture' })
          .auth(secOnlyRead.username, secOnlyRead.password)
          .expect(200);

        expect(body.fieldDefinitions).to.have.length(1);
      });

      it('lists field definitions for a user with full Cases access but no manageTemplates sub-privilege', async () => {
        const { body } = await supertestWithoutAuth
          .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .query({ owner: 'securitySolutionFixture' })
          .auth(secOnlyNoManageTemplates.username, secOnlyNoManageTemplates.password)
          .expect(200);

        expect(body.fieldDefinitions).to.have.length(1);
      });

      it('returns 403 for a user with no Kibana privileges', async () => {
        await supertestWithoutAuth
          .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .query({ owner: 'securitySolutionFixture' })
          .auth(noKibanaPrivileges.username, noKibanaPrivileges.password)
          .expect(403);
      });

      it('is space-isolated: definitions from space1 are not visible in space2', async () => {
        // Use supertest (superuser) to query space2 — the test user only has access to space1
        const { body } = await supertest
          .get(`${getSpaceUrlPrefix('space2')}${FIELD_DEFINITIONS_URL}`)
          .query({ owner: 'securitySolutionFixture' })
          .expect(200);

        expect(body.fieldDefinitions).to.have.length(0);
      });

      describe('isGlobal filter', () => {
        beforeEach(async () => {
          // Add a second definition with isGlobal: true alongside the one from the outer beforeEach
          await supertest
            .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
            .set('kbn-xsrf', 'true')
            .send(buildCreateBody({ name: 'severity', isGlobal: true }))
            .expect(200);
        });

        it('returns only isGlobal definitions when filtered with isGlobal=true', async () => {
          const { body } = await supertest
            .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
            .query({ owner: 'securitySolutionFixture', isGlobal: true })
            .expect(200);

          expect(body.fieldDefinitions).to.have.length(1);
          expect(body.fieldDefinitions[0].name).to.eql('severity');
          expect(body.fieldDefinitions[0].isGlobal).to.eql(true);
        });

        it('returns all definitions when isGlobal is not specified', async () => {
          const { body } = await supertest
            .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
            .query({ owner: 'securitySolutionFixture' })
            .expect(200);

          expect(body.total).to.eql(2);
        });

        it('returns all definitions when isGlobal=false (no filter applied)', async () => {
          const { body } = await supertest
            .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
            .query({ owner: 'securitySolutionFixture', isGlobal: false })
            .expect(200);

          expect(body.total).to.eql(2);
        });

        it('persists the isGlobal flag returned in the response', async () => {
          const { body } = await supertest
            .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
            .query({ owner: 'securitySolutionFixture', isGlobal: true })
            .expect(200);

          expect(body.fieldDefinitions[0].isGlobal).to.eql(true);
        });
      });
    });

    describe('PUT /internal/cases/field_definitions/{field_definition_id}', () => {
      let fieldDefinitionId: string;

      beforeEach(async () => {
        const { body } = await supertest
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(200);

        fieldDefinitionId = body.fieldDefinitionId;
      });

      it('updates a field definition for a user with manageTemplates privilege', async () => {
        const { body } = await supertestWithoutAuth
          .put(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}/${fieldDefinitionId}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(
            buildCreateBody({
              definition: 'name: priority\ncontrol: SELECT_BASIC\ntype: keyword\nlabel: Priority\n',
            })
          )
          .expect(200);

        expect(body.name).to.eql('priority');
      });

      it('returns 403 for a user without manageTemplates privilege', async () => {
        await supertestWithoutAuth
          .put(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}/${fieldDefinitionId}`)
          .auth(secOnlyNoManageTemplates.username, secOnlyNoManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(403);
      });

      it('returns 409 when updating to a name already used by another definition', async () => {
        await supertest
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody({ name: 'severity' }))
          .expect(200);

        await supertestWithoutAuth
          .put(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}/${fieldDefinitionId}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody({ name: 'severity' }))
          .expect(409);
      });

      it('allows renaming a definition to its own current name', async () => {
        await supertestWithoutAuth
          .put(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}/${fieldDefinitionId}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(200);
      });

      it('returns 404 for a non-existent field definition id', async () => {
        await supertestWithoutAuth
          .put(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}/does-not-exist`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(404);
      });
    });

    describe('DELETE /internal/cases/field_definitions/{field_definition_id}', () => {
      let fieldDefinitionId: string;

      beforeEach(async () => {
        const { body } = await supertest
          .post(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .set('kbn-xsrf', 'true')
          .send(buildCreateBody())
          .expect(200);

        fieldDefinitionId = body.fieldDefinitionId;
      });

      it('deletes a field definition for a user with manageTemplates privilege', async () => {
        await supertestWithoutAuth
          .delete(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}/${fieldDefinitionId}`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .expect(204);

        const { body } = await supertest
          .get(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}`)
          .query({ owner: 'securitySolutionFixture' })
          .expect(200);

        expect(body.fieldDefinitions).to.have.length(0);
      });

      it('returns 403 for a user without manageTemplates privilege', async () => {
        await supertestWithoutAuth
          .delete(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}/${fieldDefinitionId}`)
          .auth(secOnlyNoManageTemplates.username, secOnlyNoManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .expect(403);
      });

      it('returns 404 for a non-existent field definition id', async () => {
        await supertestWithoutAuth
          .delete(`${getSpaceUrlPrefix('space1')}${FIELD_DEFINITIONS_URL}/does-not-exist`)
          .auth(secOnlyManageTemplates.username, secOnlyManageTemplates.password)
          .set('kbn-xsrf', 'true')
          .expect(404);
      });
    });
  });
};
