/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  MAX_CASES_PER_WORKFLOW_RUN,
  OBSERVABLE_TYPE_IPV4,
} from '@kbn/cases-plugin/common/constants';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { getPostCaseRequest, postCommentAlertReq } from '../../../../common/lib/mock';
import {
  createCase,
  createComment,
  deleteAllCaseItems,
  addObservable,
  createWorkflow,
  deleteWorkflow,
  runCaseWorkflow,
} from '../../../../common/lib/api';
import { superUser } from '../../../../common/lib/authentication/users';
import { createUsersAndRoles, deleteUsersAndRoles } from '../../../../common/lib/authentication';
import {
  secAllWorkflowExecuteUser,
  secAllNoWorkflowExecuteUser,
  workflowExecuteOnlyUser,
  obsAllWorkflowExecuteUser,
  secAllWorkflowExecuteAllSpacesUser,
  workflowRoles,
  workflowUsers,
} from '../../../../common/lib/authentication/workflow_roles';

// Minimal console-step workflow YAML shared across all test cases.
const enabledWorkflowYaml = `
name: cases-run-workflow-ftr
enabled: true
triggers:
  - type: manual
steps:
  - name: log
    type: console
    with:
      message: "cases workflow ftr run"
`.trim();

const disabledWorkflowYaml = `
name: cases-run-workflow-ftr-disabled
enabled: false
triggers:
  - type: manual
steps:
  - name: log
    type: console
    with:
      message: "disabled"
`.trim();

