/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { stringify as yamlStringify } from 'yaml';
import type SuperTest from 'supertest';
import { CASES_URL, CASE_EXTENDED_FIELDS } from '@kbn/cases-plugin/common/constants';
import { CaseStatuses } from '@kbn/cases-plugin/common/types/domain';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { deleteAllCaseItems, createCase, updateCase } from '../../../../common/lib/api';
import { getPostCaseRequest } from '../../../../common/lib/mock';

const FIELD_DEFINITIONS_URL = '/internal/cases/field_definitions';
const TEMPLATES_URL = '/internal/cases/templates';

const createGlobalFieldDefinition = async (supertest: SuperTest.Agent, name: string) => {
  await supertest
    .post(FIELD_DEFINITIONS_URL)
    .set('kbn-xsrf', 'true')
    .send({
      name,
      owner: 'securitySolutionFixture',
      isGlobal: true,
      definition: yamlStringify({
        name,
        type: 'keyword',
        control: 'INPUT_TEXT',
        label: name,
        validation: { required_on_close: true },
      }),
    })
    .expect(200);
};

const createTemplate = async (supertest: SuperTest.Agent, fields: object[] = []) => {
  const { body } = await supertest
    .post(TEMPLATES_URL)
    .set('kbn-xsrf', 'true')
    .send({
      name: 'Test Template',
      owner: 'securitySolutionFixture',
      definition: yamlStringify({
        name: 'Test Template',
        fields,
      }),
      isEnabled: true,
    })
    .expect(200);

  return body as { templateId: string; templateVersion: number };
};

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('required_on_close — server-side close validation', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    describe('template fields with required_on_close', () => {
      it('blocks closing when a template required_on_close field is missing', async () => {
        const template = await createTemplate(supertest, [
          {
            name: 'resolution_notes',
            type: 'keyword',
            control: 'INPUT_TEXT',
            label: 'Resolution Notes',
            validation: { required_on_close: true },
          },
        ]);

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: template.templateId, version: template.templateVersion },
        });

        // FAILURE SCENARIO: status → closed but required_on_close field not filled
        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses.closed,
              },
            ],
          },
          expectedHttpCode: 400,
        });
      });

      it('blocks closing when a template required_on_close field is explicitly empty', async () => {
        const template = await createTemplate(supertest, [
          {
            name: 'resolution_notes',
            type: 'keyword',
            control: 'INPUT_TEXT',
            label: 'Resolution Notes',
            validation: { required_on_close: true },
          },
        ]);

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: template.templateId, version: template.templateVersion },
          [CASE_EXTENDED_FIELDS]: { resolution_notes_as_keyword: '' },
        });

        // FAILURE SCENARIO: field exists but was cleared before closing
        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses.closed,
              },
            ],
          },
          expectedHttpCode: 400,
        });
      });

      it('allows closing when a template required_on_close field is provided in the same request', async () => {
        const template = await createTemplate(supertest, [
          {
            name: 'resolution_notes',
            type: 'keyword',
            control: 'INPUT_TEXT',
            label: 'Resolution Notes',
            validation: { required_on_close: true },
          },
        ]);

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: template.templateId, version: template.templateVersion },
        });

        const patchedCases = await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses.closed,
                [CASE_EXTENDED_FIELDS]: { resolution_notes_as_keyword: 'Fixed in v2.3' },
              },
            ],
          },
        });

        expect(patchedCases[0].status).to.eql(CaseStatuses.closed);
      });

      it('allows closing when required_on_close field was filled in a prior update', async () => {
        const template = await createTemplate(supertest, [
          {
            name: 'resolution_notes',
            type: 'keyword',
            control: 'INPUT_TEXT',
            label: 'Resolution Notes',
            validation: { required_on_close: true },
          },
        ]);

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: template.templateId, version: template.templateVersion },
          [CASE_EXTENDED_FIELDS]: { resolution_notes_as_keyword: 'Pre-filled' },
        });

        // Close without including extended_fields — server merges existing SO value
        const patchedCases = await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses.closed,
              },
            ],
          },
        });

        expect(patchedCases[0].status).to.eql(CaseStatuses.closed);
      });

      it('uses merged state — a prior value does NOT save a case when the close request clears it', async () => {
        const template = await createTemplate(supertest, [
          {
            name: 'resolution_notes',
            type: 'keyword',
            control: 'INPUT_TEXT',
            label: 'Resolution Notes',
            validation: { required_on_close: true },
          },
        ]);

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: template.templateId, version: template.templateVersion },
          [CASE_EXTENDED_FIELDS]: { resolution_notes_as_keyword: 'Was filled' },
        });

        // FAILURE SCENARIO: close request explicitly clears the field
        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses.closed,
                [CASE_EXTENDED_FIELDS]: { resolution_notes_as_keyword: '' },
              },
            ],
          },
          expectedHttpCode: 400,
        });
      });

      it('returns an error message that identifies which field is unfilled', async () => {
        const template = await createTemplate(supertest, [
          {
            name: 'resolution_notes',
            type: 'keyword',
            control: 'INPUT_TEXT',
            label: 'Resolution Notes',
            validation: { required_on_close: true },
          },
        ]);

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: template.templateId, version: template.templateVersion },
        });

        const { body } = await supertest
          .patch(CASES_URL)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses.closed,
              },
            ],
          })
          .expect(400);

        expect(body.message).to.contain(
          `Cannot close case ${postedCase.id}, required fields must be filled`
        );
        expect(body.message).to.contain('Resolution Notes');
      });
    });

    describe('global fields with required_on_close', () => {
      it('blocks closing when a global required_on_close field is missing', async () => {
        await createGlobalFieldDefinition(supertest, 'impact_summary');

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
        });

        // FAILURE SCENARIO: global field is required_on_close but not filled
        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses.closed,
              },
            ],
          },
          expectedHttpCode: 400,
        });
      });

      it('allows closing when a global required_on_close field is filled', async () => {
        await createGlobalFieldDefinition(supertest, 'impact_summary');

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          [CASE_EXTENDED_FIELDS]: { impact_summary_as_keyword: 'Low impact' },
        });

        const patchedCases = await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses.closed,
              },
            ],
          },
        });

        expect(patchedCases[0].status).to.eql(CaseStatuses.closed);
      });
    });

    describe('status changes other than close', () => {
      it('does not enforce required_on_close when transitioning to in_progress', async () => {
        const template = await createTemplate(supertest, [
          {
            name: 'resolution_notes',
            type: 'keyword',
            control: 'INPUT_TEXT',
            label: 'Resolution Notes',
            validation: { required_on_close: true },
          },
        ]);

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: template.templateId, version: template.templateVersion },
        });

        // Moving to in_progress should not trigger close validation
        const patchedCases = await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses['in-progress'],
              },
            ],
          },
        });

        expect(patchedCases[0].status).to.eql(CaseStatuses['in-progress']);
      });

      it('does not enforce required_on_close when status is not changing', async () => {
        const template = await createTemplate(supertest, [
          {
            name: 'resolution_notes',
            type: 'keyword',
            control: 'INPUT_TEXT',
            label: 'Resolution Notes',
            validation: { required_on_close: true },
          },
        ]);

        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          template: { id: template.templateId, version: template.templateVersion },
        });

        // Update title only — no status change, no close validation
        const patchedCases = await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                title: 'Updated title',
              },
            ],
          },
        });

        expect(patchedCases[0].title).to.eql('Updated title');
        expect(patchedCases[0].status).to.eql(CaseStatuses.open);
      });
    });

    describe('cases without templates', () => {
      it('allows closing when there is no template and no required_on_close global fields', async () => {
        const postedCase = await createCase(supertest, {
          ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
        });

        const patchedCases = await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: postedCase.id,
                version: postedCase.version,
                status: CaseStatuses.closed,
              },
            ],
          },
        });

        expect(patchedCases[0].status).to.eql(CaseStatuses.closed);
      });
    });

    describe('bulk close validation', () => {
      it('blocks the entire bulk update if any case fails required_on_close validation', async () => {
        const template = await createTemplate(supertest, [
          {
            name: 'resolution_notes',
            type: 'keyword',
            control: 'INPUT_TEXT',
            label: 'Resolution Notes',
            validation: { required_on_close: true },
          },
        ]);

        const [caseWithField, caseWithoutField] = await Promise.all([
          createCase(supertest, {
            ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            template: { id: template.templateId, version: template.templateVersion },
            [CASE_EXTENDED_FIELDS]: { resolution_notes_as_keyword: 'Filled' },
          }),
          createCase(supertest, {
            ...getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            template: { id: template.templateId, version: template.templateVersion },
          }),
        ]);

        // FAILURE SCENARIO: second case is missing the required_on_close field
        await supertest
          .patch(CASES_URL)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({
            cases: [
              {
                id: caseWithField.id,
                version: caseWithField.version,
                status: CaseStatuses.closed,
              },
              {
                id: caseWithoutField.id,
                version: caseWithoutField.version,
                status: CaseStatuses.closed,
              },
            ],
          })
          .expect(400);
      });
    });
  });
};