export default ({ getService }: FtrProviderContext): void => {
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');

  describe('run workflow', () => {
    let enabledWorkflowId: string;
    let disabledWorkflowId: string;

    before(async () => {
      await createUsersAndRoles(getService, workflowUsers, workflowRoles);

      // Create workflows in space1 as superUser so the enabled-workflow happy-path
      // tests (which run from space1) can find them. The "workflow created in space1,
      // request from default space → 404" test verifies the inverse direction.
      enabledWorkflowId = await createWorkflow({
        supertest: supertestWithoutAuth,
        yaml: enabledWorkflowYaml,
        auth: { user: superUser, space: 'space1' },
      });
      disabledWorkflowId = await createWorkflow({
        supertest: supertestWithoutAuth,
        yaml: disabledWorkflowYaml,
        auth: { user: superUser, space: 'space1' },
      });
    });

    after(async () => {
      await deleteWorkflow({
        supertest: supertestWithoutAuth,
        workflowId: enabledWorkflowId,
        auth: { user: superUser, space: 'space1' },
      });
      await deleteWorkflow({
        supertest: supertestWithoutAuth,
        workflowId: disabledWorkflowId,
        auth: { user: superUser, space: 'space1' },
      });
      await deleteAllCaseItems(es);
      await deleteUsersAndRoles(getService, workflowUsers, workflowRoles);
    });

    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    describe('happy path', () => {
      it('returns 200 and a workflowExecutionId for a single case with no origin', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        const result = await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [theCase.id], inputs: {} },
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });

        expect(result.workflowExecutionId).to.be.a('string');
        expect(result.workflowExecutionId.length).to.be.greaterThan(0);
      });

      it('returns 200 for multiple cases with no origin', async () => {
        const [case1, case2] = await Promise.all([
          createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            { user: superUser, space: 'space1' }
          ),
          createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            { user: superUser, space: 'space1' }
          ),
        ]);

        const result = await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [case1.id, case2.id], inputs: {} },
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });

        expect(result.workflowExecutionId).to.be.a('string');
      });

      it('returns 200 with origin cases.case', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        const result = await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {},
            origin: { type: 'cases.case', caseId: theCase.id },
          },
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });

        expect(result.workflowExecutionId).to.be.a('string');
      });

      it('returns 200 with origin cases.observable for a real observable', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        const updatedCase = await addObservable({
          supertest: supertestWithoutAuth,
          caseId: theCase.id,
          params: {
            observable: {
              value: '1.2.3.4',
              typeKey: OBSERVABLE_TYPE_IPV4.key,
              description: '',
            },
          },
          auth: { user: superUser, space: 'space1' },
        });

        const observableId = updatedCase.observables[0].id as string;

        const result = await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {},
            origin: {
              type: 'cases.observable',
              caseId: theCase.id,
              observableId,
            },
          },
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });

        expect(result.workflowExecutionId).to.be.a('string');
      });

      it('returns 200 with a bulk attachment origin and a real alert attachment', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await createComment({
          supertest: supertestWithoutAuth,
          caseId: theCase.id,
          params: postCommentAlertReq,
          auth: { user: superUser, space: 'space1' },
        });

        const result = await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {
              event: {
                alertIds: [{ _id: postCommentAlertReq.alertId, _index: postCommentAlertReq.index }],
              },
            },
            origin: {
              type: 'cases.attachments',
              caseId: theCase.id,
              attachmentType: 'security.alert',
              attachmentIds: [postCommentAlertReq.alertId as string],
            },
          },
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });

        expect(result.workflowExecutionId).to.be.a('string');
      });
    });

    // -----------------------------------------------------------------------
    // Workflow resolution errors
    // -----------------------------------------------------------------------

    describe('workflow resolution', () => {
      it('returns 404 for an unknown workflow id', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: 'does-not-exist',
          params: { caseIds: [theCase.id], inputs: {} },
          expectedHttpCode: 404,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 for a disabled workflow', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: disabledWorkflowId,
          params: { caseIds: [theCase.id], inputs: {} },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 404 when calling from the default space for a workflow created in space1', async () => {
        // Create the case in the default space (space: null) because the user has
        // securitySolutionFixture in all spaces, but the workflow only exists in space1.
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: null }
        );

        // The request is sent without a space prefix (default space).
        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [theCase.id], inputs: {} },
          expectedHttpCode: 404,
          auth: { user: secAllWorkflowExecuteAllSpacesUser, space: null },
        });
      });
    });

    // -----------------------------------------------------------------------
    // RBAC
    // -----------------------------------------------------------------------

    describe('rbac', () => {
      it('returns 403 when the caller lacks workflowsManagement workflow_execute (route-level)', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [theCase.id], inputs: {} },
          expectedHttpCode: 403,
          auth: { user: secAllNoWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 403 when the caller has workflow_execute but no cases updateCase privilege (handler-level)', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [theCase.id], inputs: {} },
          expectedHttpCode: 403,
          auth: { user: workflowExecuteOnlyUser, space: 'space1' },
        });
      });

      it('returns 403 when the caller has wrong owner (obs vs sec case)', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [theCase.id], inputs: {} },
          expectedHttpCode: 403,
          auth: { user: obsAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 403 for a mixed-owner batch (all-or-nothing enforcement)', async () => {
        const [secCase, obsCase] = await Promise.all([
          createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            { user: superUser, space: 'space1' }
          ),
          createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'observabilityFixture' }),
            200,
            { user: superUser, space: 'space1' }
          ),
        ]);

        // secAllWorkflowExecuteUser can only see securitySolutionFixture cases.
        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [secCase.id, obsCase.id], inputs: {} },
          expectedHttpCode: 403,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 403 (not 404) when the batch contains a non-existent case id', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [theCase.id, 'non-existent-id'], inputs: {} },
          expectedHttpCode: 403,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 403 when the case exists in the default space but the request targets space1', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: null }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [theCase.id], inputs: {} },
          expectedHttpCode: 403,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });
    });

    // -----------------------------------------------------------------------
    // Request schema validation (400)
    // -----------------------------------------------------------------------

    describe('request validation', () => {
      it('returns 400 when caseIds is empty', async () => {
        // caseIds: [] is structurally valid TypeScript but rejected at runtime by the Zod min(1) refinement.
        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: { caseIds: [] as string[], inputs: {} },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 when caseIds contains duplicates', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id, theCase.id],
            inputs: {},
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it(`returns 400 when caseIds exceeds the maximum of ${MAX_CASES_PER_WORKFLOW_RUN}`, async () => {
        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: Array.from({ length: MAX_CASES_PER_WORKFLOW_RUN + 1 }, (_, i) => `case-${i}`),
            inputs: {},
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 when inputs is missing', async () => {
        await supertestWithoutAuth
          .post('/s/space1/internal/cases/workflows/some-workflow-id/run')
          .auth(secAllWorkflowExecuteUser.username, secAllWorkflowExecuteUser.password)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({ caseIds: ['case-1'] })
          .expect(400);
      });

      it('returns 400 for an unknown top-level field (strict schema)', async () => {
        await supertestWithoutAuth
          .post('/s/space1/internal/cases/workflows/some-workflow-id/run')
          .auth(secAllWorkflowExecuteUser.username, secAllWorkflowExecuteUser.password)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({ caseIds: ['case-1'], inputs: {}, unknown_field: true })
          .expect(400);
      });

      it('returns 400 for an unknown origin type', async () => {
        await supertestWithoutAuth
          .post('/s/space1/internal/cases/workflows/some-workflow-id/run')
          .auth(secAllWorkflowExecuteUser.username, secAllWorkflowExecuteUser.password)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({
            caseIds: ['case-1'],
            inputs: {},
            origin: { type: 'cases.unknown', caseId: 'case-1' },
          })
          .expect(400);
      });

      it('returns 400 for an extra property inside origin (strict union members)', async () => {
        await supertestWithoutAuth
          .post('/s/space1/internal/cases/workflows/some-workflow-id/run')
          .auth(secAllWorkflowExecuteUser.username, secAllWorkflowExecuteUser.password)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'foo')
          .send({
            caseIds: ['case-1'],
            inputs: {},
            origin: { type: 'cases.case', caseId: 'case-1', extra: true },
          })
          .expect(400);
      });
    });

    // -----------------------------------------------------------------------
    // Origin / alert-membership validation (400)
    // -----------------------------------------------------------------------

    describe('origin and alert-membership validation', () => {
      it('returns 400 when origin is present but caseIds has more than one entry', async () => {
        // Both cases must exist and be authorized: the cases authorization check runs before
        // the origin/multi-case guard, so unknown ids would return 403 (oracle hardening).
        const [caseA, caseB] = await Promise.all([
          createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            { user: superUser, space: 'space1' }
          ),
          createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            { user: superUser, space: 'space1' }
          ),
        ]);

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [caseA.id, caseB.id],
            inputs: {},
            origin: { type: 'cases.case', caseId: caseA.id },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it("returns 400 when origin.caseId doesn't match caseIds[0]", async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {},
            origin: { type: 'cases.case', caseId: 'different-id' },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it("returns 400 when the observable origin's observableId is not on the case", async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {},
            origin: {
              type: 'cases.observable',
              caseId: theCase.id,
              observableId: 'non-existent-observable-id',
            },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 for a singular alert attachment origin with no selected alerts', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {},
            origin: {
              type: 'cases.attachment',
              caseId: theCase.id,
              attachmentType: 'security.alert',
              attachmentId: 'test-id',
            },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 for a bulk alert attachment origin with no selected alerts', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {},
            origin: {
              type: 'cases.attachments',
              caseId: theCase.id,
              attachmentType: 'security.alert',
              attachmentIds: ['test-id'],
            },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 when alert inputs are provided with no origin (bulk run path)', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await createComment({
          supertest: supertestWithoutAuth,
          caseId: theCase.id,
          params: postCommentAlertReq,
          auth: { user: superUser, space: 'space1' },
        });

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {
              event: {
                alertIds: [{ _id: postCommentAlertReq.alertId, _index: postCommentAlertReq.index }],
              },
            },
            // no origin → bulk path rejects alert inputs
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 when a selected alert is not attached to the case', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        // No alert comment is created, so the membership check must reject it.
        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {
              event: {
                alertIds: [{ _id: 'test-id', _index: 'test-index' }],
              },
            },
            origin: {
              type: 'cases.attachments',
              caseId: theCase.id,
              attachmentType: 'security.alert',
              attachmentIds: ['test-id'],
            },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 when the attachment target belongs to a different case', async () => {
        const [targetCase, otherCase] = await Promise.all([
          createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            { user: superUser, space: 'space1' }
          ),
          createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            { user: superUser, space: 'space1' }
          ),
        ]);

        await createComment({
          supertest: supertestWithoutAuth,
          caseId: otherCase.id,
          params: postCommentAlertReq,
          auth: { user: superUser, space: 'space1' },
        });

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [targetCase.id],
            inputs: {
              event: {
                alertIds: [{ _id: postCommentAlertReq.alertId, _index: postCommentAlertReq.index }],
              },
            },
            origin: {
              type: 'cases.attachment',
              caseId: targetCase.id,
              attachmentType: 'security.alert',
              attachmentId: postCommentAlertReq.alertId as string,
            },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 when the attachment type does not match the stored target', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await createComment({
          supertest: supertestWithoutAuth,
          caseId: theCase.id,
          params: postCommentAlertReq,
          auth: { user: superUser, space: 'space1' },
        });

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {
              event: {
                alertIds: [{ _id: postCommentAlertReq.alertId, _index: postCommentAlertReq.index }],
              },
            },
            origin: {
              type: 'cases.attachment',
              caseId: theCase.id,
              attachmentType: 'security.event',
              attachmentId: postCommentAlertReq.alertId as string,
            },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 when the attachment target is not among the selected alerts', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await createComment({
          supertest: supertestWithoutAuth,
          caseId: theCase.id,
          params: postCommentAlertReq,
          auth: { user: superUser, space: 'space1' },
        });

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            inputs: {
              event: {
                alertIds: [{ _id: postCommentAlertReq.alertId, _index: postCommentAlertReq.index }],
              },
            },
            origin: {
              type: 'cases.attachment',
              caseId: theCase.id,
              attachmentType: 'security.alert',
              attachmentId: 'different-alert-id',
            },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 when inputs.event.alertIds is not an array', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            // inputs.event.alertIds is a string — rejected by parseSelectedAlertPairs at runtime.
            inputs: { event: { alertIds: 'not-an-array' } },
            origin: {
              type: 'cases.attachments',
              caseId: theCase.id,
              attachmentType: 'security.alert',
              attachmentIds: ['test-id'],
            },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });

      it('returns 400 when an alertIds entry is missing _index', async () => {
        const theCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          { user: superUser, space: 'space1' }
        );

        await runCaseWorkflow({
          supertest: supertestWithoutAuth,
          workflowId: enabledWorkflowId,
          params: {
            caseIds: [theCase.id],
            // _index is missing — rejected by parseSelectedAlertPairs at runtime.
            inputs: { event: { alertIds: [{ _id: 'test-id' }] } },
            origin: {
              type: 'cases.attachments',
              caseId: theCase.id,
              attachmentType: 'security.alert',
              attachmentIds: ['test-id'],
            },
          },
          expectedHttpCode: 400,
          auth: { user: secAllWorkflowExecuteUser, space: 'space1' },
        });
      });
    });
  });
};
